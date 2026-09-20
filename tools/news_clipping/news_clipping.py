#!/usr/bin/env python3
"""키워드 뉴스 클리핑 — Google News RSS → Quartz 마크다운 (howdareryu.com/news)

매일 1회 실행:
  1. keywords.yml 의 키워드별로 Google News RSS(국내 ko-KR / 해외 en-US) 검색
  2. 최근 N시간 기사만 남기고, 이전 실행에서 이미 실은 기사(seen.json)는 제외
  3. 같은 기사를 다룬 여러 매체 보도는 제목 유사도로 묶어 "관련 보도"로 접음
  4. content/news/YYYY/YYYY-MM-DD.md (그날 클리핑) + content/news/index.md (최신 + 목록) 생성
  5. 결과를 GITHUB_OUTPUT(changed, count, summary)에 기록

같은 날 다시 실행하면 그날 파일에 새 기사만 덧붙여 다시 렌더링한다(멱등).
모든 요청이 실패하면 아무 파일도 건드리지 않고 exit 2.
"""
from __future__ import annotations

import argparse
import hashlib
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
EDITIONS = {
    "ko": {"hl": "ko", "gl": "KR", "ceid": "KR:ko"},
    "en": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
}
LANG_LABEL = {"ko": "국내", "en": "해외"}

DEFAULT_SETTINGS = {
    "page_title": "News_radar",
    "lookback_hours": 48,       # 이 시간 안에 발행된 기사만
    "max_per_keyword": 12,      # 키워드·언어별 최대 묶음 수
    "similarity": 0.4,          # 제목 유사도(0~1)가 이 값 이상이면 같은 기사로 묶음
    "seen_days": 14,            # 이미 실은 기사 기억 기간
    "archive_list_days": 30,    # index 의 '지난 클리핑' 목록 길이
    "request_delay": 1.0,       # 요청 사이 간격(초)
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


def normalize_keyword(k) -> dict:
    """'국문 / 영문' 은 한 키워드로 묶어 국내판·해외판을 각각 검색한다.
    짝이 없는 문자열은 국내판에서 검색하고, 한글이 없으면 해외판에서도 검색한다."""
    if isinstance(k, str) and " / " in k:
        ko, en = (part.strip() for part in k.split(" / ", 1))
        return {"name": f"{ko} / {en}", "ko": ko, "en": en, "must": []}
    if isinstance(k, str):
        has_hangul = re.search(r"[가-힣]", k) is not None
        return {"name": k, "ko": k, "en": None if has_hangul else k, "must": []}
    name = k.get("name") or k.get("ko") or k.get("en")
    if not name:
        raise SystemExit(f"keywords 항목에 name/ko/en 중 하나는 있어야 합니다: {k}")
    return {"name": str(name), "ko": k.get("ko"), "en": k.get("en"), "must": list(k.get("must") or [])}


# ---------------------------------------------------------------- 수집

def build_url(query: str, lang: str, lookback_hours: int) -> str:
    days = max(1, math.ceil(lookback_hours / 24))
    params = {"q": f"{query} when:{days}d", **EDITIONS[lang]}
    return f"{RSS_BASE}?{urllib.parse.urlencode(params)}"


def fetch(url: str, timeout: int = 20, retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
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
            "key": item_key(title, source),
            "title": title,
            "source": source,
            "source_url": source_url,
            "link": link,
            "published": published.isoformat(timespec="seconds"),
            "lang": lang,
            "keyword": keyword,
            "also": [],
        })
    return items


def has_term(title: str, term: str) -> bool:
    """영문·약어는 단어 단위로(AI ≠ daily, ESS ≠ business; 복수형 s 는 허용), 한글은 부분 일치로."""
    title, term = title.lower(), term.lower()
    if term.isascii():
        return re.search(rf"(?<![a-z]){re.escape(term)}(?:s|es)?(?![a-z])", title) is not None
    return term in title


