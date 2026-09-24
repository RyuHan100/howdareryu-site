#!/usr/bin/env python3
"""
apply_events.py — 승인된 이벤트를 climate-timeline.json 에 반영한다 (파이프라인 6단계).

candidates/<날짜>.json 의 검증 통과 이벤트 중, 사람이 승인한 것만 climate-timeline.json 에
날짜순으로 끼워 넣는다. 그와 별개로(승인 여부 무관) 이 후보 파일에 있던 모든 id(통과·탈락
전부)를 state/proposed_ids.json 에 적어서, 다음 크롤에서 같은 후보가 다시 제안되지 않게 한다.

기본은 검증 통과(events) 전부를 승인하는 것이다. 일부만 반영하려면 --exclude 로 뺄 id를
주거나 --include 로 넣을 id만 콕 집어 준다(둘 중 하나만).

Usage:
    python3 apply_events.py candidates/2026-09-24.json                 # 통과분 전부 반영
    python3 apply_events.py candidates/2026-09-24.json --exclude id1 id2
    python3 apply_events.py candidates/2026-09-24.json --include id1 id2
    python3 apply_events.py candidates/2026-09-24.json --dry-run       # 반영 없이 무엇이 바뀔지만
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_TIMELINE = HERE.parents[1] / "plugins" / "climate-timeline" / "data" / "climate-timeline.json"
DEFAULT_PROPOSED = HERE / "state" / "proposed_ids.json"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def strip_review(event: dict) -> dict:
    return {k: v for k, v in event.items() if k != "_review"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("candidates", type=Path)
    parser.add_argument("--timeline", type=Path, default=DEFAULT_TIMELINE)
    parser.add_argument("--proposed", type=Path, default=DEFAULT_PROPOSED)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--exclude", nargs="*", default=[], metavar="ID", help="통과분 중 반영에서 뺄 id")
    group.add_argument("--include", nargs="*", default=None, metavar="ID", help="이 id만 반영(그 외 통과분은 반영 안 함)")
    parser.add_argument("--dry-run", action="store_true", help="파일을 고치지 않고 무엇이 바뀔지만 보여줌")
    args = parser.parse_args()

    data = json.loads(args.candidates.read_text(encoding="utf-8"))
    passed = data.get("events", [])
    rejected = data.get("rejected", [])
    unverified = data.get("unverified", [])

    if args.include is not None:
        to_apply = [e for e in passed if e["id"] in set(args.include)]
        missing = set(args.include) - {e["id"] for e in to_apply}
        if missing:
            log(f"경고: --include 로 준 id 중 통과분에 없는 것: {sorted(missing)}")
    else:
        exclude = set(args.exclude)
        to_apply = [e for e in passed if e["id"] not in exclude]

    timeline = json.loads(args.timeline.read_text(encoding="utf-8"))
    existing_ids = {e["id"] for e in timeline["events"]}
    dup = existing_ids & {e["id"] for e in to_apply}
    if dup:
        log(f"이미 climate-timeline.json 에 있는 id라 건너뜀: {sorted(dup)}")
        to_apply = [e for e in to_apply if e["id"] not in dup]

    log(f"반영: {len(to_apply)}건 / 통과 {len(passed)}건 중 (제외 {len(passed) - len(to_apply)}건)")
    for e in to_apply:
        log(f"  + {e['id']} {e['title']}")

    if args.dry_run:
        log("--dry-run: 파일을 고치지 않았음")
        return 0

    timeline["events"] = sorted(
        [*timeline["events"], *(strip_review(e) for e in to_apply)],
        key=lambda e: (e.get("exactDate") or e["date"], e["id"]),
    )
    args.timeline.write_text(
        json.dumps(timeline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # 이 후보 파일에 있던 모든 id(반영 여부·통과 여부 무관)를 다음 크롤이 다시 제안하지
    # 않도록 누적한다 — 반려된 것도 "이미 검토했던 후보"라 다시 나오면 안 된다.
    proposed = set()
    if args.proposed.exists():
        proposed = set(json.loads(args.proposed.read_text(encoding="utf-8")))
    all_ids = {e["id"] for e in [*passed, *rejected, *unverified]}
    proposed |= all_ids
    args.proposed.parent.mkdir(parents=True, exist_ok=True)
    args.proposed.write_text(
        json.dumps(sorted(proposed), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    log(f"state/proposed_ids.json 갱신: 총 {len(proposed)}개 id 기록됨 (+{len(all_ids - (proposed - all_ids))} 신규)")
    log(f"=== climate-timeline.json 에 {len(to_apply)}건 반영 완료 ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
