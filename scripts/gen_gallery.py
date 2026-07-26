#!/usr/bin/env python3
"""content/img/inspiration 폴더를 읽어 썸네일을 만들고 content/gallery.md 를 생성한다."""

import html
import re
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent   # quartz/ 루트

IMG_DIR = ROOT / "content" / "img" / "inspiration"
IMG_WEB = "/img/inspiration"

THUMB_DIR = ROOT / "content" / "img" / "thumbs"
THUMB_WEB = "/img/thumbs"
THUMB_MAX = 800          # 긴 변 기준 픽셀
THUMB_QUALITY = 82

OUT = ROOT / "content" / "gallery.md"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}

DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})")


def caption(name: str) -> str:
    """20260319_104339.JPG → 2026.03.19 10:43"""
    m = DATE_RE.match(name)
    if not m:
        return Path(name).stem
    y, mo, d, h, mi = m.groups()
    return f"{y}.{mo}.{d} {h}:{mi}"


def make_thumb(src: Path) -> str | None:
    """썸네일을 만들고 웹 경로를 반환. 실패하면 None."""
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    dst = THUMB_DIR / (src.stem + ".webp")

    # 이미 있고 원본보다 최신이면 건너뛴다
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return f"{THUMB_WEB}/{quote(dst.name)}"

    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)      # 세로 사진 회전 보정
            im.thumbnail((THUMB_MAX, THUMB_MAX))
            im.convert("RGB").save(
                dst, "WEBP", quality=THUMB_QUALITY, method=6
            )
    except Exception as e:
        print(f"  ! 썸네일 실패 ({src.name}): {e}")
        return None

    print(f"  thumb: {dst.name}")
    return f"{THUMB_WEB}/{quote(dst.name)}"


def main() -> None:
    if not IMG_DIR.is_dir():
        raise SystemExit(f"폴더를 찾을 수 없음: {IMG_DIR}")

    files = sorted(
        (p for p in IMG_DIR.iterdir()
         if p.is_file() and p.suffix.lower() in IMAGE_EXT | VIDEO_EXT),
        key=lambda p: p.name,
        reverse=True,          # 최신순. 오래된 순이면 False
    )

    items = []
    for p in files:
        full = f"{IMG_WEB}/{quote(p.name)}"
        cap = html.escape(caption(p.name))

        if p.suffix.lower() in VIDEO_EXT:
            items.append(
                f'  <figure><video src="{full}" controls muted playsinline '
                f'preload="metadata"></video><figcaption>{cap}</figcaption></figure>'
            )
            continue

        thumb = make_thumb(p) or full      # 실패 시 원본으로 대체
        items.append(
            f'  <figure><a href="{full}"><img src="{thumb}" alt="{cap}" '
            f'loading="lazy"></a><figcaption>{cap}</figcaption></figure>'
        )

    OUT.write_text(
        "---\n"
        "title: Inspiration\n"
        "---\n\n"
        f"총 {len(files)}장.\n\n"
        '<div class="gallery">\n'
        + "\n".join(items)
        + "\n</div>\n",
        encoding="utf-8",
    )
    print(f"✓ {len(files)}개 항목 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

