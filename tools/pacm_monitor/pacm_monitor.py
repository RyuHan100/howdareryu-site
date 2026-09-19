#!/usr/bin/env python3
"""
PACM(6.4조) 전환 승인 CDM 활동 모니터
=====================================
소스: https://cdm.unfccc.int/ProgrammeOfActivities/deregistered.html
      ("CDM activities transitioned to 6.4" — PoA 표 + PA 표, 7개 컬럼)

동작:
  1. Playwright 로 페이지 HTML 확보 (Incapsula 봇 차단 → 헤드풀 Chrome 우선, 여러 전략 순차 시도)
  2. 표 파싱 → 레코드 목록 (type, ref, registered, title, host/other parties, methodologies, reductions, url)
  3. 이전 스냅샷(latest.json)과 비교 → 신규 / 삭제 / 변경 감지
  4. Quartz 용 마크다운 페이지 + JSON/CSV + changelog 갱신. 최근 변경은 콜아웃 + ==하이라이트== 로 표시
  5. 변경 여부를 GITHUB_OUTPUT(changed=true|false)에 기록, 웹훅(선택) 알림

종료코드: 0 정상(변경 유무 무관) / 2 페이지 확보 실패(데이터 미변경)
"""
from __future__ import annotations
import playwright
import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

URL = "https://cdm.unfccc.int/ProgrammeOfActivities/deregistered.html"
BASE = "https://cdm.unfccc.int"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
KST = dt.timezone(dt.timedelta(hours=9))
COMPARE_FIELDS = ("title", "registered", "host_parties", "other_parties",
                  "methodologies", "reductions", "url")


# --------------------------------------------------------------------------- fetch
def html_is_valid(html: str) -> bool:
    return 'class="formTable"' in html and "transitioned" in html and "Incapsula" not in html[:800]


def fetch_html(timeout_s: int = 75, headless_only: bool = False) -> str:
    """Incapsula 는 헤드리스 브라우저를 차단하므로 헤드풀(실제 Chrome) → 헤드풀(번들 Chromium)
    → 헤드리스 순으로 시도. 리눅스 서버에서는 xvfb-run 으로 감싸서 실행."""
    from playwright.sync_api import sync_playwright

    strategies = [
        dict(channel="chrome", headless=False),
        dict(headless=False),
        dict(channel="chrome", headless=True),
        dict(headless=True),
    ]
    if headless_only:
        strategies = [s for s in strategies if s["headless"]]

    errors: list[str] = []
    with sync_playwright() as p:
        for kw in strategies:
            try:
                browser = p.chromium.launch(**kw)
            except Exception as e:  # 해당 채널 미설치 등
                errors.append(f"{kw}: launch failed: {e.__class__.__name__}")
                continue
            try:
                ctx = browser.new_context(user_agent=UA, viewport={"width": 1280, "height": 900},
                                          locale="en-US", timezone_id="Europe/Berlin")
                page = ctx.new_page()
                page.goto(URL, wait_until="domcontentloaded", timeout=60_000)
                deadline = time.time() + timeout_s
                while time.time() < deadline:
                    html = page.content()
                    if html_is_valid(html):
                        print(f"[fetch] ok via {kw} ({len(html)} bytes)", file=sys.stderr)
                        return html
                    page.wait_for_timeout(3000)
                errors.append(f"{kw}: blocked (Incapsula challenge not passed in {timeout_s}s)")
            except Exception as e:
                errors.append(f"{kw}: {e.__class__.__name__}: {str(e)[:120]}")
            finally:
                browser.close()
    raise RuntimeError("모든 fetch 전략 실패:\n  " + "\n  ".join(errors))


# --------------------------------------------------------------------------- parse
def parse_date(s: str) -> str:
    """'28 Sep 20' -> '2020-09-28' (실패 시 원문)"""
    s = s.strip()
    for fmt in ("%d %b %y", "%d %b %Y"):
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return s


