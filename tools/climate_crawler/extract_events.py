#!/usr/bin/env python3
"""
extract_events.py — raw/*.json 원문에서 연표 이벤트 후보를 뽑는다 (파이프라인 3단계).

각 raw 파일(scrape_wikipedia.py 출력)을 Claude 에 한 번씩 보내 climate-timeline.json 과
같은 모양의 이벤트 후보를 받고, 형식 검증·중복 제거를 거쳐 candidates/<오늘>.json 에 쓴다.
climate-timeline.json 자체는 건드리지 않는다 — 반영은 승인(PR 머지) 단계의 일이다.

Usage:
    python3 extract_events.py [raw/*.json ...] [--backend api|cli] [--max-events 10]

backend:
    api  Anthropic SDK (ANTHROPIC_API_KEY 필요, CI 용, Python 3.10+)
    cli  로그인된 `claude` CLI (로컬 시험용, API 키 불필요)
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from llm import MODEL, call

HERE = Path(__file__).resolve().parent
DEFAULT_TIMELINE = HERE.parents[1] / "plugins" / "climate-timeline" / "data" / "climate-timeline.json"
DEFAULT_PROPOSED = HERE / "state" / "proposed_ids.json"

# climate-timeline.json 의 기존 id 규칙: international 만 접두어가 intl
ID_PREFIX = {
    "science": "science",
    "international": "intl",
    "korea": "korea",
    "disaster": "disaster",
    "abroad": "abroad",
}
CATEGORIES = list(ID_PREFIX)

TONE_EXAMPLE_IDS = ["science-1958-keeling", "intl-2015-paris", "korea-2022-framework-act"]

SCHEMA = {
    "type": "object",
    "properties": {
        "events": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "slug": {"type": "string"},
                    "date": {"type": "string"},
                    "exactDate": {"type": "string"},
                    "title": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "description": {"type": "string"},
                    "evidence": {"type": "string"},
                },
                "required": ["slug", "date", "exactDate", "title", "category", "description", "evidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["events"],
    "additionalProperties": False,
}

SYSTEM_TEMPLATE = """너는 howdareryu.com '기후위기 연표'의 편집자다. 위키백과 문서 한 편을 읽고, 연표에 올릴 만한 개별 사건을 골라 요약한다. 사이트에는 네가 쓴 제목과 요약만 나가고, 원문은 출처 링크로만 남는다.

## 무엇을 고르나
- 기후위기의 흐름에서 의미 있는 '사건'만 고른다: 발견·발표·채택·발효·시행·선언·판결·재난처럼 특정 시점에 일어난 일. 인물 소개, 개념 설명, 일반적 추세("기온이 계속 오르고 있다")는 사건이 아니다.
- 날짜를 원문(본문 또는 인포박스)에서 최소 연-월까지 확인할 수 있는 것만 고른다. 원문에 없는 날짜를 기억으로 채우지 않는다. 연도만 있고 월을 알 수 없으면 뺀다.
- 오늘({today}) 이후의 일(예정된 회의 등)은 뺀다.
- 아래 '이미 있는 사건'과 같은 사건은 뺀다. 같은 회의·법·재난이라도 다른 시점의 다른 일(예: 채택과 발효)은 별개 사건이다.
- 한 문서에서 최대 {max_events}개. 더 많으면 기후위기 연표에서 중요한 순서로 고른다. 해당하는 사건이 없으면 events 를 빈 배열로 둔다.

## 필드
- slug: 영문 소문자 kebab-case 2~4단어 (예: cop27-loss-damage-fund). id 는 프로그램이 `분류-연도-slug` 로 만든다.
- date: "YYYY-MM".
- exactDate: 원문에서 일(日)까지 확인되면 "YYYY-MM-DD", 아니면 "". 여러 날에 걸친 회의·재난은 그 사건의 핵심 시점(합의 채택일, 발생일 등)으로 잡는다.
- title: 30자 안팎의 한국어 제목. 예시처럼 명사형으로 끝낸다("…채택", "…시행").
- category: 사용자 메시지의 '원문 분류'는 참고만 하고, 사건의 실제 성격으로 다시 판단한다.
  - korea: 한국 정부·기관의 정책·법·목표, 한국에서 일어난 재난.
  - abroad: 한국이 아닌 한 나라(미국·일본·중국·EU 회원국 등)만의 자체 정책·법·목표·선언. 그 나라 혼자 하는 일이라는 게 핵심 — 여러 나라가 함께하는 조약·회의가 아니다.
  - international: 여러 나라가 함께하는 조약·협약·총회·정상회의(UNFCCC, COP, 교토의정서, 파리협정 등)의 채택·발효·합의.
  - disaster: 한국이 아닌 곳에서 일어난 기후재난(폭염·홍수·산불·태풍 등).
  - science: 위 넷에 안 속하는 과학적 발견·연구·보고서·관측.
