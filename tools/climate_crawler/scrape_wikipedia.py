#!/usr/bin/env python3
"""
scrape_wikipedia.py — raw-text scraper for the climate-histography pipeline (step 2).

Reads a CSV of Wikipedia article URLs (columns: url, category, lang) and, for each
row, fetches the article's plain-text extract + latest revision's wikitext via the
MediaWiki `action=query` API (NOT the REST summary endpoint), pulls a handful of
date-ish fields out of the first infobox template (if any), and writes one JSON
file per article to raw/<slug>.json.

This script does ONLY raw collection. It does not do LLM extraction, does not decide
which events matter, and does not touch any cron/PR/approval workflow — those are
separate, later steps in the pipeline.

Usage:
    python3 scrape_wikipedia.py [sources.csv] [--out-dir raw]

Standard library + `requests` only (see requirements.txt).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests

USER_AGENT = "howdareryu-climate-crawler/0.1 (mailto:dare2do.everything@gmail.com)"

# Between distinct articles (not per-retry).
INTER_REQUEST_DELAY_SECONDS = 1.0

# Retry policy for a single article's API call: up to 3 attempts total,
# with exponential backoff (2s, 4s, 8s) between attempts.
MAX_RETRIES = 3
INITIAL_BACKOFF_SECONDS = 2.0

# Infobox parameter names we copy verbatim if present. We do not invent or
# reformat values — whatever wikitext is literally in the field is what we store.
INFOBOX_DATE_FIELDS = [
    "date",
    "start_date",
    "end_date",
    "established",
    "founded",
    "날짜",
    "설립",
]
_INFOBOX_DATE_FIELDS_LOWER = {f.lower(): f for f in INFOBOX_DATE_FIELDS}

# Matches the opening of an infobox template: {{Infobox ...}} or {{정보상자 ...}}
# (case-insensitive, arbitrary whitespace after the double brace).
_INFOBOX_START_RE = re.compile(r"\{\{\s*(infobox|정보상자)", re.IGNORECASE)


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def parse_title_from_url(url: str) -> str:
    """Extract a human-readable article title from a Wikipedia article URL.

    Handles both en.wikipedia.org and ko.wikipedia.org (and in general any
    <lang>.wikipedia.org) hosts, and titles with URL-encoded characters
    (e.g. percent-encoded Korean).
    """
    parsed = urlparse(url)
    path = parsed.path
    marker = "/wiki/"
    idx = path.find(marker)
    if idx != -1:
        segment = path[idx + len(marker):]
    else:
        # Fallback: last path segment (covers e.g. /w/index.php?title=... rarely used
        # for these sources, but keep this robust rather than raising).
        segment = path.rsplit("/", 1)[-1]
    segment = segment.split("#", 1)[0]  # drop any #section fragment
    title = unquote(segment, encoding="utf-8")
    title = title.replace("_", " ").strip()
    return title


def api_host_for_lang(lang: str) -> str:
    return f"https://{lang}.wikipedia.org/w/api.php"


def slugify(title: str) -> str:
    """Filesystem-safe slug: lowercase, whitespace/punctuation collapsed to hyphens.

    Keeps non-ASCII (e.g. Korean) letters/digits as-is rather than transliterating,
    since macOS/Linux filesystems handle unicode filenames fine and this keeps the
    raw/*.json filenames human-readable for both languages.
    """
    s = title.strip().lower()
    s = re.sub(r"[^\w]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "untitled"


def fetch_query(host: str, title: str) -> dict:
    """Call the MediaWiki action=query API once for `title`, with retries.

    Retries up to MAX_RETRIES times total on network errors or non-200 responses,
    with exponential backoff (2s, 4s, 8s). Raises RuntimeError if all attempts fail.
    """
    params = {
        "action": "query",
        "prop": "extracts|revisions",
        "explaintext": 1,
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "titles": title,
        "format": "json",
    }
    headers = {"User-Agent": USER_AGENT}

    backoff = INITIAL_BACKOFF_SECONDS
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(host, params=params, headers=headers, timeout=30)
        except requests.RequestException as exc:
            last_error = f"network error: {exc}"
        else:
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError as exc:
                    last_error = f"invalid JSON response: {exc}"
            else:
                last_error = f"HTTP {resp.status_code}"

        if attempt < MAX_RETRIES:
            log(f"  [retry {attempt}/{MAX_RETRIES - 1 + 1} failed: {last_error}] "
                f"backing off {backoff:.0f}s")
            time.sleep(backoff)
            backoff *= 2

    raise RuntimeError(f"giving up after {MAX_RETRIES} attempts: {last_error}")


def find_first_infobox_template(wikitext: str) -> str | None:
    """Return the full {{Infobox ...}} / {{정보상자 ...}} template text (with
    correctly matched nested braces, e.g. for {{convert}}/{{cite web}} inside the
    infobox), or None if no such template is found."""
    m = _INFOBOX_START_RE.search(wikitext)
    if not m:
        return None

    start = m.start()
    depth = 0
    i = start
    n = len(wikitext)
    while i < n - 1:
        two = wikitext[i:i + 2]
        if two == "{{":
            depth += 1
            i += 2
            continue
        if two == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return wikitext[start:i]
            continue
        i += 1
    # Unterminated template (shouldn't normally happen) — return what we have.
    return wikitext[start:]


def split_top_level_pipe_params(template_text: str) -> list[str]:
    """Split a {{...}} template's body into top-level | separated chunks, respecting
    nesting of {{...}} and [[...]] so that pipes inside e.g. [[wikilink|text]] or a
    nested {{cite web|...}} don't get treated as parameter separators."""
    inner = template_text
    if inner.startswith("{{") and inner.endswith("}}"):
        inner = inner[2:-2]

    parts: list[str] = []
    current: list[str] = []
    depth = 0
    i = 0
    n = len(inner)
    while i < n:
        two = inner[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            current.append(two)
            i += 2
            continue
        if two in ("}}", "]]"):
            depth = max(0, depth - 1)
            current.append(two)
            i += 2
            continue
        ch = inner[i]
        if ch == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    parts.append("".join(current))

    # First chunk is the template name (e.g. "Infobox civil conflict\n"), not a param.
    return parts[1:] if parts else []


def extract_infobox_dates(wikitext: str) -> dict:
    """Find the first infobox template and pull out the whitelisted date-ish
    fields, copying values verbatim (only stripped of surrounding whitespace).
    Returns {} if there is no infobox or none of the target fields are present.
    """
    template_text = find_first_infobox_template(wikitext)
    if template_text is None:
        return {}

    result: dict[str, str] = {}
    for param in split_top_level_pipe_params(template_text):
        if "=" not in param:
            continue
        key, value = param.split("=", 1)
        key = key.strip().lower()
        canonical = _INFOBOX_DATE_FIELDS_LOWER.get(key)
        if canonical is None:
            continue
        value = value.strip()
        if value == "":
            continue
        result[canonical] = value
    return result


def process_row(row: dict, out_dir: Path) -> bool:
    """Process one CSV row. Returns True on success (file written), False on
    skip/failure (already logged)."""
    url = row["url"].strip()
    category = row["category"].strip()
    lang = row["lang"].strip()

    title = parse_title_from_url(url)
    host = api_host_for_lang(lang)
    log(f"[{lang}] fetching '{title}' from {host} ...")

    try:
        data = fetch_query(host, title)
    except RuntimeError as exc:
        log(f"  FAILED: {exc} -- skipping {url}")
        return False

    pages = data.get("query", {}).get("pages", {})
    if not pages:
        log(f"  FAILED: no 'pages' in API response -- skipping {url}")
        return False

    page = next(iter(pages.values()))
    if "missing" in page:
        log(f"  SKIPPED: page missing/does not exist on {lang}.wikipedia.org -- {title!r}")
        return False

    resolved_title = page.get("title", title)
    extract = page.get("extract", "") or ""

    revisions = page.get("revisions") or []
    revision_id = None
    revision_timestamp = None
    wikitext = ""
    if revisions:
        rev = revisions[0]
        revision_id = rev.get("revid")
        revision_timestamp = rev.get("timestamp")
        slot = (rev.get("slots") or {}).get("main") or {}
        # formatversion=1 (the default, which we're using) puts content under "*";
        # some mirrors/newer defaults use "content" instead, so check both.
        wikitext = slot.get("*") or slot.get("content") or ""
    else:
        log(f"  WARNING: no revisions returned for {title!r} -- infobox_dates will be empty")

    infobox_dates = extract_infobox_dates(wikitext) if wikitext else {}

    record = {
        "source_url": url,
        "title": resolved_title,
        "lang": lang,
        "category": category,
        "revision_id": revision_id,
        "revision_timestamp": revision_timestamp,
        "extract": extract,
        "infobox_dates": infobox_dates,
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    slug = slugify(resolved_title)
    out_path = out_dir / f"{slug}.json"
    out_path.write_text(
        json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    log(f"  OK: wrote {out_path} (revision {revision_id}, "
        f"infobox_dates={list(infobox_dates.keys())})")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "csv_path", nargs="?", default="/Users/ryuhan/Documents/기후/quartz/tools/climate_crawler/sources_full.csv",
        help="CSV file with columns: url, category, lang (default: sources_sample.csv)",
    )
    parser.add_argument(
        "--out-dir", default="raw",
        help="Directory to write raw/<slug>.json files into (default: raw)",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv_path)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        log(f"CSV file not found: {csv_path}")
        return 1

    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    total = len(rows)
    succeeded = 0
    failed_or_skipped = 0

    for i, row in enumerate(rows, start=1):
        log(f"--- [{i}/{total}] {row.get('url')} ---")
        ok = process_row(row, out_dir)
        if ok:
            succeeded += 1
        else:
            failed_or_skipped += 1
        if i < total:
            time.sleep(INTER_REQUEST_DELAY_SECONDS)

    log(f"=== done: {succeeded} succeeded, {failed_or_skipped} failed/skipped, "
        f"{total} total ===")
    return 0 if failed_or_skipped == 0 else 0  # never fail the whole run; failures are logged per-row


if __name__ == "__main__":
    raise SystemExit(main())
