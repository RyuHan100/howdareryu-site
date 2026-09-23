#!/usr/bin/env python3
"""content/img/inspiration 폴더의 그림마다 썸네일(긴 변 800px, webp)을 만들고, 원본 크기를
content/img/thumbs/meta.json 에 적어 둔다.

그림 정보(제목·연도·재료)와 정렬·표시는 전부 Node 쪽(quartz/garden/collect.ts, 아빠의 화단
컴포넌트)이 이 메타데이터 + garden.yaml/gallery.yaml 을 읽어서 한다 — 이 스크립트는 예전처럼
content/gallery.md 를 다시 쓰지 않는다(그 페이지는 이제 사람이 직접 관리하는 평범한 파일 +
컴포넌트가 채우는 구조라, CI가 덮어쓰면 안 된다).

CI(.github/workflows/deploy.yml)에서만 돈다 — 로컬에는 썸네일/meta.json 이 없다(CLAUDE.md §8).
"""

from __future__ import annotations  # `str | None` 같은 표기가 로컬 Python 3.9 에서도 되게

import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent   # quartz/ 루트

IMG_DIR = ROOT / "content" / "img" / "inspiration"

THUMB_DIR = ROOT / "content" / "img" / "thumbs"
THUMB_MAX = 800          # 긴 변 기준 픽셀
THUMB_QUALITY = 82
META_PATH = THUMB_DIR / "meta.json"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}


def make_thumb(src: Path) -> tuple[int, int] | None:
    """썸네일을 만들고 원본 (width, height) 를 반환. 실패하면 None."""
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    # src.stem 이 아니라 src.name(확장자 포함) — 같은 이름에 확장자만 다른 파일이 나중에
    # 생겨도(예: 20260727.jpg 와 20260727.png) 썸네일이 서로 덮어쓰지 않는다.
    dst = THUMB_DIR / (src.name + ".webp")

    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)      # 세로 사진 회전 보정
            size = im.size                        # thumbnail() 이 제자리에서 줄이기 전에 저장
            if not (dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime):
                im.thumbnail((THUMB_MAX, THUMB_MAX))
                # 투명 배경(PNG 등)을 그냥 RGB로 바꾸면 배경이 검게 나온다 — 흰 배경에
                # 합성해서 그림처럼 보이게 한다. 투명도가 없는 그림(대부분의 사진)은 그대로.
                if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                    bg = Image.new("RGB", im.size, (255, 255, 255))
                    bg.paste(im, mask=im.convert("RGBA").split()[-1])
                    im = bg
                else:
                    im = im.convert("RGB")
                im.save(dst, "WEBP", quality=THUMB_QUALITY, method=6)
                print(f"  thumb: {dst.name}")
    except Exception as e:
        print(f"  ! 썸네일 실패 ({src.name}): {e}")
        return None

    return size


def main() -> None:
    if not IMG_DIR.is_dir():
        raise SystemExit(f"폴더를 찾을 수 없음: {IMG_DIR}")

    files = sorted(
        p for p in IMG_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXT
    )

    meta: dict[str, dict[str, int]] = {}
    ok = 0
    for p in files:
        size = make_thumb(p)
        if size is None:
            continue
        meta[p.name] = {"width": size[0], "height": size[1]}
        ok += 1

    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {ok}/{len(files)}개 썸네일 → {THUMB_DIR.relative_to(ROOT)} (meta.json 포함)")


if __name__ == "__main__":
    main()
