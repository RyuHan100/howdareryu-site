// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
// 서버(빌드) 쪽 컴포넌트. 화면 맨 위에 고정되는 얇은 트랙 + 바 두 겹만 찍는다. 실제 진행률
// 계산·갱신은 전부 afterDOMLoaded 스크립트(클라이언트)가 한다. 외부 import 없이 preact
// vnode 를 직접 만든다(Quartz 는 플러그인 dist 의 외부 의존성을 허용하지 않는다 —
// hdr-comments/garden-home/focus-mode 와 같은 방식).
//
// 순수 시각적 보조 장치라 aria-hidden — 스크롤마다 값이 바뀌는 role="progressbar" 를 스크린
// 리더에 그대로 노출하면 매 프레임 값이 바뀌었다고 계속 알림이 갈 수 있어서, 이 사이트의
// 다른 장식용 요소와 같은 방식으로 접근성 트리에서 아예 뺀다(요구사항: "장식적 UI라면
// 적절한 접근성 처리").
//
// CSS/스크립트 자리표시자는 build.mjs 가 채운다.

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

export const ReadingProgress = () => {
  const Component = ({ displayClass }) => {
    return h("div", {
      class: [displayClass, "reading-progress"].filter(Boolean).join(" "),
      "aria-hidden": "true",
      children: [h("div", { class: "reading-progress-bar" })],
    })
  }

  Component.css = "/* 화면 맨 위, 아주 얇게(3px — 요구사항: 미니멀). Quartz 자체의 SPA 이동 로딩 바\n   (quartz/styles/base.scss 의 .navigation-progress, z-index:9999)와 같은 자리(top:0,\n   height:3px)를 쓰지만, z-index 는 그보다 낮게 둔다 — 페이지 이동 중 잠깐 겹치는 순간에는\n   \"지금 로딩 중\"이라는 신호가 더 중요하므로 로딩 바가 자연스럽게 위에 그려지게 한다. 색은\n   그 로딩 바와 같은 var(--secondary) 를 재사용해서(요구사항: 새 디자인 시스템 금지) 같은\n   시각 언어로 보이게 했다. */\n.reading-progress {\n  position: fixed;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 3px;\n  z-index: 40;\n  pointer-events: none;\n}\n.reading-progress[hidden] {\n  display: none;\n}\n.reading-progress-bar {\n  height: 100%;\n  width: 100%;\n  background: var(--secondary);\n  transform: scaleX(0);\n  transform-origin: left;\n}\n/* scroll 마다 값이 바뀌므로 transform 만 쓴다(레이아웃을 건드리는 width 대신 — 성능 요구사항).\n   부드럽게 따라가는 정도의 짧은 tween 만 reduced-motion 이 아닐 때만 켠다. */\n@media (prefers-reduced-motion: no-preference) {\n  .reading-progress-bar {\n    transition: transform 0.1s linear;\n  }\n}\n"
  Component.afterDOMLoaded = "// afterDOMLoaded — <article> 기준으로 스크롤 진행률을 계산해 위쪽 바에 반영한다.\n//\n// 기준 element: document.querySelector(\"article\") — Quartz 의 실제 렌더링 구조(quartz/\n// components/frames/DefaultFrame.tsx)에서 본문 콘텐츠는 항상 <article class=\"popover-hint\">\n// 하나뿐이다. 클래스가 아니라 태그로 찾는 이유: beforeBody 를 감싸는 .page-header 안의\n// 래퍼 div 도 우연히 같은 \"popover-hint\" 클래스를 쓰고 있어서(팝오버 미리보기 기능용,\n// 이 컴포넌트와 무관) 클래스로 찾으면 엉뚱한(더 먼저 나오는) 요소를 잡는다 — 헤드리스\n// 크롬으로 실제 DOM 을 떠서 확인 후 태그 선택자로 바꿨다(2026-09-24).\n//\n// 성능: scroll 이벤트에서는 절대 getBoundingClientRect/offsetHeight 등 강제 리플로우를\n// 유발하는 측정을 하지 않는다 — 캐시된 articleTop/scrollableHeight 와 window.scrollY 만\n// 읽고 transform 만 쓴다(레이아웃에 영향 없음). 실제 측정(measure)은 초기화·ResizeObserver·\n// window resize 때만 한다 — ResizeObserver 가 <article> 자체를 관찰하므로 집중 모드\n// (plugins/focus-mode)가 본문 폭을 바꿔 텍스트가 다시 줄바꿈되어 높이가 바뀌는 경우도\n// 이 컴포넌트를 전혀 안 건드리고도 자동으로 잡힌다.\n;(function () {\n  var wrap = null\n  var bar = null\n  var articleEl = null\n  var articleTop = 0\n  var scrollableHeight = 0\n  var scrollTicking = false\n\n  function measure() {\n    if (!articleEl) return\n    var rect = articleEl.getBoundingClientRect()\n    articleTop = rect.top + window.scrollY\n    scrollableHeight = Math.max(articleEl.offsetHeight - window.innerHeight, 0)\n  }\n\n  function update() {\n    if (!bar) return\n    if (scrollableHeight <= 0) {\n      // 화면에 다 들어오는 짧은 글 — 더 스크롤할 게 없으니 꽉 채운다.\n      bar.style.transform = \"scaleX(1)\"\n      return\n    }\n    var raw = (window.scrollY - articleTop) / scrollableHeight\n    var clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw\n    bar.style.transform = \"scaleX(\" + clamped + \")\"\n  }\n\n  function onScroll() {\n    if (scrollTicking) return\n    scrollTicking = true\n    requestAnimationFrame(function () {\n      scrollTicking = false\n      update()\n    })\n  }\n\n  function onResize() {\n    measure()\n    update()\n  }\n\n  function init() {\n    wrap = document.querySelector(\".reading-progress\")\n    if (!wrap) return\n    bar = wrap.querySelector(\".reading-progress-bar\")\n    articleEl = document.querySelector(\"article\")\n\n    // climate histography 처럼 세로 스크롤로 \"읽는\" 페이지가 아니라 자체 가로 스크롤·줌을\n    // 가진 시각화 페이지에서는 진행률 바가 부자연스럽다(요구사항) — timeline 코드는 안\n    // 건드리고 그 마크업(.climate-timeline)이 있는지만 본다.\n    if (!articleEl || document.querySelector(\".climate-timeline\")) {\n      wrap.hidden = true\n      return\n    }\n    wrap.hidden = false\n\n    measure()\n    update()\n\n    window.addEventListener(\"scroll\", onScroll, { passive: true })\n    window.addCleanup(function () {\n      window.removeEventListener(\"scroll\", onScroll)\n    })\n\n    window.addEventListener(\"resize\", onResize)\n    window.addCleanup(function () {\n      window.removeEventListener(\"resize\", onResize)\n    })\n\n    if (typeof ResizeObserver !== \"undefined\") {\n      var ro = new ResizeObserver(onResize)\n      ro.observe(articleEl)\n      window.addCleanup(function () {\n        ro.disconnect()\n      })\n    }\n  }\n\n  // nav 는 최초 로드 + 이후 모든 SPA 이동(뒤로/앞으로 가기 포함, spa.inline.ts 의 popstate\n  // 핸들러도 결국 notifyNav 를 부른다)마다 한 번씩만 온다. 새 페이지의 <article> 을 다시\n  // 찾고, 이전 페이지의 리스너/ResizeObserver 는 Quartz 라우터가 nav 직전에 모든\n  // window.addCleanup 콜백을 실행해 정리해 준다 — 여기서 따로 또 지울 필요가 없다.\n  document.addEventListener(\"nav\", init)\n})()\n"
  return Component
}