def norm_title(title: str) -> str:
    t = re.sub(r"[\[\(【<][^\]\)】>]{1,12}[\]\)】>]", "", title)   # [단독] (종합) 등
    return re.sub(r"[\W_]+", "", t.lower())


def item_key(title: str, source: str) -> str:
    return hashlib.sha1(f"{norm_title(title)}|{source.lower()}".encode()).hexdigest()[:16]


def collect(keywords: list[dict], settings: dict, now: datetime, fetcher=fetch) -> tuple[list[dict], list[str], int]:
    """→ (기사 목록, 오류 메시지, 시도한 요청 수). 여러 키워드에 걸린 기사는 첫 키워드에 두고 also 에 나머지를 적는다."""
    cutoff = now - timedelta(hours=settings["lookback_hours"])
    exclude_terms = settings["exclude_terms"]
    exclude_sources = {s.lower() for s in settings["exclude_sources"]}
    by_key: dict[str, dict] = {}
    errors: list[str] = []
    requests = 0
    for kw in keywords:
        for lang in ("ko", "en"):
            query = kw.get(lang)
            if not query:
                continue
            if requests:
                time.sleep(settings["request_delay"])
            requests += 1
            try:
                found = parse_rss(fetcher(build_url(query, lang, settings["lookback_hours"])), lang, kw["name"])
            except Exception as e:  # noqa: BLE001 — 한 키워드의 실패가 전체를 멈추지 않게
                errors.append(f"{kw['name']}({LANG_LABEL[lang]}): {e}")
                continue
            for item in found:
                if datetime.fromisoformat(item["published"]) < cutoff:
                    continue
                if any(has_term(item["title"], t) for t in exclude_terms) or item["source"].lower() in exclude_sources:
                    continue
                if kw["must"] and not any(has_term(item["title"], m) for m in kw["must"]):
                    continue
                first = by_key.get(item["key"])
                if first is None:
                    by_key[item["key"]] = item
                elif kw["name"] != first["keyword"] and kw["name"] not in first["also"]:
                    first["also"].append(kw["name"])
    return list(by_key.values()), errors, requests


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


# ---------------------------------------------------------------- 렌더링

def esc(s: str) -> str:
    """제목이 마크다운/Obsidian 문법(링크, 태그, 하이라이트, 수식, 표)으로 해석되지 않게."""
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"([\\\[\]|#$<>*_`~=])", r"\\\1", s)


def fmt_time(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(KST).strftime("%m-%d %H:%M")


def render_cluster(members: list[dict], show_keyword: bool = False) -> list[str]:
    rep = members[0]
    tags = ([rep["keyword"]] if show_keyword else []) + rep["also"]
    tail = f" · {' · '.join(esc(t) for t in tags)}" if tags else ""
    lines = [f"- [{esc(rep['title'])}]({rep['link']}) — **{esc(rep['source']) or '출처 미상'}** · {fmt_time(rep['published'])}{tail}"]
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
    out: list[str] = []

    if reports:
        out += ["## 📄 리포트·보고서", ""]
        for members in cluster(reports, settings["similarity"], settings["priority_sources"]):
            out += render_cluster(members, show_keyword=True)
        out.append("")

    names = [k["name"] for k in keywords]
    names += sorted({i["keyword"] for i in rest} - set(names))   # 설정에서 빠진 키워드의 기존 기사
    for name in names:
        mine = [i for i in rest if i["keyword"] == name]
        if not mine:
            continue
        out += [f"## {esc(name)}", ""]
        for lang in ("ko", "en"):
            group = [i for i in mine if i["lang"] == lang]
            if not group:
                continue
            clusters = cluster(group, settings["similarity"], settings["priority_sources"])
            shown = clusters[: settings["max_per_keyword"]]
            out += [f"### {LANG_LABEL[lang]} · {len(group)}건", ""]
            for members in shown:
                out += render_cluster(members)
            if len(clusters) > len(shown):
                out.append(f"- …외 {len(clusters) - len(shown)}건 생략")
            out.append("")
    return "\n".join(out).rstrip() + "\n"


def count_line(items: list[dict]) -> str:
    ko = sum(1 for i in items if i["lang"] == "ko")
    return f"기사 **{len(items)}건** (국내 {ko} · 해외 {len(items) - ko})"


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
                 now: datetime, slug_root: str, archive: list[tuple[str, int]], errors: list[str]) -> str:
    kw_names = " · ".join(esc(k["name"]) for k in keywords)
    head = front_matter(settings["page_title"],
                        "키워드 기반 국내외 주요 기사·리포트 클리핑. 매일 자동 갱신.",
                        now.strftime("%Y-%m-%d"), now)
    head += (f"> 출처: Google News 검색(국내 ko-KR · 해외 en-US) · 마지막 확인: **{now.strftime('%Y-%m-%d %H:%M')} KST**  \n"
             f"> 키워드: {kw_names}\n\n")
    if latest_date:
        head += (f"> [!example] [[{slug_root}/{latest_date[:4]}/{latest_date}|{latest_date} 클리핑]] — {count_line(latest_items)}\n"
                 f"> 비슷한 제목의 보도는 하나로 묶고 나머지는 '관련 보도'로 접었습니다. 한 번 실린 기사는 다음 날 다시 나오지 않습니다.\n\n")
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