def parse(html: str) -> tuple[list[dict], dict]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    main = soup.find(id="main") or soup
    records: list[dict] = []
    meta = {"declared_total_poa": None}

    for table in main.find_all("table", class_="formTable"):
        # 표 바로 앞 텍스트: "PoAs are transitioned ..." / "PAs are transitioned ..."
        kind = "unknown"
        for prev in table.previous_siblings:
            txt = prev if isinstance(prev, str) else prev.get_text(" ")
            txt = " ".join(txt.split())
            if "transitioned" in txt:
                kind = "PoA" if txt.startswith("PoAs") else "PA" if txt.startswith("PAs") else "unknown"
                break

        for tr in table.find_all("tr"):
            ths = tr.find_all("th")
            if ths and "Total" in ths[0].get_text():
                m = re.search(r"\d+", ths[0].get_text())
                if m:
                    meta["declared_total_poa"] = int(m.group())
            tds = tr.find_all("td")
            if len(tds) != 7:
                continue
            a = tds[1].find("a")
            reductions_txt = re.sub(r"[^\d]", "", tds[5].get_text())
            records.append({
                "type": kind,
                "ref": tds[6].get_text(strip=True),
                "registered": parse_date(tds[0].get_text()),
                "title": " ".join(tds[1].get_text(" ").split()),
                "url": urljoin(BASE, a["href"]) if a and a.has_attr("href") else "",
                "host_parties": list(tds[2].stripped_strings),
                "other_parties": list(tds[3].stripped_strings),
                "methodologies": [" ".join(x.get_text(" ").split()) for x in tds[4].find_all("a")],
                "reductions": int(reductions_txt) if reductions_txt else None,
            })

    if not records:
        raise ValueError("표를 찾았지만 레코드가 0건 — 페이지 구조가 바뀌었을 수 있음")
    return records, meta


def key(r: dict) -> str:
    return f"{r['type']}:{r['ref']}"


# --------------------------------------------------------------------------- diff
def diff(prev: list[dict], cur: list[dict]) -> dict:
    pm = {key(r): r for r in prev}
    cm = {key(r): r for r in cur}
    added = [cm[k] for k in cm if k not in pm]
    removed = [pm[k] for k in pm if k not in cm]
    modified = []
    for k in cm:
        if k in pm:
            changes = {f: {"before": pm[k].get(f), "after": cm[k].get(f)}
                       for f in COMPARE_FIELDS if pm[k].get(f) != cm[k].get(f)}
            if changes:
                modified.append({"record": cm[k], "changes": changes})
    return {"added": added, "removed": removed, "modified": modified}


# --------------------------------------------------------------------------- render
def esc(s) -> str:
    return str(s).replace("|", "\\|").replace("\n", " ")


def fmt_int(n) -> str:
    return f"{n:,}" if isinstance(n, int) else "-"


