#!/usr/bin/env python3
"""
verify_events.py — 이벤트 후보를 원문과 대조해 걸러낸다 (파이프라인 5단계).

candidates/<날짜>.json 의 후보마다, 추출할 때 쓴 바로 그 리비전의 원문(raw/*.json)과 대조한다.
  1) 기계 검사: 근거 인용(evidence)이 원문에 글자 그대로 있는지. 없으면 LLM 없이 reject.
  2) LLM 검증: 추출과 별개의 새 호출로 날짜·제목·설명의 각 사실이 원문으로 뒷받침되는지 판정.
     같은 원문에서 나온 후보는 한 번에 묶어 원문을 한 번만 보낸다.
결과는 같은 파일에 다시 쓴다: 통과는 events, 탈락은 rejected, 검증 호출이 실패한 것은
unverified (다음 실행에서 다시 추출·검증되도록 확정하지 않는다).

Usage:
    python3 verify_events.py [candidates/<날짜>.json] [--backend api|cli]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from llm import call

HERE = Path(__file__).resolve().parent

SCHEMA = {
    "type": "object",
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "verdict": {"type": "string", "enum": ["accept", "reject"]},
                    "reason": {"type": "string"},
                },
                "required": ["id", "verdict", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["verdicts"],
    "additionalProperties": False,
}

SYSTEM = """너는 기후위기 연표의 사실 검증 담당이다. 다른 편집자가 위키백과 문서 한 편에서 뽑은 이벤트 후보들이 그 원문과 맞는지 확인한다. 네 기억이나 배경지식이 아니라 오직 주어진 원문만 근거로 판단한다 — 원문에 없는 내용은 실제로 맞는 사실이라도 '확인 불가'다.

후보마다 다음을 모두 확인한다:
1. date(YYYY-MM)가 원문에 나온 그 사건의 시점과 맞는가.
2. exactDate가 있으면 원문에 그 날짜가 일(日)까지 나오는가. 여러 날에 걸친 일이면 그 사건의 시점으로 타당한가.
3. title과 description의 모든 사실(주체, 행위, 수치, 결과)이 원문으로 뒷받침되는가. 원문보다 부풀리거나, 원문에 없는 해석·평가·수치를 덧붙이지 않았는가.
4. 원문이 말하는 바로 그 사건인가 — 다른 사건의 내용과 섞이지 않았는가.