def run(site_root: Path, page_dir: str, config: Path, now: datetime, dry_run: bool = False, fetcher=fetch) -> int:
    settings, keywords = load_config(config)
    root = site_root / page_dir
    daily_dir = root / "data" / "daily"
    slug_root = Path(page_dir).relative_to("content").as_posix() if page_dir.startswith("content") else Path(page_dir).name
    today = now.strftime("%Y-%m-%d")

    fetched, errors, requests = collect(keywords, settings, now.astimezone(timezone.utc), fetcher)
    if requests and len(errors) == requests:
        print("모든 요청이 실패했습니다. 파일을 건드리지 않습니다.", *errors, sep="\n  ", file=sys.stderr)
        set_output("status", "fetch-failed")
        return 2

    seen: dict[str, str] = load_json(root / "data" / "seen.json", {})
    day = load_json(daily_dir / f"{today}.json", {"date": today, "items": []})
    day_keys = {i["key"] for i in day["items"]}
    new = [i for i in fetched if i["key"] not in day_keys and seen.get(i["key"], today) == today]
    day["items"] += new
    day["generated_at"] = now.isoformat(timespec="seconds")
    for i in new:
        seen[i["key"]] = today
    keep_from = (now - timedelta(days=settings["seen_days"])).strftime("%Y-%m-%d")
    seen = {k: d for k, d in seen.items() if d >= keep_from}

    summary = f"{today} 신규 {len(new)}건 (당일 누계 {len(day['items'])}건)" + (f", 실패 {len(errors)}건" if errors else "")
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
    dump_json(root / "data" / "seen.json", seen)

    latest = dates[-1] if dates else None
    latest_items = load_json(daily_dir / f"{latest}.json", {"items": []})["items"] if latest else []
    older = sorted((d for d in dates if d != latest), reverse=True)[: settings["archive_list_days"]]
    archive = [(d, len(load_json(daily_dir / f"{d}.json", {"items": []})["items"])) for d in older]
    root.mkdir(parents=True, exist_ok=True)
    (root / "index.md").write_text(
        render_index(latest, latest_items, keywords, settings, now, slug_root, archive, errors), encoding="utf-8")

    set_output("status", "ok")
    set_output("changed", "true" if new else "false")
    set_output("count", str(len(new)))
    set_output("summary", summary)
    return 0


def main() -> int:
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site-root", default=".", help="Quartz 저장소 루트 (기본: 현재 디렉터리)")
    ap.add_argument("--page-dir", default="content/news", help="클리핑을 쓸 폴더 (site-root 기준)")
    ap.add_argument("--config", default=str(here / "keywords.yml"), help="키워드 설정 파일")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 출력")
    args = ap.parse_args()
    return run(Path(args.site_root), args.page_dir, Path(args.config), datetime.now(KST), args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