def render_markdown(records: list[dict], state: dict, changelog: list[dict], meta: dict,
                    highlight_days: int, now: dt.datetime, data_url_prefix: str) -> str:
    today = now.date()
    cutoff = (today - dt.timedelta(days=highlight_days)).isoformat()
    baseline_keys = set(state.get("baseline_keys", []))
    first_seen = state.get("first_seen", {})
    recent_events = [e for e in changelog if e["date"] >= cutoff]
    recent_keys = {e["key"]: e["event"] for e in recent_events}

    def badge(r: dict) -> str:
        ev = recent_keys.get(key(r))
        if ev == "added":
            return "🆕 "
        if ev == "modified":
            return "🔄 "
        return ""

    def hl(r: dict, text: str) -> str:
        return f"=={text}==" if key(r) in recent_keys else text

    def table(rows: list[dict]) -> str:
        head = ("| Ref | 등록일 | 사업명 | 유치국 | 참여국 | 방법론 | 연간 감축량 (tCO₂e) | 전환 최초 확인 |\n"
                "|---|---|---|---|---|---|---:|---|\n")
        out = []
        for r in sorted(rows, key=lambda x: x["registered"], reverse=True):
            fs = first_seen.get(key(r), "")
            fs_txt = "기준선" if key(r) in baseline_keys else fs
            title = f"[{esc(r['title'])}]({r['url']})" if r["url"] else esc(r["title"])
            out.append("| " + " | ".join([
                badge(r) + hl(r, r["ref"]),
                r["registered"],
                hl(r, title),
                esc(", ".join(r["host_parties"])) or "-",
                esc(", ".join(r["other_parties"])) or "-",
                esc("<br>".join(r["methodologies"])) or "-",
                fmt_int(r["reductions"]),
                fs_txt,
            ]) + " |")
        return head + "\n".join(out) + "\n"

    poa = [r for r in records if r["type"] == "PoA"]
    pa = [r for r in records if r["type"] == "PA"]
    other = [r for r in records if r["type"] not in ("PoA", "PA")]
    total_red = sum(r["reductions"] or 0 for r in records)

    L: list[str] = []
    L.append("---")
    L.append("title: PACM(6.4조) 전환 승인 CDM 활동 모니터링")
    L.append(f"description: UNFCCC CDM → Article 6.4 (PACM) 전환·등록 승인 활동 목록. 매일 자동 갱신, 최근 {highlight_days}일 변경 하이라이트.")
    L.append("tags: [PACM, Article6.4, CDM, 탄소시장, 모니터링]")
    L.append(f"date: {today.isoformat()}")
    L.append(f"modified: {now.isoformat(timespec='minutes')}")
    L.append("---")
    L.append("")
    L.append(f"> 출처: [UNFCCC CDM — Activities transitioned to A6.4]({URL}) · "
             f"[UNFCCC 전환 안내](https://unfccc.int/process-and-meetings/the-paris-agreement/paris-agreement-crediting-mechanism/CDM_transition)  ")
    L.append(f"> 마지막 확인: **{now.strftime('%Y-%m-%d %H:%M KST')}** · "
             f"마지막 변경: **{state.get('last_changed', '-')}** · "
             f"총 **{len(records)}건** (PoA {len(poa)} · PA {len(pa)}) · "
             f"연간 추정 감축량 합계 **{fmt_int(total_red)} tCO₂e**")
    L.append("")

    # ---- 변경 하이라이트
    if recent_events:
        n_add = sum(e["event"] == "added" for e in recent_events)
        n_rm = sum(e["event"] == "removed" for e in recent_events)
        n_mod = sum(e["event"] == "modified" for e in recent_events)
        L.append(f"> [!success]+ 최근 {highlight_days}일 내 변경 {len(recent_events)}건 "
                 f"(신규 {n_add} · 삭제 {n_rm} · 수정 {n_mod})")
        for e in sorted(recent_events, key=lambda x: x["date"], reverse=True):
            r = e["record"]
            icon = {"added": "🆕 신규 전환 승인", "removed": "❌ 목록에서 삭제", "modified": "🔄 정보 변경"}[e["event"]]
            line = (f"> - **{e['date']}** {icon} — [{r['type']} {r['ref']}] "
                    f"[{esc(r['title'])}]({r['url']}) ({', '.join(r['host_parties'])})")
            if e["event"] == "modified":
                ch = "; ".join(f"{f}: {c['before']} → {c['after']}" for f, c in e["changes"].items())
                line += f"  \n>   변경: {esc(ch)}"
            L.append(line)
        L.append("")
    else:
        L.append(f"> [!info]- 최근 {highlight_days}일 내 변경 없음")
        L.append(f"> 표에서 🆕/🔄 및 ==하이라이트== 는 최근 {highlight_days}일 내 변경된 항목에만 표시됩니다.")
        L.append("")

    # ---- 표
    L.append("## PoA (프로그램 활동) — Article 6.4 전환·등록")
    L.append("")
    if meta.get("declared_total_poa") not in (None, len(poa)):
        L.append(f"> [!warning] 페이지 표기 총계({meta['declared_total_poa']})와 파싱 건수({len(poa)})가 다릅니다. 파서 점검 필요.")
        L.append("")
    L.append(table(poa) if poa else "_없음_\n")
    L.append("## PA (개별 사업) — Article 6.4 전환·등록")
    L.append("")
    L.append(table(pa) if pa else "_없음_\n")
    if other:
        L.append("## 분류 미확인")
        L.append("")
        L.append(table(other))

    # ---- 전체 변경 이력
    L.append("## 변경 이력")
    L.append("")
    if changelog:
        L.append("| 일자 | 구분 | 유형 | Ref | 사업명 | 상세 |")
        L.append("|---|---|---|---|---|---|")
        for e in sorted(changelog, key=lambda x: (x["date"], x["key"]), reverse=True)[:200]:
            r = e["record"]
            detail = ""
            if e["event"] == "modified":
                detail = "; ".join(f"{f}: {c['before']} → {c['after']}" for f, c in e["changes"].items())
            L.append("| " + " | ".join([e["date"], {"added": "신규", "removed": "삭제", "modified": "수정"}[e["event"]],
                                        r["type"], r["ref"], f"[{esc(r['title'])}]({r['url']})", esc(detail)]) + " |")
    else:
        L.append(f"_기준선 스냅샷 생성일: {state.get('baseline_date')}. 이후 변경 없음._")
    L.append("")
    L.append("## 데이터")
    L.append("")
    L.append(f"- [latest.json]({data_url_prefix}/latest.json) · [latest.csv]({data_url_prefix}/latest.csv) · "
             f"[changelog.json]({data_url_prefix}/changelog.json)")
    L.append("- 등록일은 CDM 등록일. '전환 최초 확인'은 이 모니터가 해당 항목을 처음 관측한 날(기준선 = 모니터 시작 시 이미 존재).")
    L.append("- 감축량: 사업참여자 추정 연간 감축량(tCO₂e/yr). 방법론 표기: AM 대규모 · ACM 통합 · AMS 소규모.")
    L.append("")
    return "\n".join(L)


