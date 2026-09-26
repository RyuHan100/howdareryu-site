// 서버(빌드) 쪽 컴포넌트. hdr-comments 와 같은 방식으로 preact vnode 를 직접 만든다
// (Quartz 는 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). 맨 아래
// Component.css/afterDOMLoaded 의 자리표시자는 build.mjs 가 채우고(문자열 그대로 두 번 나오면
// build.mjs 의 string.replace 가 첫 번째 것만 바꾸므로, 이 이름을 다른 주석에 다시 적지 않는다),
// garden-svg.js 는 build.mjs 가 이 파일 앞에 붙인다. 정원의 상호작용·움직임(garden-interactive.js)
// 은 prefers-reduced-motion 을 지킨다(CLAUDE.md §9). 이 컴포넌트는 quartz.config.yaml 에서
// layout.condition: "index" 로 등록해 홈에서만 나오게 한다.
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

// climate histography 를 홈에도 통째로 넣는다(radar 아래, 아빠의 화단 위 — 사용자 지시,
// 2026-09-23). 렌더 함수(renderTimeline)는 plugins/climate-timeline/src/timeline-render.js
// 그 파일 그대로다 — build.mjs 가 이 파일 바로 앞에 이어 붙인다(아래 참고). 그래서 이벤트를
// climate-timeline.json 에 추가하면 /timeline/ 페이지와 홈이 같은 함수·같은 데이터를 쓰므로
// 둘 다 같이 바뀐다(따로 맞춰줄 필요 없음). 데이터 파일 경로만 여기서 다시 적는다(다른 plugin
// 소스라 import 는 안 되지만, node:fs 로 읽는 경로 상수는 새로 선언해야 한다).
const TIMELINE_DATA_PATH = join(process.cwd(), "plugins/climate-timeline/data/climate-timeline.json")

function readTimelineData() {
  try {
    return JSON.parse(readFileSync(TIMELINE_DATA_PATH, "utf-8"))
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

// ② 정원 — garden-svg.js 의 renderGarden 이 만든 SVG 를 그대로 넣는다. 클릭/키보드로 식물을
// 고르는 패널과 타임랩스 재생 버튼은 마크업만 여기서 만들고(빈 자리), 실제 동작은
// garden-interactive.js(afterDOMLoaded, §8)가 한다.
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
      h("p", {
        class: "sr-only",
        children:
          "최근 쓴 글을 식물로 표현합니다. 식물 하나가 노트 하나이고 모양은 풀·꽃·덩굴·나무 중 그 글의 성격을 나타내며, 시든(흙빛) 식물은 오래 손보지 않은 글입니다. 식물을 선택하면 제목·물 준 날·노트로 가는 링크가 나옵니다.",
      }),
      h("div", {
        class: "gp-controls",
        children: [
          h("button", { type: "button", class: "gp-play", children: "▶ 타임랩스로 보기" }),
          h("span", { class: "gp-timelapse-date", "aria-live": "polite" }),
        ],
      }),
      h("div", { class: "gp-garden", dangerouslySetInnerHTML: { __html: g.html } }),
      h("p", { class: "gp-legend", children: parts.join(" · ") }),
      h("div", {
        class: "gp-panel",
        role: "status",
        children: [
          h("button", { type: "button", class: "gp-panel-close", "aria-label": "닫기", children: "✕" }),
          h("p", { class: "gp-panel-title" }),
          h("p", { class: "gp-panel-meta" }),
          h("a", { class: "gp-panel-link", children: "노트로 가기 →" }),
        ],
      }),
    ],
  })
}

// ③ radar — radar-svg.js 의 renderRadar 가 만든 SVG 를 그대로 넣는다. 점 클릭 패널·화면 밖
// 정지는 radar-interactive.js(afterDOMLoaded)가 한다.
function radarSection() {
  const data = readGardenData()
  const subfolders = data?.radar?.subfolders ?? []
  const notes = data?.radar?.notes ?? []
  if (subfolders.length === 0) {
    return placeholder("radar", "radar 폴더가 아직 없어요.")
  }
  const r = renderRadar(subfolders, notes, new Date())
  const legend = subfolders
    .map((s) => `${s.label} ${s.count}`)
    .join(" · ")
  return h("section", {
    class: "garden-home-section garden-home-radar",
    children: [
      h("h3", { children: "radar" }),
      h("p", {
        class: "sr-only",
        children:
          "감시 중인 폴더별로 부채꼴 구역을 나누고, 최근 30일 안의 기록을 점으로 표시합니다. 중심에 가까울수록 최근 기록이고 가장자리는 30일 전입니다. 점을 선택하면 구역·날짜·제목과 노트로 가는 링크가 나옵니다.",
      }),
      h("div", { class: "radar-face-wrap", dangerouslySetInnerHTML: { __html: r.html } }),
      h("p", { class: "gp-legend", children: `최근 30일 ${r.count}건 · ${legend}` }),
      h("div", {
        class: "gp-panel radar-panel",
        role: "status",
        children: [
          h("button", { type: "button", class: "gp-panel-close", "aria-label": "닫기", children: "✕" }),
          h("p", {
            class: "gp-panel-meta",
            children: [
              h("span", { class: "radar-panel-subfolder" }),
              text(" · "),
              h("span", { class: "radar-panel-date" }),
            ],
          }),
          h("p", { class: "gp-panel-title radar-panel-title" }),
          h("a", { class: "gp-panel-link radar-panel-link", children: "노트로 가기 →" }),
        ],
      }),
    ],
  })
}

