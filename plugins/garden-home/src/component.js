// 서버(빌드) 쪽 컴포넌트. hdr-comments 와 같은 방식으로 preact vnode 를 직접 만든다
// (Quartz 는 플러그인 dist 의 외부 의존성을 허용하지 않는다). 아래 CSS 자리표시자는
// build.mjs 가 채운다. 클라이언트 스크립트는 아직 없다(자리 표시 섹션뿐이라 움직일 게 없음) —
// 실제 정원/radar/슬라이드쇼를 채울 때는 애니메이션에 prefers-reduced-motion 을 지켜야 한다
// (CLAUDE.md §9). 이 컴포넌트는 quartz.config.yaml 에서 layout.condition: "index" 로 등록해
// 홈에서만 나오게 한다 — 컴포넌트 자체는 페이지를 가리지 않는다.

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
    if (show.garden) sections.push(placeholder("정원", "scribbled notes 의 글이 식물로 자라는 그림 — 다음 단계에서 채울 예정."))
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
