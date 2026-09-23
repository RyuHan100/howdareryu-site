#!/usr/bin/env python3
"""키워드 뉴스 클리핑 — 네이버 뉴스 검색(NAVER API HUB) + Google News RSS → Quartz 마크다운 (howdareryu.com/news)

매일 1회 실행:
  1. keywords.yml 의 키워드별로 네이버 뉴스(국내), Google News RSS(국내 ko-KR / 해외 en-US) 검색
     네이버는 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 있을 때만 (없으면 Google 만으로 동작)
  2. 최근 N시간 기사만 남기고, 지난 14일 클리핑(data/daily/*.json)에 이미 실린 기사·같은 제목은 제외
  3. 같은 기사를 다룬 여러 매체 보도는 제목 유사도로 묶어 "관련 보도"로 접음
  4. content/radar/news/YYYY/YYYY-MM-DD.md (그날 클리핑) + content/radar/news/index.md (최신 + 목록) 생성
  5. 결과를 GITHUB_OUTPUT(changed, count, summary)에 기록

같은 날 다시 실행하면 그날 파일에 새 기사만 덧붙여 다시 렌더링한다(멱등).
모든 요청이 실패하면 아무 파일도 건드리지 않고 exit 2.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import yaml

KST = timezone(timedelta(hours=9))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
RSS_BASE = "https://news.google.com/rss/search"
NAVER_API = "https://naverapihub.apigw.ntruss.com/search/v1/news"   # 네이버 클라우드 플랫폼 NAVER API HUB (검색 > 뉴스)
NAVER_ENV_FILE = Path.home() / ".config" / "news_clipping" / ".env"   # 로컬 실행용. 볼트 밖에 둔다
EDITIONS = {
    "ko": {"hl": "ko", "gl": "KR", "ceid": "KR:ko"},
    "en": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
}
LANG_LABEL = {"ko": "국내", "en": "해외"}

DEFAULT_SETTINGS = {
    "page_title": "News",
    "lookback_hours": 48,       # 이 시간 안에 발행된 기사만
    "max_per_keyword": 12,      # 키워드·언어별 최대 묶음 수
    "similarity": 0.4,          # 제목 유사도(0~1)가 이 값 이상이면 같은 기사로 묶음
    "seen_days": 14,            # 이미 실은 기사 기억 기간
    "archive_list_days": 30,    # index 의 '지난 클리핑' 목록 길이
    "request_delay": 1.0,       # 요청 사이 간격(초)
    "naver_pages": 2,           # 네이버 검색어당 최대 페이지(100건/쪽). 기간을 벗어나면 일찍 멈춤
    "show_snippet": True,       # 네이버가 주는 본문 발췌를 대표 기사 아래에 표시
    "snippet_chars": 110,
    "report_terms": ["보고서", "리포트", "백서", "report", "outlook", "white paper", "working paper", "policy brief"],
    "exclude_terms": [],        # 제목에 들어 있으면 버림
    "exclude_sources": [],      # 이 매체는 버림
    "priority_sources": [],     # 묶음의 대표 기사로 우선할 매체
}


# ---------------------------------------------------------------- 설정

def load_config(path: Path) -> tuple[dict, list[dict]]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    settings = {**DEFAULT_SETTINGS, **(raw.get("settings") or {})}
    keywords = [normalize_keyword(k) for k in (raw.get("keywords") or [])]
    if not keywords:
        raise SystemExit(f"{path}: keywords 가 비어 있습니다")
    return settings, keywords


def normalize_must(raw) -> list[list[str]]:
    """must: [a, b] (a 또는 b 아무거나) 또는 must: [[a, b], [c, d]] (그룹 간 AND, 그룹 안은 OR).
    평평한 리스트는 그룹 하나로 감싼다 — 기존 설정과 그대로 호환."""
    groups = list(raw or [])
    if groups and not isinstance(groups[0], list):
        groups = [groups]
    return groups


def normalize_keyword(k) -> dict:
    """'국문 / 영문' 은 한 키워드로 묶어 국내판·해외판을 각각 검색한다.
    짝이 없는 문자열은 국내판에서 검색하고, 한글이 없으면 해외판에서도 검색한다."""
    if isinstance(k, str) and " / " in k:
        ko, en = (part.strip() for part in k.split(" / ", 1))
        return {"name": f"{ko} / {en}", "ko": ko, "en": en, "naver": [ko], "must": [], "must_in": "title"}
    if isinstance(k, str):
        has_hangul = re.search(r"[가-힣]", k) is not None
        return {"name": k, "ko": k, "en": None if has_hangul else k, "naver": [k], "must": [], "must_in": "title"}
    name = k.get("name") or k.get("ko") or k.get("en")
    if not name:
        raise SystemExit(f"keywords 항목에 name/ko/en 중 하나는 있어야 합니다: {k}")
    naver = k.get("naver", k.get("ko"))        # 없으면 ko 검색어를 네이버 문법(OR → |)으로
    if isinstance(naver, str):
        naver = [naver.replace(" OR ", " | ")]
    return {"name": str(name), "ko": k.get("ko"), "en": k.get("en"), "naver": list(naver or []),
            "must": normalize_must(k.get("must")), "must_in": k.get("must_in", "title")}


# ---------------------------------------------------------------- 수집

def build_url(query: str, lang: str, lookback_hours: int) -> str:
    days = max(1, math.ceil(lookback_hours / 24))
    params = {"q": f"{query} when:{days}d", **EDITIONS[lang]}
    return f"{RSS_BASE}?{urllib.parse.urlencode(params)}"


def build_naver_url(query: str, start: int = 1) -> str:
    return f"{NAVER_API}?{urllib.parse.urlencode({'query': query, 'display': 100, 'start': start, 'sort': 'date'})}"


def fetch(url: str, headers: dict | None = None, timeout: int = 20, retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, application/json",
                                                       **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403):       # 키 오류·잘못된 검색어는 다시 해도 같다
                raise RuntimeError(f"HTTP {e.code}: {e.read()[:200].decode('utf-8', 'replace')}") from e
            last = e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch 실패: {last}")


def parse_rss(xml_bytes: bytes, lang: str, keyword: str) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not title or not link:
            continue
        src = it.find("source")
        source = (src.text or "").strip() if src is not None else ""
        source_url = src.get("url", "") if src is not None else ""
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3].strip()
        try:
            published = parsedate_to_datetime(it.findtext("pubDate") or "").astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        items.append({
            "key": item_key(title, source, source_url),
            "title": title,
            "source": source,
            "source_url": source_url,
            "link": link,
            "published": published.isoformat(timespec="seconds"),
            "lang": lang,
            "keyword": keyword,
            "also": [],
            "via": "google",
            "description": "",
        })
    return items


def strip_tags(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def parse_naver(json_bytes: bytes, keyword: str) -> list[dict]:
    """네이버는 매체명을 주지 않는다 → 일단 원문 도메인을 매체명으로 두고, 나중에 resolve_sources 가 이름으로 바꾼다."""
    items = []
    for it in json.loads(json_bytes).get("items", []):
        title = strip_tags(it.get("title", ""))
        link = it.get("originallink") or it.get("link") or ""
        if not title or not link:
            continue
        try:
            published = parsedate_to_datetime(it.get("pubDate", "")).astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        items.append({
            "key": item_key(title, "", link),
            "title": title,
            "source": domain_of(link),
            "source_url": link,
            "link": link,
            "published": published.isoformat(timespec="seconds"),
            "lang": "ko",
            "keyword": keyword,
            "also": [],
            "via": "naver",
            "description": strip_tags(it.get("description", "")),
        })
    return items


def domain_of(url: str) -> str:
    host = urllib.parse.urlsplit(url).netloc.lower().split(":")[0]
    return re.sub(r"^(www|m|mobile)\.", "", host)


def has_term(title: str, term: str) -> bool:
    """영문·약어는 단어 단위로(AI ≠ daily, ESS ≠ business; 복수형 s 는 허용), 한글은 부분 일치로."""
    title, term = title.lower(), term.lower()
    if term.isascii():
        return re.search(rf"(?<![a-z]){re.escape(term)}(?:s|es)?(?![a-z])", title) is not None
    return term in title


def norm_title(title: str) -> str:
    t = re.sub(r"[\[\(【<][^\]\)】>]{1,12}[\]\)】>]", "", title)   # [단독] (종합) 등
    return re.sub(r"[\W_]+", "", t.lower())


def item_key(title: str, source: str, source_url: str = "") -> str:
    """제목 + 매체 도메인. 같은 기사가 네이버·Google 양쪽에서 잡혀도 같은 키가 된다."""
    outlet = domain_of(source_url) or source.lower()
    return hashlib.sha1(f"{norm_title(title)}|{outlet}".encode()).hexdigest()[:16]


def title_sig(title: str) -> tuple[str, bool]:
    """(정규화한 제목, 잘린 제목인지). 네이버는 긴 제목을 '...' 로 자른다."""
    t = title.rstrip()
    cut = t.endswith(("...", "…"))
    return norm_title(t.rstrip(".…")), cut


def same_title(a: tuple[str, bool], b: tuple[str, bool]) -> bool:
    return a[0] == b[0] or (a[1] and b[0].startswith(a[0])) or (b[1] and a[0].startswith(b[0]))


def merge_truncated(items: list[dict]) -> list[dict]:
    """네이버의 잘린 제목과 같은 매체의 Google 기사를 합친다: 네이버 쪽(원문 링크·발췌)을 남기고 제목은 온전한 것으로."""
    googles = [(title_sig(g["title"]), domain_of(g["source_url"]), g) for g in items if g["via"] == "google"]
    dropped: set[int] = set()
    for n in items:
        sig = title_sig(n["title"])
        if n["via"] != "naver" or not sig[1]:
            continue
        for g_sig, g_domain, g in googles:
            if id(g) not in dropped and g_domain == domain_of(n["source_url"]) and same_title(sig, g_sig):
                n["title"] = g["title"]
                n["key"] = item_key(n["title"], n["source"], n["source_url"])
                n["also"] += [k for k in [g["keyword"], *g["also"]] if k != n["keyword"] and k not in n["also"]]
                dropped.add(id(g))
                break
    return [i for i in items if id(i) not in dropped]


def collect(keywords: list[dict], settings: dict, now: datetime, fetcher=fetch,
            naver_headers: dict | None = None, known_sources: dict | None = None) -> tuple[list[dict], list[str], int]:
    """→ (기사 목록, 오류 메시지, 성공한 요청 수). 여러 키워드에 걸린 기사는 첫 키워드에 두고 also 에 나머지를 적는다.
    네이버를 먼저 모은다: 같은 기사가 양쪽에서 잡히면 원문 직접 링크와 발췌가 있는 네이버 쪽을 남긴다."""
    cutoff = now - timedelta(hours=settings["lookback_hours"])
    exclude_terms = settings["exclude_terms"]
    exclude_sources = {s.lower() for s in settings["exclude_sources"]}
    by_key: dict[str, dict] = {}
    errors: list[str] = []
    done = {"requests": 0, "ok": 0}
    known = known_sources if known_sources is not None else {}

    def get(url: str, headers: dict | None = None) -> bytes:
        if done["requests"]:
            time.sleep(settings["request_delay"])
        done["requests"] += 1
        body = fetcher(url, headers)
        done["ok"] += 1
        return body

    def add(found: list[dict], kw: dict) -> None:
        for item in found:
            if item["via"] == "google" and item["source"] and item["source_url"]:
                known[domain_of(item["source_url"])] = item["source"]     # 걸러질 기사에서도 매체명은 배운다
            if datetime.fromisoformat(item["published"]) < cutoff:
                continue
            if any(has_term(item["title"], t) for t in exclude_terms) or item["source"].lower() in exclude_sources:
                continue
            text = f"{item['title']} {item['description']}" if kw["must_in"] == "text" else item["title"]
            if kw["must"] and not all(any(has_term(text, m) for m in group) for group in kw["must"]):
                continue
            first = by_key.get(item["key"])
            if first is None:
                by_key[item["key"]] = item
            elif kw["name"] != first["keyword"] and kw["name"] not in first["also"]:
                first["also"].append(kw["name"])

    for kw in keywords:
        for query in kw["naver"] if naver_headers else []:
            try:
                for page in range(settings["naver_pages"]):
                    found = parse_naver(get(build_naver_url(query, 1 + 100 * page), naver_headers), kw["name"])
                    add(found, kw)
                    if len(found) < 100 or min(datetime.fromisoformat(f["published"]) for f in found) < cutoff:
                        break
            except Exception as e:  # noqa: BLE001 — 한 검색어의 실패가 전체를 멈추지 않게
                errors.append(f"{kw['name']}(네이버 '{query}'): {e}")
        for lang in ("ko", "en"):
            query = kw.get(lang)
            if not query:
                continue
            try:
                add(parse_rss(get(build_url(query, lang, settings["lookback_hours"])), lang, kw["name"]), kw)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{kw['name']}(Google {LANG_LABEL[lang]}): {e}")
    items = merge_truncated(list(by_key.values()))
    for i in items:     # 네이버 기사의 매체명: Google 에서 배운 '도메인 → 매체명'(data/sources.json), 모르면 도메인 그대로
        if i["via"] == "naver":
            i["source"] = known.get(domain_of(i["source_url"]), i["source"])
    return items, errors, done["ok"]


def drop_same_outlet_dupes(items: list[dict], existing: list[dict]) -> list[dict]:
    """키는 다르지만(모바일·섹션 도메인, 잘린 제목) 같은 매체의 같은 제목인 기사."""
    taken = [(title_sig(i["title"]), i["source"].lower()) for i in existing]
    out = []
    for i in items:
        sig, outlet = title_sig(i["title"]), i["source"].lower()
        if not any(o == outlet and same_title(sig, t) for t, o in taken):
            taken.append((sig, outlet))
            out.append(i)
    return out


def load_seen(daily_dir: Path, today: str, keep_from: str) -> tuple[set[str], list[tuple[str, bool]]]:
    """지난 클리핑에 실린 (기사 키, 제목). 다른 매체가 다음 날 같은 제목으로 받아쓴 기사도 걸러진다.
    저장 상한을 넘겨 걸러낸(skipped) 기사도 포함 — 다음 날 다시 '새 기사'로 올라오지 않게."""
    keys: set[str] = set()
    titles: dict[tuple[str, bool], None] = {}
    for p in daily_dir.glob("*.json"):
        if keep_from <= p.stem < today:
            day = load_json(p, {"items": [], "skipped": []})
            for i in day["items"] + day.get("skipped", []):
                keys.add(item_key(i["title"], i["source"], i.get("source_url", "")))
                titles[title_sig(i["title"])] = None
    return keys, list(titles)


def is_seen(item: dict, keys: set[str], titles: list[tuple[str, bool]], exact: set[str]) -> bool:
    sig = title_sig(item["title"])
    if item["key"] in keys or sig[0] in exact:
        return True
    return any(same_title(sig, t) for t in titles if t[1] or sig[1])      # 잘린 제목이 낀 경우만 앞부분 비교


# ---------------------------------------------------------------- 묶기

def trigrams(title: str) -> set[str]:
    t = norm_title(title)
    return {t[i:i + 3] for i in range(len(t) - 2)} or {t}


def similarity(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def cluster(items: list[dict], threshold: float, priority_sources: list[str]) -> list[list[dict]]:
    """제목이 비슷한 기사를 묶는다. 각 묶음의 첫 항목이 대표 기사. 보도량 많은 순 → 최신순."""
    priority = {s.lower(): i for i, s in enumerate(priority_sources)}
    clusters: list[tuple[list[set[str]], list[dict]]] = []
    for item in sorted(items, key=lambda x: x["published"]):
        grams = trigrams(item["title"])
        for member_grams, members in clusters:
            if any(similarity(grams, g) >= threshold for g in member_grams):
                member_grams.append(grams)
                members.append(item)
                break
        else:
            clusters.append(([grams], [item]))
    out = []
    for _, members in clusters:
        members.sort(key=lambda x: (priority.get(x["source"].lower(), len(priority)), x["published"]))
        out.append(members)
    out.sort(key=lambda m: (len(m), max(x["published"] for x in m)), reverse=True)
    return out


def is_report(item: dict, terms: list[str]) -> bool:
    return any(has_term(item["title"], t) for t in terms)


# ---------------------------------------------------------------- 저장 상한

def cap_stored_items(items: list[dict], settings: dict) -> tuple[list[dict], list[dict]]:
    """리포트는 상한 없이 모두 남기고, 나머지는 키워드·국내/해외별로 cluster() 상위
    max_per_keyword 묶음(관련 보도 포함)만 저장한다 — 화면(render_body)에 실제로 보이는
    분량과 저장량을 맞춰 파일을 가볍게 유지한다. → (남길 항목, 상한을 넘겨 걸러낸 항목)"""
    reports = [i for i in items if is_report(i, settings["report_terms"])]
    report_keys = {i["key"] for i in reports}
    rest = [i for i in items if i["key"] not in report_keys]
    kept = list(reports)
    skipped: list[dict] = []
    for name in {i["keyword"] for i in rest}:
        for lang in ("ko", "en"):
            group = [i for i in rest if i["keyword"] == name and i["lang"] == lang]
            if not group:
                continue
            clusters = cluster(group, settings["similarity"], settings["priority_sources"])
            for members in clusters[: settings["max_per_keyword"]]:
                kept += members
            for members in clusters[settings["max_per_keyword"]:]:
                skipped += members
    return kept, skipped


# ---------------------------------------------------------------- 렌더링

def esc(s: str) -> str:
    """제목이 마크다운/Obsidian 문법(링크, 태그, 하이라이트, 수식, 표)으로 해석되지 않게."""
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"([\\\[\]|#$<>*_`~=])", r"\\\1", s)


def fmt_time(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(KST).strftime("%m-%d %H:%M")


def render_cluster(members: list[dict], show_keyword: bool = False, snippet_chars: int = 0) -> list[str]:
    rep = members[0]
    tags = ([rep["keyword"]] if show_keyword else []) + rep["also"]
    tail = f" · {' · '.join(esc(t) for t in tags)}" if tags else ""
    lines = [f"- [{esc(rep['title'])}]({rep['link']}) — **{esc(rep['source']) or '출처 미상'}** · {fmt_time(rep['published'])}{tail}"]
    snippet = re.sub(r"\s+", " ", rep.get("description", "")).strip()
    if snippet_chars and snippet:
        lines.append(f"  - {esc(snippet[:snippet_chars])}{'…' if len(snippet) > snippet_chars else ''}")
    if len(members) > 1:
        related = ", ".join(f"[{esc(m['source']) or '링크'}]({m['link']})" for m in members[1:])
        lines.append(f"  - 관련 보도 {len(members) - 1}건: {related}")
    return lines


def render_body(items: list[dict], keywords: list[dict], settings: dict) -> str:
    if not items:
        return "새로 잡힌 기사가 없습니다.\n"
    reports = [i for i in items if is_report(i, settings["report_terms"])]
    report_keys = {i["key"] for i in reports}
    rest = [i for i in items if i["key"] not in report_keys]
    snip = settings["snippet_chars"] if settings["show_snippet"] else 0
    out: list[str] = []

    def section(title: str) -> list[str]:       # 키워드 문단 사이에 구분선
        return (["---", ""] if out else []) + [f"## {title}", ""]

    if reports:
        out += section("📄 리포트·보고서")
        for members in cluster(reports, settings["similarity"], settings["priority_sources"]):
            out += render_cluster(members, show_keyword=True, snippet_chars=snip)
        out.append("")

    names = [k["name"] for k in keywords]
    names += sorted({i["keyword"] for i in rest} - set(names))   # 설정에서 빠진 키워드의 기존 기사
    for name in names:
        mine = [i for i in rest if i["keyword"] == name]
        if not mine:
            continue
        out += section(esc(name))
        for lang in ("ko", "en"):
            group = [i for i in mine if i["lang"] == lang]
            if not group:
                continue
            clusters = cluster(group, settings["similarity"], settings["priority_sources"])
            shown = clusters[: settings["max_per_keyword"]]
            out += [f"### {LANG_LABEL[lang]} · {len(group)}건", ""]
            for members in shown:
                out += render_cluster(members, snippet_chars=snip)
            if len(clusters) > len(shown):
                out.append(f"- …외 {len(clusters) - len(shown)}건 생략")
            out.append("")
    return "\n".join(out).rstrip() + "\n"


def count_line(items: list[dict]) -> str:
    ko = sum(1 for i in items if i["lang"] == "ko")
    return f"기사 **{len(items)}건** (국내 {ko} · 해외 {len(items) - ko})"


def source_line(naver_on: bool) -> str:
    naver = "네이버 뉴스 검색 · " if naver_on else ""
    return f"{naver}Google News 검색(국내 ko-KR · 해외 en-US)"


def via_counts(items: list[dict]) -> str:
    naver = sum(1 for i in items if i.get("via") == "naver")
    return f"네이버 {naver} · Google {len(items) - naver}"


def front_matter(title: str, description: str, date: str, modified: datetime) -> str:
    return "\n".join([
        "---",
        f"title: {json.dumps(title, ensure_ascii=False)}",
        f"description: {json.dumps(description, ensure_ascii=False)}",
        "tags: [뉴스클리핑]",
        f"date: {date}",
        f"modified: {modified.strftime('%Y-%m-%dT%H:%M+09:00')}",
        "---",
        "",
    ])


def render_day(date: str, items: list[dict], keywords: list[dict], settings: dict, now: datetime,
               slug_root: str, prev_date: str | None, errors: list[str]) -> str:
    nav = [f"[[{slug_root}/index|목록]]"]
    if prev_date:
        nav.insert(0, f"[[{slug_root}/{prev_date[:4]}/{prev_date}|← {prev_date}]]")
    head = front_matter(f"{date} 뉴스 클리핑", f"{date} 키워드 뉴스 클리핑 — {len(items)}건", date, now)
    head += f"> {count_line(items)} · 수집 {now.strftime('%Y-%m-%d %H:%M')} KST · {' · '.join(nav)}\n\n"
    return head + render_body(items, keywords, settings) + render_errors(errors)


def render_errors(errors: list[str]) -> str:
    if not errors:
        return ""
    return "\n> [!warning]- 수집 실패 " + f"{len(errors)}건\n" + "".join(f"> - {esc(e)}\n" for e in errors)


def render_index(latest_date: str | None, latest_items: list[dict], keywords: list[dict], settings: dict,
                 now: datetime, slug_root: str, archive: list[tuple[str, int]], errors: list[str],
                 naver_on: bool = False) -> str:
    kw_names = " · ".join(esc(k["name"]) for k in keywords)
    head = front_matter(settings["page_title"],
                        "키워드 기반 국내외 주요 기사·리포트 클리핑. 매일 자동 갱신.",
                        now.strftime("%Y-%m-%d"), now)
    head += (f"> 출처: {source_line(naver_on)} · 마지막 확인: **{now.strftime('%Y-%m-%d %H:%M')} KST**  \n"
             f"> 키워드: {kw_names}\n\n")
    if latest_date:
        head += (f"> [!example] [[{slug_root}/{latest_date[:4]}/{latest_date}|{latest_date} 클리핑]] — {count_line(latest_items)}\n"
                 f"> 비슷한 제목의 보도는 하나로 묶고 나머지는 '관련 보도'로 접었습니다. 한 번 실린 기사나 같은 제목의 기사는 다음 날 다시 나오지 않습니다.\n\n")
    body = render_body(latest_items, keywords, settings) if latest_date else "아직 수집된 클리핑이 없습니다.\n"
    tail = ""
    if archive:
        tail = "\n## 지난 클리핑\n\n" + "".join(
            f"- [[{slug_root}/{d[:4]}/{d}|{d}]] — {n}건\n" for d, n in archive)
        tail += "\n이전 기록은 왼쪽 Explorer 의 연도 폴더에서 볼 수 있습니다.\n"
    return head + body + render_errors(errors) + tail


# ---------------------------------------------------------------- 저장

def load_json(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def dump_json(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def set_output(name: str, value: str) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")


def naver_credentials() -> dict | None:
    env = dict(os.environ)
    if NAVER_ENV_FILE.exists():
        for line in NAVER_ENV_FILE.read_text(encoding="utf-8").splitlines():
            name, sep, value = line.partition("=")
            if sep and not name.strip().startswith("#"):
                env.setdefault(name.strip(), value.strip().strip("'\""))
    cid, secret = env.get("NAVER_CLIENT_ID"), env.get("NAVER_CLIENT_SECRET")
    return {"X-NCP-APIGW-API-KEY-ID": cid, "X-NCP-APIGW-API-KEY": secret} if cid and secret else None


def run(site_root: Path, page_dir: str, config: Path, now: datetime, dry_run: bool = False, fetcher=fetch,
        naver_headers: dict | None = None) -> int:
    settings, keywords = load_config(config)
    root = site_root / page_dir
    daily_dir = root / "data" / "daily"
    slug_root = Path(page_dir).relative_to("content").as_posix() if page_dir.startswith("content") else Path(page_dir).name
    today = now.strftime("%Y-%m-%d")

    known_sources: dict[str, str] = load_json(root / "data" / "sources.json", {})
    fetched, errors, ok = collect(keywords, settings, now.astimezone(timezone.utc), fetcher, naver_headers, known_sources)
    if errors and not ok:
        print("모든 요청이 실패했습니다. 파일을 건드리지 않습니다.", *errors, sep="\n  ", file=sys.stderr)
        set_output("status", "fetch-failed")
        return 2

    keep_from = (now - timedelta(days=settings["seen_days"])).strftime("%Y-%m-%d")
    seen_keys, seen_titles = load_seen(daily_dir, today, keep_from)
    seen_exact = {t[0] for t in seen_titles}
    day = load_json(daily_dir / f"{today}.json", {"date": today, "items": [], "skipped": []})
    for i in day["items"] + day.get("skipped", []):      # 예전 형식으로 저장된 항목도 지금 기준의 키로
        i["key"] = item_key(i["title"], i["source"], i.get("source_url", ""))
    before_item_keys = {i["key"] for i in day["items"]}
    before_skipped_keys = {i["key"] for i in day.get("skipped", [])}
    new = [i for i in fetched if i["key"] not in before_item_keys and i["key"] not in before_skipped_keys
           and not is_seen(i, seen_keys, seen_titles, seen_exact)]
    new = drop_same_outlet_dupes(new, day["items"])
    day["items"] += new
    day["items"], overflow = cap_stored_items(day["items"], settings)   # 상한 재적용(새 기사가 기존 묶음을 밀어낼 수 있음)
    day["skipped"] = day.get("skipped", []) + [i for i in overflow if i["key"] not in before_skipped_keys]
    day["generated_at"] = now.isoformat(timespec="seconds")

    after_item_keys = {i["key"] for i in day["items"]}
    after_skipped_keys = {i["key"] for i in day["skipped"]}
    added = len(after_item_keys - before_item_keys)
    changed = after_item_keys != before_item_keys or after_skipped_keys != before_skipped_keys

    summary = (f"{today} 신규 {len(new)}건 발견 · 저장 {added}건 [{via_counts(new)}] (당일 누계 {len(day['items'])}건"
               + (f", 상한 초과 {len(overflow)}건 제외" if overflow else "") + ")"
               + ("" if naver_headers else ", 네이버 키 없음") + (f", 실패 {len(errors)}건" if errors else ""))
    print(summary)
    for e in errors:
        print("  실패:", e, file=sys.stderr)
    if dry_run:
        print(render_body(day["items"], keywords, settings))
        return 0

    dates = sorted(p.stem for p in daily_dir.glob("*.json"))
    if day["items"]:
        prev = max((d for d in dates if d < today), default=None)
        dump_json(daily_dir / f"{today}.json", day)
        page = root / today[:4] / f"{today}.md"
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(render_day(today, day["items"], keywords, settings, now, slug_root, prev, errors), encoding="utf-8")
        dates = sorted(set(dates) | {today})
    dump_json(root / "data" / "sources.json", dict(sorted(known_sources.items())))

    latest = dates[-1] if dates else None
    latest_items = load_json(daily_dir / f"{latest}.json", {"items": []})["items"] if latest else []
    older = sorted((d for d in dates if d != latest), reverse=True)[: settings["archive_list_days"]]
    archive = [(d, len(load_json(daily_dir / f"{d}.json", {"items": []})["items"])) for d in older]
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.md").write_text(
        render_index(latest, latest_items, keywords, settings, now, slug_root, archive, errors,
                     naver_on=bool(naver_headers)), encoding="utf-8")

    set_output("status", "ok")
    set_output("changed", "true" if changed else "false")
    set_output("count", str(added))
    set_output("summary", summary)
    return 0


def main() -> int:
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site-root", default=".", help="Quartz 저장소 루트 (기본: 현재 디렉터리)")
    ap.add_argument("--page-dir", default="content/radar/news", help="클리핑을 쓸 폴더 (site-root 기준)")
    ap.add_argument("--config", default=str(here / "keywords.yml"), help="키워드 설정 파일")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 출력")
    args = ap.parse_args()
    naver_headers = naver_credentials()
    if not naver_headers:
        prefix = "::warning::" if os.environ.get("GITHUB_ACTIONS") else ""
        print(f"{prefix}NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없어 네이버 검색을 건너뜁니다 (Google News 만 사용)", file=sys.stderr)
    return run(Path(args.site_root), args.page_dir, Path(args.config), datetime.now(KST), args.dry_run,
               naver_headers=naver_headers)


if __name__ == "__main__":
    sys.exit(main())