하나라도 틀리거나 원문으로 확인할 수 없으면 reject, 모두 맞으면 accept.
reason은 한국어 한두 문장으로 쓴다. accept면 무엇을 확인했는지, reject면 어느 필드가 원문의 어느 내용과 어떻게 다른지 구체적으로.
evidence는 편집자가 붙인 인용으로, 원문의 어디를 보면 되는지 알려주는 힌트일 뿐이다. 인용만 보지 말고 원문 전체와 대조한다.
모든 후보의 id에 대해 판정을 하나씩 낸다."""

_QUOTE_TABLE = str.maketrans({
    "“": '"', "”": '"', "‘": "'", "’": "'",
    "–": "-", "—": "-", " ": " ",
})
MIN_FRAGMENT = 8


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.translate(_QUOTE_TABLE)).strip().lower()


def missing_quote_fragments(evidence: str, source: str) -> list[str] | None:
    """evidence 를 '...' 생략 기호로 나눈 조각 중 원문에 없는 것. 쓸 만한 조각이 하나도 없으면 None."""
    fragments = [
        f.strip(" \"'.,;:")
        for f in re.split(r"\[\.\.\.\]|\.\.\.|…", norm(evidence))
    ]
    fragments = [f for f in fragments if len(f) >= MIN_FRAGMENT]
    if not fragments:
        return None
    return [f for f in fragments if f not in source]


def build_user_message(raw: dict, events: list[dict]) -> str:
    items = [
        {
            "id": e["id"],
            "date": e["date"],
            "exactDate": e.get("exactDate", ""),
            "title": e["title"],
            "description": e["description"],
            "evidence": e["_review"]["evidence"],
        }
        for e in events
    ]
    return (
        f"문서 제목: {raw['title']}\n"
        f"URL: {raw['source_url']}\n"
        f"리비전: {raw.get('revision_id')} ({raw.get('revision_timestamp')})\n"
        f"인포박스 날짜 필드: {json.dumps(raw.get('infobox_dates') or {}, ensure_ascii=False)}\n\n"
        f"<후보>\n{json.dumps(items, ensure_ascii=False, indent=2)}\n</후보>\n\n"
        f"<원문>\n{raw['extract']}\n</원문>"
    )


def latest_candidates() -> Path | None:
    files = sorted((HERE / "candidates").glob("*.json"))
    return files[-1] if files else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("candidates", nargs="?", type=Path, help="기본: candidates/ 에서 가장 최근 파일")
    parser.add_argument("--backend", choices=["api", "cli"], default="api")
    parser.add_argument("--raw-dir", type=Path, default=HERE / "raw")
    parser.add_argument("--workers", type=int, default=4, help="동시에 부를 원문 수 (기본 4)")
    args = parser.parse_args()

    path = args.candidates or latest_candidates()
    if not path or not path.exists():
        log("후보 파일이 없음")
        return 1
    data = json.loads(path.read_text(encoding="utf-8"))

    todo = [e for e in data["events"] if "verification" not in e["_review"]]
    done = [e for e in data["events"] if "verification" in e["_review"]]
    groups: dict[str, list[dict]] = {}
    for e in todo:
        groups.setdefault(e["_review"]["sourceFile"], []).append(e)

    accepted, rejected, unverified = list(done), [], []

    def settle(event: dict, verdict: str, reason: str, method: str, revision) -> None:
        event["_review"]["verification"] = {
            "verdict": verdict, "reason": reason, "method": method, "revisionId": revision,
        }
        (accepted if verdict == "accept" else rejected).append(event)
        log(f"  {'✓' if verdict == 'accept' else '✗'} {event['id']} [{method}] {reason}")

    # 1단계: 기계 검사(빠름, LLM 없음) — 원문마다 한 번씩, 여기서 이미 순차로도 충분히 빠르다.
    llm_jobs: dict[str, tuple[dict, list[dict]]] = {}  # source_file -> (raw, to_llm)
    for source_file, events in groups.items():
        raw_path = args.raw_dir / source_file
        if not raw_path.exists():
            for e in events:
                settle(e, "reject", f"원문 파일 없음: {source_file}", "quote", None)
            continue
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
        revision = raw.get("revision_id")
        source_text = norm(raw["extract"] + " " + " ".join((raw.get("infobox_dates") or {}).values()))

        to_llm = []
        for e in events:
            missing = missing_quote_fragments(e["_review"]["evidence"], source_text)
            if missing is None:
                settle(e, "reject", "근거 인용이 비어 있거나 너무 짧음", "quote", revision)
            elif missing:
                settle(e, "reject", f"근거 인용이 원문에 없음: '{missing[0][:80]}'", "quote", revision)
            else:
                to_llm.append(e)
        if to_llm:
            llm_jobs[source_file] = (raw, to_llm)

    # 2단계: LLM 검증(느린 I/O) 만 동시에 여러 원문을 띄운다. settle() 은 완료된 것부터 이
    # 메인 스레드에서 순서대로 부르므로 공유 리스트에 경쟁 상태가 없다.
    total = len(llm_jobs)

    def run_one(source_file: str):
        raw, to_llm = llm_jobs[source_file]
        return call(args.backend, SYSTEM, build_user_message(raw, to_llm), SCHEMA)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_one, sf): sf for sf in llm_jobs}
        for i, future in enumerate(as_completed(futures), start=1):
            source_file = futures[future]
            raw, to_llm = llm_jobs[source_file]
            revision = raw.get("revision_id")
            log(f"--- [{i}/{total}] {source_file} — 검증 {len(to_llm)}건 ---")
            try:
                result = future.result()
            except Exception as exc:  # 한 원문의 실패가 나머지를 막지 않게
                log(f"  FAILED: {exc}")
                for e in to_llm:
                    e["_review"]["verificationError"] = str(exc)
                unverified.extend(to_llm)
                continue

            verdicts = {v["id"]: v for v in result["verdicts"]}
            for e in to_llm:
                v = verdicts.get(e["id"])
                if v is None:
                    settle(e, "reject", "검증 결과에 이 후보가 빠짐", "llm", revision)
                else:
                    settle(e, v["verdict"], v["reason"], "llm", revision)

    data["events"] = sorted(accepted, key=lambda e: (e.get("exactDate") or e["date"], e["id"]))
    data["rejected"] = data.get("rejected", []) + rejected
    data["unverified"] = unverified
    data["verifiedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"=== 통과 {len(accepted)}건, 탈락 {len(rejected)}건, 미검증 {len(unverified)}건 → {path} ===")
    return 1 if unverified and not accepted and not rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
