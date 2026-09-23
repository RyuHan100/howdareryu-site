// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
// 전체 그림 페이지 맨 아래에 까는 장식용 화단 가장자리(작은 꽃이 핀 흙 띠). 실제 데이터와
// 무관한 순수 장식이라 고정된 모양 하나만 만든다. 상호작용 없음.

function miniFlower(x, hue) {
  const petalClass = ["gg-petal-0", "gg-petal-1", "gg-petal-2"][hue % 3]
  let petals = ""
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2
    const px = x + Math.cos(a) * 3.2
    const py = 14 + Math.sin(a) * 3.2
    petals += `<circle class="${petalClass}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/>`
  }
  return (
    `<path class="gg-stem" d="M${x} 24L${x} 17"/>` + petals + `<circle class="gg-heart" cx="${x}" cy="14" r="1.8"/>`
  )
}

/** width 는 viewBox 기준(뷰포트 폭과 같게 잡으면 이랑처럼 늘어난다). */
function renderFlowerBedFooter(width) {
  const n = Math.max(4, Math.round(width / 90))
  let flowers = ""
  for (let i = 0; i < n; i++) {
    const x = (width / n) * (i + 0.5)
    flowers += miniFlower(x, i)
  }
  return (
    `<svg class="gg-footer-bed" viewBox="0 0 ${width} 30" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect class="gg-footer-soil" x="0" y="20" width="${width}" height="10"/>` +
    `<line class="gg-footer-soil-line" x1="0" y1="20" x2="${width}" y2="20"/>` +
    flowers +
    `</svg>`
  )
}

// 서버(빌드) 쪽 컴포넌트. garden-home 과 같은 방식으로 preact vnode 를 직접 만든다(Quartz 는
// 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). h/text/readGardenData
// 는 garden-home 플러그인에도 똑같이 있는데, 서로 다른 dist 번들이라 공유가 안 돼 여기 다시
// 만든다(각자 20줄 안팎이라 중복 비용이 적다). Component.css/afterDOMLoaded 의 자리표시자는
// build.mjs 가 채운다. quartz.config.yaml 에서 layout.condition: "gallery" 로 등록해
// content/gallery.md 에서만 나오게 한다(quartz.ts 의 registerCondition).
import { readFileSync } from "node:fs"
import { join } from "node:path"

const GARDEN_DATA_PATH = join(process.cwd(), ".garden-cache", "garden-data.json")

function readGardenData() {
  try {
    return JSON.parse(readFileSync(GARDEN_DATA_PATH, "utf-8"))
  } catch {
    return null
  }
}

let vnodeId = 0
function h(type, props) {
  return {
    type,
    props,
    key: undefined,
    ref: undefined,
    __k: null,
    __: null,
    __b: 0,
    __e: null,
    __c: null,
    constructor: undefined,
    __v: --vnodeId,
    __i: -1,
    __u: 0,
  }
}

