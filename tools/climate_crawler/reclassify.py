#!/usr/bin/env python3
"""
reclassify.py — 검증 통과 이벤트의 category 를 다시 판단한다.

'abroad'(해외) 카테고리를 나중에 추가하면서, 그 전에 이미 추출된 이벤트들(대부분
international/science 로 잘못 분류됐을 수 있는, "한 나라만의 자체 정책" 같은 것들)을
새 규칙으로 다시 판정한다. 원문을 다시 안 읽고 id/title/description/evidence 만 보고
판단하므로(추출 당시 이미 원문에서 뽑은 사실이라 재검증이 아니라 재분류) 빠르고 싸다.
분류가 바뀌면 id 접두어도 그에 맞게 다시 만든다(`분류-연도-slug`, 연도/slug 는 그대로).

한 번 쓰고 지울 성격의 보정 스크립트다 — 처음부터 추출기(extract_events.py)에 새
카테고리 규칙이 들어가 있었다면 필요 없었을 단계.

Usage:
    python3 reclassify.py candidates/2026-09-24.json [--backend api|cli] [--apply]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from llm import call

ID_PREFIX = {"science": "science", "international": "intl", "korea": "korea",
             "disaster": "disaster", "abroad": "abroad"}
CATEGORIES = list(ID_PREFIX)

SCHEMA = {
    "type": "object",
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "category": {"type": "string", "enum": CATEGORIES},
                    "reason": {"type": "string"},
                },
                "required": ["id", "category", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["verdicts"],
    "additionalProperties": False,
}

SYSTEM = """너는 기후위기 연표의 분류 담당이다. 이벤트마다 category 를 다시 판정한다.

- korea: 한국 정부·기관의 정책·법·목표, 한국에서 일어난 재난.
- abroad: 한국이 아닌 한 나라(미국·일본·중국·인도·EU 회원국 등)만의 자체 정책·법·목표·선언.
  그 나라 혼자 하는 일이라는 게 핵심 — 여러 나라가 함께하는 조약·회의 자체가 아니다.
  (예: "인도, 2070년 탄소중립 목표 발표"는 COP26 자리에서 나온 발표라도 인도 혼자의
  선언이므로 abroad. "COP26, 40개국 탈석탄 서약"처럼 여러 나라가 함께 서약한 건
  international 로 남긴다.)
- international: 여러 나라가 함께하는 조약·협약·총회·정상회의의 채택·발효·합의.
- disaster: 한국이 아닌 곳에서 일어난 기후재난.
- science: 위 넷에 안 속하는 과학적 발견·연구·보고서·관측.

주어진 title/description/evidence 로만 판단한다. 맞다고 판단되면 원래 category 를 그대로
돌려줘도 된다 — 바뀌어야 할 것만 바뀌면 된다. 모든 id에 대해 판정을 하나씩 낸다."""


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def new_id(old_id: str, old_category: str, new_category: str) -> str:
    old_prefix = ID_PREFIX[old_category]
    rest = old_id[len(old_prefix) + 1:] if old_id.startswith(old_prefix + "-") else old_id
    return f"{ID_PREFIX[new_category]}-{rest}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("candidates", type=Path)
    parser.add_argument("--backend", choices=["api", "cli"], default="api")
    parser.add_argument("--apply", action="store_true", help="이 없으면 무엇이 바뀔지만 보여주고 파일은 그대로")
    args = parser.parse_args()

    data = json.loads(args.candidates.read_text(encoding="utf-8"))
    events = data.get("events", [])
    if not events:
        log("재분류할 이벤트가 없음")
        return 0

    items = [
        {"id": e["id"], "category": e["category"], "title": e["title"],
         "description": e["description"], "evidence": e["_review"]["evidence"]}
        for e in events
    ]
    result = call(args.backend, SYSTEM, json.dumps(items, ensure_ascii=False, indent=2), SCHEMA)
    verdicts = {v["id"]: v for v in result["verdicts"]}

    by_old_id = {e["id"]: e for e in events}
    changed = 0
    for e in events:
        v = verdicts.get(e["id"])
        if v is None:
            log(f"  경고: 재분류 결과에 없음: {e['id']}")
            continue
        if v["category"] == e["category"]:
            continue
        nid = new_id(e["id"], e["category"], v["category"])
        log(f"  {e['id']} ({e['category']}) -> {nid} ({v['category']}): {v['reason']}")
        e["_review"]["reclassifiedFrom"] = {"id": e["id"], "category": e["category"], "reason": v["reason"]}
        e["id"] = nid
        e["category"] = v["category"]
        changed += 1

    log(f"=== {changed}/{len(events)}건 카테고리 변경 ===")
    if not args.apply:
        log("--apply 없이 실행함: 파일을 고치지 않았음. 결과가 맞으면 --apply 로 다시 실행.")
        return 0

    data["events"] = sorted(events, key=lambda e: (e.get("exactDate") or e["date"], e["id"]))
    args.candidates.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"=== {args.candidates} 에 반영함 ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
