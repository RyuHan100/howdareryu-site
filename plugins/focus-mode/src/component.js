// 서버(빌드) 쪽 컴포넌트. 좌우 sidebar 를 숨기는 "집중 모드" 토글 버튼 하나만 찍는다.
// 외부 import 없이 preact vnode 를 직접 만든다(Quartz 는 플러그인 dist 의 외부 의존성을
// 허용하지 않는다 — hdr-comments/garden-home/gallery-page 와 같은 방식).
//
// beforeBody 위치에 두는 이유: darkmode/reader-mode 처럼 left sidebar 의 toolbar 그룹에
// 두면, 집중 모드를 켜는 순간 그 sidebar 가 통째로 숨어서 버튼 자신도 같이 사라져 다시 끌
// 방법이 없어진다(toggle-lock). sidebar 를 숨겨도 항상 남아 있는 .center 영역(beforeBody)에
// 둬야 양쪽 모드에서 계속 누를 수 있다.
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

function icon(className, segments) {
  return h("svg", {
    class: className,
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    children: segments.map((d) => h("path", { d })),
  })
}

// 기본(꺼짐) 상태 아이콘: 네 귀퉁이 화살표가 바깥으로 — "펼치기"
const EXPAND_SEGMENTS = [
  "M4 10 L4 4 L10 4",
  "M14 4 L20 4 L20 10",
  "M4 14 L4 20 L10 20",
  "M20 14 L20 20 L14 20",
]
// 켜짐 상태 아이콘: 네 귀퉁이 화살표가 안쪽으로 — "되돌리기"
const COLLAPSE_SEGMENTS = [
  "M9 3 L9 9 L3 9",
  "M15 3 L15 9 L21 9",
  "M9 21 L9 15 L3 15",
  "M15 21 L15 15 L21 15",
]

// focus-mode-interactive.js 의 라벨과 반드시 같은 문구를 쓴다(초기 렌더 · 이후 갱신이 서로
// 어긋나지 않게). 둘 다 짧은 문자열이라 별도 공유 모듈 없이 각자 파일에 둔다.
const LABEL_OFF = "집중 모드 켜기 — 좌우 사이드바 숨기기"

export const FocusModeToggle = () => {
  const Component = ({ displayClass }) => {
    return h("div", {
      class: [displayClass, "focus-mode-bar"].filter(Boolean).join(" "),
      children: [
        h("button", {
          type: "button",
          class: "focus-mode-toggle",
          "aria-pressed": "false",
          "aria-label": LABEL_OFF,
          title: LABEL_OFF,
          children: [icon("fm-expand", EXPAND_SEGMENTS), icon("fm-collapse", COLLAPSE_SEGMENTS)],
        }),
      ],
    })
  }

  Component.css = __STYLES__
  Component.beforeDOMLoaded = __PRESCRIPT__
  Component.afterDOMLoaded = __SCRIPT__
  return Component
}