# --------------------------------------------------------------------------- io
def load_json(p: Path, default):
    if p.exists():
        with p.open(encoding="utf-8") as f:
            return json.load(f)
    return default


def dump_json(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_csv(p: Path, records: list[dict]) -> None:
    cols = ["type", "ref", "registered", "title", "host_parties", "other_parties",
            "methodologies", "reductions", "url"]
    with p.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in records:
            w.writerow({c: ("; ".join(r[c]) if isinstance(r[c], list) else r[c]) for c in cols})


TEAMS_HOSTS = ("logic.azure.com", "powerplatform.com", "webhook.office.com")


def teams_card(text: str) -> dict:
    """Teams Workflows(Power Automate) 웹훅은 {"text"} 가 아니라 Adaptive Card 첨부를 요구함."""
    lines = [ln for ln in text.splitlines() if ln.strip()] or [text]
    body = [{"type": "TextBlock", "text": lines[0], "weight": "Bolder", "size": "Medium", "wrap": True}]
    body += [{"type": "TextBlock", "text": ln, "wrap": True, "spacing": "Small"} for ln in lines[1:]]
    return {"type": "message", "attachments": [{
        "contentType": "application/vnd.microsoft.card.adaptive", "contentUrl": None,
        "content": {"$schema": "http://adaptivecards.io/schemas/adaptive-card.json", "type": "AdaptiveCard",
                    "version": "1.4", "msteams": {"width": "Full"}, "body": body,
                    "actions": [{"type": "Action.OpenUrl", "title": "UNFCCC 원본 페이지", "url": URL}]}}]}


def notify(webhook: str, text: str) -> None:
    try:
        host = urlparse(webhook).hostname or ""
        if host.endswith(TEAMS_HOSTS):
            payload = teams_card(text)
        else:
            if len(text) > 1900:  # Discord content 한도 2000자 — 넘으면 400 으로 알림 자체가 누락됨
                text = text[:1850].rsplit("\n", 1)[0] + "\n… (전체: https://howdareryu.com/pacm)"
            payload = {"text": text, "content": text}
        req = Request(webhook, data=json.dumps(payload).encode(),
                      headers={"Content-Type": "application/json"})
        urlopen(req, timeout=15).read()
    except Exception as e:
        print(f"[notify] failed: {e}", file=sys.stderr)


def set_output(name: str, value: str) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")


# --------------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site-root", default=".", help="Quartz 저장소 루트 (기본: 현재 디렉터리)")
    ap.add_argument("--page", default="content/pacm/index.md", help="생성할 마크다운 경로 (site-root 기준)")
    ap.add_argument("--data-dir", default="content/pacm/data", help="JSON/CSV 저장 경로 (site-root 기준)")
    ap.add_argument("--data-url-prefix", default="/pacm/data", help="페이지 내 데이터 링크 prefix")
    ap.add_argument("--highlight-days", type=int, default=int(os.environ.get("PACM_HIGHLIGHT_DAYS", 30)))
    ap.add_argument("--html-file", help="네트워크 대신 저장된 HTML 사용 (테스트용)")
    ap.add_argument("--headless-only", action="store_true", help="헤드풀 브라우저 전략 생략")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 출력")
    ap.add_argument("--webhook", default=os.environ.get("PACM_WEBHOOK", ""), help="변경 시 알림 웹훅(Slack/Discord/Teams Workflows)")
    args = ap.parse_args()

    root = Path(args.site_root).resolve()
    page_path = root / args.page
    data_dir = root / args.data_dir
    now = dt.datetime.now(KST)
    today = now.date().isoformat()

    # 1) fetch
    try:
        html = Path(args.html_file).read_text(encoding="utf-8", errors="ignore") if args.html_file \
            else fetch_html(headless_only=args.headless_only)
    except Exception as e:
        print(f"[error] {e}", file=sys.stderr)
        set_output("changed", "false")
        set_output("status", "fetch_failed")
        return 2

    # 2) parse
    records, meta = parse(html)
    records.sort(key=lambda r: (r["type"], r["registered"]), reverse=True)
    print(f"[parse] {len(records)} records (PoA {sum(r['type']=='PoA' for r in records)}, "
          f"PA {sum(r['type']=='PA' for r in records)}), declared PoA total={meta['declared_total_poa']}", file=sys.stderr)

    # 3) diff
    prev = load_json(data_dir / "latest.json", {"records": []})["records"]
    state = load_json(data_dir / "state.json",
                      {"baseline_date": None, "baseline_keys": [], "first_seen": {}, "last_changed": None})
    changelog = load_json(data_dir / "changelog.json", [])
    first_run = not prev
    d = diff(prev, records)
    changed = bool(d["added"] or d["removed"] or d["modified"])

    if first_run:
        state["baseline_date"] = today
        state["baseline_keys"] = [key(r) for r in records]
        for r in records:
            state["first_seen"].setdefault(key(r), today)
        d = {"added": [], "removed": [], "modified": []}  # 기준선은 변경으로 취급하지 않음
        changed = True
        print(f"[diff] baseline created with {len(records)} records", file=sys.stderr)
    else:
        for r in d["added"]:
            state["first_seen"][key(r)] = today
            changelog.append({"date": today, "event": "added", "key": key(r), "record": r})
        for r in d["removed"]:
            changelog.append({"date": today, "event": "removed", "key": key(r), "record": r})
        for m in d["modified"]:
            changelog.append({"date": today, "event": "modified", "key": key(m["record"]),
                              "record": m["record"], "changes": m["changes"]})
        print(f"[diff] added={len(d['added'])} removed={len(d['removed'])} modified={len(d['modified'])}", file=sys.stderr)

    if changed:
        state["last_changed"] = today
    state["last_checked"] = now.isoformat(timespec="minutes")

    # 4) render
    md = render_markdown(records, state, changelog, meta, args.highlight_days, now, args.data_url_prefix)

    summary_lines = [f"PACM 전환 모니터 {today}: 총 {len(records)}건"]
    for r in d["added"]:
        summary_lines.append(f"🆕 [{r['type']} {r['ref']}] {r['title']} ({', '.join(r['host_parties'])}) {r['url']}")
    for r in d["removed"]:
        summary_lines.append(f"❌ [{r['type']} {r['ref']}] {r['title']}")
    for m in d["modified"]:
        r = m["record"]
        summary_lines.append(f"🔄 [{r['type']} {r['ref']}] {r['title']}: {', '.join(m['changes'])}")
    summary = "\n".join(summary_lines)
    print(summary)

    if args.dry_run:
        print(md)
        return 0

    # 5) write
    dump_json(data_dir / "latest.json", {"fetched_at": now.isoformat(timespec="minutes"), "source": URL,
                                         "count": len(records), "records": records})
    write_csv(data_dir / "latest.csv", records)
    dump_json(data_dir / "state.json", state)
    dump_json(data_dir / "changelog.json", changelog)
    if changed:
        dump_json(data_dir / "history" / f"{today}.json", {"fetched_at": now.isoformat(timespec="minutes"),
                                                             "records": records, "diff": d})
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_text(md, encoding="utf-8")

    set_output("changed", "true" if changed else "false")
    set_output("status", "baseline" if first_run else ("changed" if changed else "unchanged"))
    set_output("summary", summary.replace("\n", " / "))
    if changed and not first_run and args.webhook:
        notify(args.webhook, summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
