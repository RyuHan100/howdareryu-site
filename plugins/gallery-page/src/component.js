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
      h("p", { class: "gg-lb-caption" }),
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

  Component.css = __STYLES__
  Component.afterDOMLoaded = __SCRIPT__
  return Component
}
