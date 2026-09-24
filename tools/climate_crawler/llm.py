"""Claude 호출 — extract_events.py / verify_events.py 공용.

backend:
    api  Anthropic SDK (ANTHROPIC_API_KEY 필요, CI 용, Python 3.10+)
    cli  로그인된 `claude` CLI (로컬 시험용, API 키 불필요)
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile

MODEL = "claude-opus-5-5"
EFFORT = "high"


def call(backend: str, system: str, user: str, schema: dict) -> dict:
    """system/user 프롬프트를 보내고 schema 에 맞는 JSON 객체를 돌려받는다."""
    return (_call_api if backend == "api" else _call_cli)(system, user, schema)


def _call_api(system: str, user: str, schema: dict) -> dict:
    import anthropic

    client = anthropic.Anthropic(max_retries=3)
    with client.messages.stream(
        model=MODEL,
        max_tokens=32000,
        output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": schema}},
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user}],
    ) as stream:
        message = stream.get_final_message()
    if message.stop_reason == "refusal":
        raise RuntimeError(f"model refused: {message.stop_details}")
    if message.stop_reason == "max_tokens":
        raise RuntimeError("hit max_tokens before finishing")
    text = next(b.text for b in message.content if b.type == "text")
    return json.loads(text)


def _call_cli(system: str, user: str, schema: dict) -> dict:
    claude = os.environ.get("CLAUDE_BIN") or shutil.which("claude")
    if not claude:
        raise RuntimeError("claude CLI not found (set CLAUDE_BIN or load nvm)")
    res = subprocess.run(
        [
            claude, "-p",
            "--model", MODEL,
            "--effort", EFFORT,
            "--tools", "",
            "--system-prompt", system,
            "--no-session-persistence",
            "--output-format", "json",
            "--json-schema", json.dumps(schema),
        ],
        input=user,
        capture_output=True,
        text=True,
        # 저장소 CLAUDE.md 가 맥락에 섞이지 않게 임시 폴더에서 실행 (번역 훅과 같은 이유)
        cwd=tempfile.gettempdir(),
        timeout=900,
    )
    if res.returncode != 0:
        raise RuntimeError(f"claude exited {res.returncode}: {(res.stderr or res.stdout)[-500:]}")
    out = json.loads(res.stdout)
    if out.get("is_error") or out.get("structured_output") is None:
        raise RuntimeError(f"claude returned no structured output: {out.get('subtype')} {str(out.get('result'))[:300]}")
    return out["structured_output"]
