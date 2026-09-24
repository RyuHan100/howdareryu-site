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

  Component.css = __STYLES__
  Component.afterDOMLoaded = __SCRIPT__
  return Component
}