/** 캡션: 제목·연도·재료·작가. 있는 것만 이어 붙이고, 하나도 없으면 null. */
function caption(img, artist) {
  const parts = [img.title, img.year ? `${img.year}년` : null, img.material, artist].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

function gridItem(img, i, artist) {
  const cap = caption(img, artist)
  const alt = cap ?? "작품 이미지"
  const ratio = img.width && img.height ? `${img.width} / ${img.height}` : "4 / 3"
  // <figure> 가 아니라 <div> 인 이유: 이 테마(obsidian-theme 레이어)가 html body figure 에
  // border-width:0 을 강제로 씌워서(주로 코드 블록 figure 대상, 너무 넓게 잡혀 있음) .gg-item
  // 의 border 가 specificity 와 무관하게 항상 눌린다(레이어 우선순위가 specificity 보다 위).
  // 여기선 <figcaption> 을 안 쓰니 <div> 로 바꿔서 그 규칙을 피한다.
  return h("div", {
    class: "gg-item",
    "data-index": String(i),
    "data-full": img.src,
    "data-caption": cap ?? "",
    style: `aspect-ratio:${ratio}`,
    children: [
      h("img", {
        src: img.thumb,
        alt,
        width: img.width || undefined,
        height: img.height || undefined,
        loading: i < 6 ? "eager" : "lazy",
      }),
    ],
  })
}

function lightbox() {
  return h("div", {
    class: "gg-lightbox",
    hidden: true,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "그림 크게 보기",
    children: [
      h("button", { type: "button", class: "gg-lb-close", "aria-label": "닫기", children: "✕" }),
      h("button", { type: "button", class: "gg-lb-prev", "aria-label": "이전 그림", children: "‹" }),
      h("img", { class: "gg-lb-img", alt: "" }),
      h("figcaption", { class: "gg-lb-caption" }),
      h("button", { type: "button", class: "gg-lb-next", "aria-label": "다음 그림", children: "›" }),
    ],
  })
}

export const GalleryGrid = () => {
  const Component = ({ displayClass }) => {
    const data = readGardenData()
    const images = data?.gallery?.images ?? []
    const artist = data?.config?.gallery?.artist || ""

    if (images.length === 0) {
      return h("section", {
        class: [displayClass, "gallery-page"].filter(Boolean).join(" "),
        children: [h("p", { class: "gallery-page-note", children: "아직 올린 그림이 없어요." })],
      })
    }

    return h("section", {
      class: [displayClass, "gallery-page"].filter(Boolean).join(" "),
      children: [
        h("p", {
          class: "sr-only",
          children: "아버지의 그림을 모두 모은 격자입니다. 그림을 선택하면 원본 크기로 크게 볼 수 있습니다.",
        }),
        h("div", {
          class: "gg-grid",
          children: images.map((img, i) => gridItem(img, i, artist)),
        }),
        h("div", { class: "gg-footer", dangerouslySetInnerHTML: { __html: renderFlowerBedFooter(1200) } }),
        lightbox(),
      ],
    })
  }

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). --lightgray 는 이 다크 테마에서\n   배경과 거의 같은 색이라 선·테두리에 쓰지 않는다(§4 함정 2, garden-home 에서 발견). */\n\n.gallery-page-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n/* 화면에는 안 보이고 스크린리더에만 읽히는 설명. */\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n.gallery-page {\n  margin-top: 1rem;\n}\n\n/* 격자: 모바일 2열, 태블릿 3열, 데스크톱 4열. column 레이아웃이라 그림마다 비율이 달라도\n   자연스럽게 엇갈려 쌓인다(masonry). */\n.gg-grid {\n  column-count: 2;\n  column-gap: 0.6rem;\n}\n@media (min-width: 640px) {\n  .gg-grid {\n    column-count: 3;\n  }\n}\n@media (min-width: 1000px) {\n  .gg-grid {\n    column-count: 4;\n  }\n}\n\n.gg-item {\n  display: block;\n  margin: 0 0 0.6rem;\n  break-inside: avoid;\n  border: 6px solid color-mix(in srgb, var(--color-orange, var(--darkgray)) 55%, var(--light));\n  border-radius: 0.25rem;\n  overflow: hidden;\n  cursor: pointer;\n  background: color-mix(in srgb, var(--color-orange, var(--darkgray)) 12%, var(--light));\n}\n.gg-item:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.gg-item img {\n  display: block;\n  width: 100%;\n  height: 100%;\n  /* aspect-ratio 를 원본 그림 비율로 맞춰 두므로(component.js) cover 든 contain 이든 결과가\n     같지만, width/height 정보가 없는(로컬 등) 기본 4:3 상자에서는 contain 이 안전하다 —\n     \"그림 비율이 제각각이니 잘리지 않게\" 요구사항. */\n  object-fit: contain;\n}\n.gg-item:hover img {\n  filter: brightness(1.08);\n}\n\n/* 맨 아래 장식 화단 가장자리 */\n.gg-footer {\n  margin-top: 1rem;\n  line-height: 0;\n}\n.gg-footer-bed {\n  display: block;\n  width: 100%;\n  height: 42px;\n}\n.gg-footer-soil {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 45%, var(--light));\n}\n.gg-footer-soil-line {\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 70%, var(--light));\n  stroke-width: 1;\n}\n.gg-stem {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-green, var(--secondary)) 70%, var(--light));\n  stroke-width: 1.4;\n}\n.gg-petal-0 {\n  fill: var(--color-pink, var(--tertiary));\n}\n.gg-petal-1 {\n  fill: var(--color-yellow, var(--tertiary));\n}\n.gg-petal-2 {\n  fill: var(--color-purple, var(--secondary));\n}\n.gg-heart {\n  fill: var(--color-orange, var(--secondary));\n}\n\n/* 라이트박스: 원본 크기로 크게 보기 */\n.gg-lightbox {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: color-mix(in srgb, var(--dark) 88%, transparent);\n}\n.gg-lightbox[hidden] {\n  display: none;\n}\n.gg-lb-img {\n  max-width: 92vw;\n  max-height: 82vh;\n  object-fit: contain;\n  display: block;\n}\n.gg-lb-caption {\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 1rem;\n  margin: 0;\n  text-align: center;\n  padding: 0 3rem;\n  color: var(--light);\n  font-size: 0.9rem;\n}\n.gg-lb-close,\n.gg-lb-prev,\n.gg-lb-next {\n  position: absolute;\n  font: inherit;\n  cursor: pointer;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 45%, transparent);\n  border: none;\n  border-radius: 999px;\n}\n.gg-lb-close:hover,\n.gg-lb-prev:hover,\n.gg-lb-next:hover {\n  background: color-mix(in srgb, var(--dark) 65%, transparent);\n}\n.gg-lb-close {\n  top: 1rem;\n  right: 1rem;\n  width: 2.2rem;\n  height: 2.2rem;\n  font-size: 1.1rem;\n}\n.gg-lb-prev,\n.gg-lb-next {\n  top: 50%;\n  transform: translateY(-50%);\n  width: 2.6rem;\n  height: 2.6rem;\n  font-size: 1.6rem;\n}\n.gg-lb-prev {\n  left: 1rem;\n}\n.gg-lb-next {\n  right: 1rem;\n}\n"
  Component.afterDOMLoaded = "// 전체 그림 페이지: 격자에서 그림을 누르면 라이트박스(원본 크기)로 크게 보고, 좌우 버튼/화살표\n// 키로 넘기고, 닫기 버튼·배경 클릭·Escape 로 닫는다.\n;(function () {\n  function initGalleryPage(section) {\n    if (!section || section.dataset.ggInit === \"true\") return\n    section.dataset.ggInit = \"true\"\n\n    var items = Array.prototype.slice.call(section.querySelectorAll(\".gg-item\"))\n    var lb = section.querySelector(\".gg-lightbox\")\n    if (!items.length || !lb) return\n\n    var img = lb.querySelector(\".gg-lb-img\")\n    var caption = lb.querySelector(\".gg-lb-caption\")\n    var closeBtn = lb.querySelector(\".gg-lb-close\")\n    var prevBtn = lb.querySelector(\".gg-lb-prev\")\n    var nextBtn = lb.querySelector(\".gg-lb-next\")\n    var current = -1\n    var lastFocused = null\n\n    function show(i) {\n      current = ((i % items.length) + items.length) % items.length\n      var item = items[current]\n      img.src = item.dataset.full\n      img.alt = item.dataset.caption || \"작품 이미지\"\n      caption.textContent = item.dataset.caption || \"\"\n    }\n\n    function open(i) {\n      lastFocused = document.activeElement\n      show(i)\n      lb.hidden = false\n      document.body.style.overflow = \"hidden\"\n      if (closeBtn) closeBtn.focus()\n    }\n\n    function close() {\n      lb.hidden = true\n      document.body.style.overflow = \"\"\n      if (lastFocused && lastFocused.focus) lastFocused.focus()\n    }\n\n    items.forEach(function (item, i) {\n      item.addEventListener(\"click\", function () {\n        open(i)\n      })\n    })\n    if (closeBtn) closeBtn.addEventListener(\"click\", close)\n    if (prevBtn) prevBtn.addEventListener(\"click\", function () { show(current - 1) })\n    if (nextBtn) nextBtn.addEventListener(\"click\", function () { show(current + 1) })\n\n    lb.addEventListener(\"click\", function (e) {\n      if (e.target === lb) close()\n    })\n    lb.addEventListener(\"keydown\", function (e) {\n      if (e.key === \"Escape\") close()\n      else if (e.key === \"ArrowLeft\") show(current - 1)\n      else if (e.key === \"ArrowRight\") show(current + 1)\n    })\n\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        document.body.style.overflow = \"\"\n        section.dataset.ggInit = \"false\"\n      })\n    }\n  }\n\n  function init() {\n    initGalleryPage(document.querySelector(\".gallery-page\"))\n  }\n\n  document.addEventListener(\"nav\", init)\n  init()\n})()\n"
  return Component
}