/** 캡션: 제목·연도·재료·작가. 있는 것만 이어 붙이고, 하나도 없으면 null(칸 자체를 안 만든다). */
function galleryCaption(img, artist) {
  const parts = [img.title, img.year ? `${img.year}년` : null, img.material, artist].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

// ④ 아빠의 화단 — 최근 그림을 가운데 한 장 + 양옆 작은 그림으로 늘어놓은 필름스트립.
// 넘기기·자리 계산·일시정지·라이트박스는 gallery-interactive.js(afterDOMLoaded)가 한다.
function gallerySection() {
  const data = readGardenData()
  const images = data?.gallery?.images ?? []
  const cfg = data?.config?.gallery ?? {}
  const artist = cfg.artist || ""
  if (images.length === 0) {
    return placeholder("아빠의 화단", "아직 올린 그림이 없어요.")
  }
  const count = Math.max(1, Number(cfg.home_count) || 10)
  const intervalMs = Math.max(1, Number(cfg.interval_seconds) || 4) * 1000
  const recent = images.slice(0, count)

  const slides = recent.map((img, i) => {
    const alt = galleryCaption(img, artist) ?? "작품 이미지"
    const caption = galleryCaption(img, artist)
    return h("figure", {
      class: `gallery-slide${i === 0 ? " is-active" : ""}`,
      "data-index": String(i),
      "data-full": img.src,
      "data-caption": caption ?? "",
      children: [
        h("img", {
          src: img.thumb,
          alt,
          width: img.width || undefined,
          height: img.height || undefined,
          loading: i < 3 || i === recent.length - 1 ? "eager" : "lazy",
          draggable: "false",
        }),
        caption ? h("figcaption", { class: "gallery-caption", children: caption }) : null,
      ].filter(Boolean),
    })
  })

  return h("section", {
    class: "garden-home-section garden-home-gallery",
    "data-interval-ms": String(intervalMs),
    children: [
      h("h3", { children: "아빠의 화단" }),
      h("p", {
        class: "sr-only",
        children:
          "아버지의 그림을 최근 순서로 늘어놓은 슬라이드쇼입니다. 자동으로 넘어가며, 좌우 버튼·옆 그림·아래 꽃봉오리 목록으로 그림을 고를 수 있고, 가운데 그림을 선택하면 검은 화면에서 크게 볼 수 있습니다.",
      }),
      cfg.intro ? h("p", { class: "gp-legend gallery-intro", children: cfg.intro }) : null,
      h("div", {
        class: "gallery-slideshow",
        children: [
          h("div", {
            class: "gallery-slide-track",
            children: slides,
          }),
          h("button", { type: "button", class: "gallery-nav gallery-prev", "aria-label": "이전 그림", children: "‹" }),
          h("button", { type: "button", class: "gallery-nav gallery-next", "aria-label": "다음 그림", children: "›" }),
          h("button", { type: "button", class: "gallery-play", "aria-label": "일시정지", children: "❙❙" }),
        ],
      }),
      h("div", {
        class: "gallery-buds",
        role: "tablist",
        "aria-label": "그림 목록",
        dangerouslySetInnerHTML: { __html: renderGalleryBuds(recent.length, 0) },
      }),
      h("a", { class: "gallery-view-all", href: "./gallery", children: "전체 보기 →" }),
      h("div", {
        class: "gallery-lightbox",
        hidden: true,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "그림 크게 보기",
        children: [
          h("button", { type: "button", class: "gallery-lb-close", "aria-label": "닫기", children: "✕" }),
          h("button", { type: "button", class: "gallery-lb-prev", "aria-label": "이전 그림", children: "‹" }),
          h("img", { class: "gallery-lb-img", alt: "" }),
          h("p", { class: "gallery-lb-caption" }),
          h("button", { type: "button", class: "gallery-lb-next", "aria-label": "다음 그림", children: "›" }),
        ],
      }),
    ].filter(Boolean),
  })
}

// ③.5 climate histography — radar 아래, 아빠의 화단 위(사용자 지시, 2026-09-23). 미리보기가
// 아니라 /timeline/ 과 똑같은 전체 타임라인을 그대로 넣는다 — renderTimeline() 은
// climate-timeline 플러그인의 timeline-render.js 그 함수이고(build.mjs 가 이어 붙임), CSS도
// climate-timeline 플러그인이 전역 번들에 실어 두므로(모든 페이지가 모든 컴포넌트 CSS 청크를
// 불러온다) 여기서 따로 만들 필요가 없다. 상호작용(필터·클릭 상세 모달)도 timeline-interactive.js
// 가 ".climate-timeline" 클래스를 그대로 찾으므로 클래스 이름을 /timeline/ 페이지와 동일하게 둔다.
function timelineFullSection() {
  const data = readTimelineData()
  const events = data?.events ?? []
  const categories = data?.categories ?? []
  const html = events.length > 0 ? renderTimeline(events, categories) : null

  if (!html) {
    return placeholder("climate histography", "아직 연표에 채운 사건이 없어요.")
  }

  return h("section", {
    class: "garden-home-section climate-timeline",
    children: [
      h("h3", { children: "climate histography" }),
      h("p", {
        class: "sr-only",
        children:
          "1824년부터 지금까지 기후 관련 사건을 월 단위로 배치한 가로 타임라인입니다. 위 카테고리 버튼으로 필터링할 수 있고, 타임라인 영역만 가로로 스크롤됩니다.",
      }),
      h("div", { dangerouslySetInnerHTML: { __html: html } }),
      h("a", { class: "garden-home-timeline-link", href: "./timeline", children: "전체 화면으로 보기 →" }),
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
    if (show.radar) sections.push(radarSection())
    sections.push(timelineFullSection())
    if (show.gallery) sections.push(gallerySection())
    sections.push(contactSection())

    return h("div", {
      class: [displayClass, "garden-home"].filter(Boolean).join(" "),
      children: sections,
    })
  }

  Component.css = __STYLES__
  Component.afterDOMLoaded = __SCRIPT__
  return Component
}
