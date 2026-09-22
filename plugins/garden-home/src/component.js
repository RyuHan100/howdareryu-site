// 서버(빌드) 쪽 컴포넌트. hdr-comments 와 같은 방식으로 preact vnode 를 직접 만든다
// (Quartz 는 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). 아래 CSS
// 자리표시자는 build.mjs 가 채우고, garden-svg.js 는 build.mjs 가 이 파일 앞에 붙인다.
// 클라이언트 스크립트는 아직 없다(정원은 움직임 없는 SVG). radar/슬라이드쇼처럼 움직이는 걸
// 채울 때는 prefers-reduced-motion 을 지켜야 한다(CLAUDE.md §9). 이 컴포넌트는
// quartz.config.yaml 에서 layout.condition: "index" 로 등록해 홈에서만 나오게 한다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

// quartz/garden/collect.ts 의 GARDEN_DATA_PATH 와 같은 곳. quartz.ts 가 빌드 시작 때 만든다.
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

function text(s) {
  return s
}

// 자리 표시 섹션(②③④). 다음 단계에서 실제 내용으로 바뀐다.
function placeholder(title, note) {
  return h("section", {
    class: "garden-home-section garden-home-placeholder",
    children: [
      h("h3", { children: title }),
      h("p", { class: "garden-home-note", children: note }),
    ],
  })
}

// ② 정원 — garden-svg.js 의 renderGarden 이 만든 SVG 를 그대로 넣는다.
function gardenSection() {
  const data = readGardenData()
  const notes = data?.garden?.notes ?? []
  const labels = data?.config?.plants?.kinds ?? { grass: "풀", flower: "꽃", vine: "덩굴", tree: "나무" }
  if (notes.length === 0) {
    return placeholder("정원", "아직 심은 글이 없어요.")
  }
  const g = renderGarden(notes, labels)
  const parts = ["grass", "flower", "vine", "tree"]
    .filter((k) => g.counts[k])
    .map((k) => `${labels[k] ?? k} ${g.counts[k]}`)
  if (g.wilted) parts.push(`시든 식물 ${g.wilted}`)
  if (g.seeds) parts.push(`씨앗 ${g.seeds}`)
  return h("section", {
    class: "garden-home-section garden-home-garden",
    children: [
      h("h3", { children: "정원" }),
      h("div", { class: "gp-garden", dangerouslySetInnerHTML: { __html: g.html } }),
      h("p", { class: "gp-legend", children: parts.join(" · ") }),
    ],
  })
}

function link(href, children, opts) {
  return h("a", { href, target: opts?.external ? "_blank" : undefined, rel: opts?.external ? "noopener noreferrer" : undefined, children })
}

// ⑤ 정원사에게 연락하기. garden.yaml 의 on/off 와 무관하게 항상 나온다.
function contactSection() {
  const item = (label, node) =>
    h("li", { children: [text(`${label} | `), node] })

  return h("section", {
    class: "garden-home-section garden-home-contact",
    children: [
      h("h3", { children: "정원사에게 연락하기" }),
      h("ul", {
        children: [
          item("Instagram", link("https://www.instagram.com/howdareryu", "@howdareryu", { external: true })),
          item("Email", link("mailto:dare2do.everything@gmail.com", "dare2do.everything@gmail.com")),
          item("GitHub", link("https://github.com/RyuHan100/howdareryu-site", "howdareryu-site", { external: true })),
        ],
      }),
    ],
  })
}

export const GardenHome = (opts) => {
  const show = {
    garden: opts?.garden === true,
    radar: opts?.radar === true,
    gallery: opts?.gallery === true,
  }

  const Component = ({ displayClass }) => {
    const sections = []
    if (show.garden) sections.push(gardenSection())
    if (show.radar) sections.push(placeholder("radar", "radar 폴더의 최근 기록이 레이더 화면에 점으로 뜨는 그림 — 다음 단계에서 채울 예정."))
    if (show.gallery) sections.push(placeholder("아빠의 화단", "content/img/inspiration 의 그림 슬라이드쇼 — 다음 단계에서 채울 예정."))
    sections.push(contactSection())

    return h("div", {
      class: [displayClass, "garden-home"].filter(Boolean).join(" "),
      children: sections,
    })
  }

  Component.css = __STYLES__
  return Component
}