- description: 1~3문장, 한국어 서술체(…했다/…됐다). 건조하고 사실 위주로, 감탄·수식어·평가 없이 쓴다. 수치는 원문에 있는 것만 쓴다.
- evidence: 날짜와 핵심 사실을 뒷받침하는 원문 구절을 원문 언어 그대로 짧게 인용한다. 검토자가 확인하는 용도라 사이트에는 나가지 않는다.

인포박스 값은 위키텍스트 템플릿일 수 있다 (예: {{{{start and end dates|2022|11|6|2022|11|20}}}} 는 2022-11-06~2022-11-20). 해석해서 쓰되 본문과 맞는지 확인한다.

## 기존 항목 예시 (문체 기준)
{examples}

## 이미 있는 사건 (id | date | title)
{existing}
"""


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def build_system_prompt(timeline: dict, today: str, max_events: int) -> str:
    events = timeline["events"]
    by_id = {e["id"]: e for e in events}
    examples = [by_id[i] for i in TONE_EXAMPLE_IDS if i in by_id] or events[:3]
    examples_text = "\n".join(json.dumps(e, ensure_ascii=False) for e in examples)
    existing_text = "\n".join(
        f"{e['id']} | {e['date']} | {e['title']}" for e in sorted(events, key=lambda e: e["date"])
    )
    return SYSTEM_TEMPLATE.format(
        today=today, max_events=max_events, examples=examples_text, existing=existing_text
    )


def build_user_message(raw: dict) -> str:
    return (
        f"원문 분류: {raw['category']}\n"
        f"문서 제목: {raw['title']}\n"
        f"언어: {raw['lang']}\n"
        f"URL: {raw['source_url']}\n"
        f"문서 최종 수정: {raw.get('revision_timestamp')}\n"
        f"인포박스 날짜 필드: {json.dumps(raw.get('infobox_dates') or {}, ensure_ascii=False)}\n\n"
        f"<원문>\n{raw['extract']}\n</원문>"
    )


def source_entry(raw: dict) -> dict:
    label = "위키백과" if raw["lang"] == "ko" else "Wikipedia"
    return {"title": f"{label} — {raw['title']}", "url": raw["source_url"]}


def normalize(ev: dict, raw: dict, today: str) -> tuple[dict | None, str]:
    """모델 출력 한 건을 climate-timeline.json 항목 모양으로 바꾼다. 실패하면 (None, 사유)."""
    slug = re.sub(r"[^a-z0-9]+", "-", ev["slug"].lower()).strip("-")
    date = ev["date"].strip()
    exact = ev["exactDate"].strip()
    category = ev["category"]
    if not slug:
        return None, "빈 slug"
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", date):
        return None, f"date 형식 오류: {date!r}"
    if exact and not (re.fullmatch(r"\d{4}-\d{2}-\d{2}", exact) and exact.startswith(date)):
        return None, f"exactDate 가 date 와 안 맞음: {exact!r} / {date!r}"
    if (exact or date) > today[: len(exact or date)]:
        return None, f"미래 날짜: {exact or date}"
    if not ev["title"].strip() or not ev["description"].strip():
        return None, "빈 제목/설명"

    event = {"id": f"{ID_PREFIX[category]}-{date[:4]}-{slug}", "date": date}
    if exact:
        event["exactDate"] = exact
    event.update(
        title=ev["title"].strip(),
        category=category,
        description=ev["description"].strip(),
        sources=[source_entry(raw)],
    )
    return event, ""


def possible_duplicates(event: dict, pool: list[dict]) -> list[str]:
    """같은 분류·같은 달이거나 제목이 아주 비슷한 기존 항목 — 버리지 않고 검토자에게 표시만 한다."""
    hits = []
    for other in pool:
        same_month = other["category"] == event["category"] and other["date"] == event["date"]
        similar = difflib.SequenceMatcher(None, other["title"], event["title"]).ratio() >= 0.6
        if same_month or similar:
            hits.append(other["id"])
    return hits


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("raw_files", nargs="*", help="raw/*.json (기본: raw/ 아래 전부)")
    parser.add_argument("--backend", choices=["api", "cli"], default="api")
    parser.add_argument("--max-events", type=int, default=10, help="문서당 최대 후보 수 (기본 10)")
    parser.add_argument("--workers", type=int, default=4, help="동시에 부를 문서 수 (기본 4)")
    parser.add_argument("--timeline", type=Path, default=DEFAULT_TIMELINE)
    parser.add_argument("--proposed", type=Path, default=DEFAULT_PROPOSED,
                        help="이미 제안한 id 목록 (재제안 방지, 없으면 빈 목록)")
    parser.add_argument("--out", type=Path, help="기본: candidates/<오늘>.json")
    args = parser.parse_args()

    raw_paths = [Path(p) for p in args.raw_files] or sorted((HERE / "raw").glob("*.json"))
    if not raw_paths:
        log("raw 파일이 없음")
        return 1

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    out_path = args.out or HERE / "candidates" / f"{today}.json"

    timeline = load_json(args.timeline, None)
    if timeline is None:
        log(f"timeline 을 못 찾음: {args.timeline}")
        return 1
    existing = timeline["events"]
    known_ids = {e["id"] for e in existing} | set(load_json(args.proposed, []))

    system = build_system_prompt(timeline, today, args.max_events)

    accepted: list[dict] = []
    dropped: list[dict] = []
    failed: list[dict] = []

    # LLM 호출(느린 I/O)만 동시에 여러 개 띄운다. 결과를 받은 뒤 normalize/dedup/known_ids
    # 갱신은 이 메인 스레드에서 한 건씩 순서대로 처리해서, 두 문서가 같은 id 를 동시에
    # 통과시키는 경쟁 상태를 피한다(그 부분은 가벼운 CPU 작업이라 직렬화해도 병목이 안 됨).
    raws = {path: json.loads(path.read_text(encoding="utf-8")) for path in raw_paths}
    total = len(raw_paths)
    done = 0

    def run_one(path: Path):
        raw = raws[path]
        return path, raw, call(args.backend, system, build_user_message(raw), SCHEMA)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_one, path): path for path in raw_paths}
        for future in as_completed(futures):
            path = futures[future]
            raw = raws[path]
            done += 1
            try:
                _, _, result = future.result()
            except Exception as exc:  # 한 문서 실패가 나머지를 막지 않게
                log(f"--- [{done}/{total}] {raw['title']} FAILED: {exc}")
                failed.append({"file": path.name, "error": str(exc)})
                continue
            log(f"--- [{done}/{total}] {raw['title']} ({raw['lang']}, {raw['category']}) "
                f"-> 후보 {len(result['events'])}건 ---")

            for ev in result["events"]:
                event, reason = normalize(ev, raw, today)
                if event is None:
                    dropped.append({"file": path.name, "slug": ev.get("slug"), "reason": reason})
                    log(f"  drop {ev.get('slug')}: {reason}")
                    continue
                if event["id"] in known_ids:
                    dropped.append({"file": path.name, "id": event["id"], "reason": "이미 있는 id"})
                    log(f"  drop {event['id']}: 이미 있는 id")
                    continue
                known_ids.add(event["id"])
                dups = possible_duplicates(event, existing + accepted)
                event["_review"] = {
                    "evidence": ev["evidence"],
                    "sourceFile": path.name,
                    "revisionId": raw.get("revision_id"),
                    "sourceCategory": raw["category"],
                    "possibleDuplicateOf": dups,
                }
                accepted.append(event)
                flag = f"  (비슷한 기존 항목: {', '.join(dups)})" if dups else ""
                log(f"  + {event['id']} {event['title']}{flag}")

    accepted.sort(key=lambda e: (e.get("exactDate") or e["date"], e["id"]))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {
                "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "model": MODEL,
                "events": accepted,
                "dropped": dropped,
                "failed": failed,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    log(f"=== 후보 {len(accepted)}건, 제외 {len(dropped)}건, 실패 {len(failed)}건 → {out_path} ===")
    return 1 if failed and len(failed) == len(raw_paths) else 0


if __name__ == "__main__":
    raise SystemExit(main())
