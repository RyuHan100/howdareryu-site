// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
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

  Component.css = "/* ---------- 토글 버튼 ----------\n   quartz-community/darkmode·reader-mode 와 같은 크기의 아이콘 버튼(테마 CSS 변수만 사용,\n   CLAUDE.md §9). beforeBody 안에 두는 이유는 component.js 주석 참고 — sidebar 를 숨겨도\n   이 버튼은 항상 보여야 다시 끌 수 있다. */\n.focus-mode-bar {\n  display: flex;\n  justify-content: flex-end;\n  margin: 0 0 0.5rem;\n}\n\n.focus-mode-toggle {\n  cursor: pointer;\n  padding: 4px;\n  position: relative;\n  background: none;\n  border: none;\n  border-radius: 6px;\n  width: 28px;\n  height: 28px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n  color: var(--darkgray);\n  transition: background-color 0.1s ease;\n}\n.focus-mode-toggle:hover {\n  background-color: color-mix(in srgb, var(--gray) 20%, transparent);\n}\n.focus-mode-toggle:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n/* 눌렀을 때 시각 피드백(\"active\" 상태) — 실제 클릭에 대한 즉각 반응이라 reduced-motion\n   에서도 상태 자체는 그대로 두고, 부드러운 tween(transition)만 아래에서 꺼진다. */\n.focus-mode-toggle:active {\n  background-color: color-mix(in srgb, var(--gray) 32%, transparent);\n  transform: scale(0.92);\n}\n.focus-mode-toggle svg {\n  width: 18px;\n  height: 18px;\n}\n\n/* 기본(꺼짐): 펼치기 아이콘만 보임. 켜짐: 되돌리기 아이콘만 — darkmode 의 day/nightIcon\n   전환과 같은 개념(quartz-community/darkmode)이지만, 여기서는 즉시 스위치가 아니라 겹쳐\n   놓고 opacity 로 서로 자리를 바꾼다(버튼 자체가 작아서 자리는 안 흔들리고 아이콘만 은은하게\n   바뀐다). */\n.focus-mode-toggle .fm-expand,\n.focus-mode-toggle .fm-collapse {\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  transform: translate(-50%, -50%);\n  opacity: 1;\n}\n.focus-mode-toggle .fm-collapse {\n  opacity: 0;\n}\nhtml[data-focus-mode=\"on\"] .focus-mode-toggle .fm-expand {\n  opacity: 0;\n}\nhtml[data-focus-mode=\"on\"] .focus-mode-toggle .fm-collapse {\n  opacity: 1;\n}\n@media (prefers-reduced-motion: no-preference) {\n  .focus-mode-toggle .fm-expand,\n  .focus-mode-toggle .fm-collapse {\n    transition: opacity 0.15s ease;\n  }\n}\n\n/* ============================================================================\n   3-column → 본문만 넓게\n   ============================================================================\n   .page[data-frame=\"default\"] 페이지(사이드바가 있는 일반 프레임)에서만 적용한다 — 이미\n   sidebar 가 없는 full-width/minimal 프레임(캔버스 등)은 이 선택자와 무관해 그대로 둔다.\n\n   grid-template-columns 자체를 부드럽게 transition 하는 방법(sidebar 트랙만 0으로 줄이고\n   가운데 auto 트랙이 나머지를 흡수)을 먼저 시도했지만 버렸다 — 헤드리스 크롬으로 확인한\n   결과(2026-09-24), .center 의 max-width:900px!important 오버라이드가 그리드 트랙의\n   \"지금 이 순간\" 크기가 아니라 언제나 즉시 최종값(900px)으로 계산돼서, 트랙이 아직\n   250~300px 남아 있는 전환 중간 시점에도 .center 가 이미 900px로 튀어나와 sidebar 와\n   시각적으로 겹치는 문제가 있었다(raw transition, @property 로 등록한 커스텀 프로퍼티,\n   JS 로 매 프레임 직접 style 을 덮어쓰는 방법까지 셋 다 똑같았다 — 그리드 트랙 애니메이션\n   자체가 아니라 .center 사이징 쪽 문제라 이 사이트에서는 트랙을 부드럽게 줄이는 접근이\n   안전하지 않다). grid-template-columns/areas 자체에 transition-delay 로 스냅을 늦추는\n   것도 시도했지만, 트랙 \"개수\"가 바뀌는 이산적(discrete) 값이라 delay 가 무시되고 계산이\n   깨지는 중간값이 나오는 것도 확인했다(마찬가지로 2026-09-24) — 그래서 타이밍은 CSS 가\n   아니라 JS(focus-mode-interactive.js)가 확실하게 맡는다: sidebar 의 opacity 페이드가\n   끝난 뒤에만(0.2s, 아래) html 에 .fm-layout-collapsed 클래스를 붙여서 그리드를 스냅한다\n   (\"이미 안 보이는 것이 사라지고 그 자리를 본문이 채우는\" 것처럼 보이게). 끌 때는 반대로\n   클래스를 즉시 떼어 3-column 으로 되돌리고, sidebar 는 그 안에서 opacity 로 차오른다.\n\n   데스크톱/태블릿에서는 grid-template-areas 에서 \"grid-sidebar-left/right\" 이름 자체를\n   빼지 않는다(예전엔 뺐었다) — sidebar 는 opacity 페이드를 위해 이 시점에도 여전히\n   display:flex 상태라서, 이름이 없어지면 grid-area 참조가 무효가 되어 grid 가 그 항목을\n   auto-placement 로 새 암시적(implicit) 트랙에 끼워 넣어 버린다(보이진 않지만 실제 공간을\n   차지해 .center 가 제대로 안 넓어지는 버그, 헤드리스 크롬으로 확인·수정, 2026-09-24).\n   대신 이름은 그대로 두고 그 트랙의 \"크기\"만 0으로 줄인다 — 스냅이라 트랙이 이미 최종\n   크기(0)로 곧장 바뀌므로, 트랙 애니메이션 도중에만 생겼던 앞의 .center 문제와도 무관하다. */\n@media (min-width: 1200px) {\n  html.fm-layout-collapsed .page[data-frame=\"default\"] > #quartz-body {\n    grid-template-columns: 0px auto 0px;\n  }\n}\n@media (min-width: 800px) and (max-width: 1200px) {\n  html.fm-layout-collapsed .page[data-frame=\"default\"] > #quartz-body {\n    grid-template-columns: 0px auto;\n  }\n}\n@media (max-width: 800px) {\n  html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body {\n    grid-template-rows: auto auto auto;\n    grid-template-areas:\n      \"grid-header\"\n      \"grid-center\"\n      \"grid-footer\";\n  }\n}\n\n/* sidebar 자체: opacity 로 옅어지고, visibility 는 옅어지는 게 끝난 뒤에만(끌 때) hidden 으로\n   바뀌게 지연시켜서 접근성 트리·키보드 tab 순서에서 미리 빠지지 않다가, 켤 때는 즉시\n   visible 로 돌아와 opacity 가 차오르는 걸 볼 수 있게 한다(비대칭 delay, 흔한 fade 패턴).\n   이 부분은 data-focus-mode 속성에 바로 반응한다(클릭 즉시 시작) — 지연되는 건 위의 그리드\n   스냅뿐이다. 모바일은 sidebar 가 열이 아니라 행이라 애니메이션 없이 기존처럼 display:none\n   만 쓴다(요구사항: \"성능상 문제가 있으면 무거운 처리 안 해도 된다\").\n   min-width:0 은 평소(정상 모드)에도 걸어 둔다 — 그리드 아이템의 기본 min-width:auto 는\n   내용(패딩 등) 만큼의 최소 폭을 보장해서, 트랙을 0px 로 줄여도 실제로는 수십 px 가 남는\n   것을 헤드리스 크롬으로 확인했다(2026-09-24). 정상 모드에서는 트랙이 320px 로 이미 그\n   최소치보다 넉넉해서 이 규칙이 아무 시각적 차이를 안 만든다. */\n.page[data-frame=\"default\"] > #quartz-body .sidebar.left,\n.page[data-frame=\"default\"] > #quartz-body .sidebar.right {\n  min-width: 0;\n}\n@media (min-width: 800px) {\n  html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .sidebar.left,\n  html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .sidebar.right {\n    opacity: 0;\n    visibility: hidden;\n    pointer-events: none;\n  }\n  @media (prefers-reduced-motion: no-preference) {\n    .page[data-frame=\"default\"] > #quartz-body .sidebar.left,\n    .page[data-frame=\"default\"] > #quartz-body .sidebar.right {\n      transition:\n        opacity 0.2s ease,\n        visibility 0s linear 0s;\n    }\n    html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .sidebar.left,\n    html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .sidebar.right {\n      transition:\n        opacity 0.2s ease,\n        visibility 0s linear 0.2s;\n    }\n  }\n}\n@media (max-width: 800px) {\n  html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .sidebar.left,\n  html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .sidebar.right {\n    display: none;\n  }\n}\n\n/* 본문이 지나치게 넓어져 한 줄이 너무 길어지지 않도록 폭을 제한한다(기존 본문 타이포그래피는\n   그대로 두고 이 컨테이너만 제한 — padding-left/right 는 여기서 안 건드리므로 테마가 정한\n   본문 여백은 그대로 유지된다). 위 그리드 스냅과 같은 타이밍(desktop/tablet 은\n   .fm-layout-collapsed, 모바일은 data-focus-mode 직접)에 맞춰야 sidebar 가 아직 남아 있는\n   순간에 본문이 먼저 넓어져 겹치는 일이 없다.\n   !important 가 필요한 이유(CLAUDE.md §4 함정과 같은 종류): hackthebox 테마(quartz-themes,\n   .quartz/plugins/quartz-themes/src/templateCSS.ts)가 데스크톱 폭에서 이미\n   `.page > #quartz-body .center { min-width/max-width: calc(100% - 3rem) }` 를\n   @layer obsidian-theme(등)로 심어 두는데, 이 사이트는 컴포넌트 CSS 를 전부 더 낮은 우선순위인\n   @layer quartz-base 안에 넣는다(@layer quartz-base, obsidian-theme, quartz-themes-base,\n   obsidian-theme-overrides — 뒤 레이어가 항상 이긴다, specificity 는 그 다음 기준). 그래서\n   selector 를 아무리 구체적으로 써도 이 레이어보다 낮은 layer 안에서는 이길 수 없고, 여기서만\n   좁게 !important 를 쓴다(헤드리스 크롬으로 확인 후 추가, 2026-09-24). */\n@media (min-width: 800px) {\n  html.fm-layout-collapsed .page[data-frame=\"default\"] > #quartz-body .center {\n    max-width: 900px !important;\n    min-width: 0 !important;\n    margin-left: auto !important;\n    margin-right: auto !important;\n  }\n}\n@media (max-width: 800px) {\n  html[data-focus-mode=\"on\"] .page[data-frame=\"default\"] > #quartz-body .center {\n    max-width: 900px !important;\n    min-width: 0 !important;\n    margin-left: auto !important;\n    margin-right: auto !important;\n  }\n}\n"
  Component.beforeDOMLoaded = "// beforeDOMLoaded — prescript.js 에 실려 <head> 파싱 중(첫 페인트 전)에 동기 실행된다.\n// darkmode 플러그인이 :root[saved-theme] 를 똑같은 타이밍에 심는 것과 같은 이유: 여기서\n// 미리 속성을 심어 둬야 CSS 가 이미 로드된 상태로 첫 페인트부터 집중 모드가 적용되고,\n// \"3-column 으로 잠깐 보였다가 넓어지는\" 깜빡임이 없다.\n;(function () {\n  try {\n    if (localStorage.getItem(\"focus-mode\") === \"on\") {\n      document.documentElement.setAttribute(\"data-focus-mode\", \"on\")\n      // 첫 로드는 \"전환\"이 아니라 이미 그 상태로 시작하는 것이므로, 레이아웃 스냅을\n      // 지연시키는 fm-layout-collapsed 클래스(focus-mode-interactive.js/focus-mode.css)도\n      // 곧바로 같이 붙여야 한다 — 안 그러면 페이지가 3-column 으로 그려졌다가 나중에\n      // 집중 모드로 바뀌는 깜빡임이 생긴다.\n      document.documentElement.classList.add(\"fm-layout-collapsed\")\n    }\n  } catch (e) {\n    // localStorage 를 못 쓰는 환경(프라이빗 모드 등) — 기본 3-column 레이아웃으로 정상 동작\n  }\n})()\n"
  Component.afterDOMLoaded = "// afterDOMLoaded — 버튼 클릭·키보드 처리 + localStorage 저장. 상태 자체는 <html\n// data-focus-mode> 속성 하나로 관리한다: Quartz 의 SPA 라우터(spa.inline.ts)는 micromorph 로\n// document.body 만 갈아 끼우고 document.documentElement(<html>) 는 건드리지 않으므로, 이\n// 속성은 페이지 이동(nav) 마다 다시 설정해 줄 필요 없이 그대로 유지된다 — CSS 선택자\n// (focus-mode.css 의 html[data-focus-mode=\"on\"] ...)가 새로 그려진 sidebar/center 에도\n// 곧바로 적용된다. 버튼 엘리먼트 자체는 페이지마다 새로 생기므로, nav 때마다 클릭 리스너만\n// 다시 건다.\n//\n// 키보드 단축키(Cmd/Ctrl+Shift+F)와 Escape 는 document 전역에 딱 한 번만 건다 — document 는\n// SPA 이동으로 안 바뀌므로 nav 마다 다시 걸 필요가 없고(중복 리스너 방지), afterDOMLoaded\n// 스크립트 자체가 실제 페이지 로드당 한 번만 실행된다(SPA 이동 때는 재실행 안 됨)는 것도\n// 이미 같은 보장을 준다.\n;(function () {\n  var STORAGE_KEY = \"focus-mode\"\n  var LABEL_OFF = \"집중 모드 켜기 — 좌우 사이드바 숨기기\"\n  var LABEL_ON = \"집중 모드 끄기 — 원래 3단 레이아웃으로\"\n\n  // sidebar 의 opacity 페이드(focus-mode.css)와 같은 시간 — 켤 때는 이 시간만큼 기다렸다가\n  // 그리드를 스냅해서(html.fm-layout-collapsed) \"이미 안 보이는 것이 사라지고 그 자리를\n  // 본문이 채우는\" 것처럼 보이게 한다. CSS 의 transition-delay 만으로는 grid-template-\n  // columns/areas(트랙 개수가 바뀌는 이산적 값) 의 지연 스냅이 헤드리스 크롬에서 무시되거나\n  // 깨지는 걸 확인해서(2026-09-24, focus-mode.css 주석 참고) 타이밍은 JS 가 직접 맡는다.\n  var LAYOUT_CLASS = \"fm-layout-collapsed\"\n  var LAYOUT_DELAY_MS = 200\n  var layoutTimer = null\n\n  function prefersReducedMotion() {\n    return (\n      typeof window.matchMedia === \"function\" &&\n      window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches\n    )\n  }\n\n  function setLayoutCollapsed(collapsed) {\n    if (layoutTimer) {\n      clearTimeout(layoutTimer)\n      layoutTimer = null\n    }\n    var html = document.documentElement\n    if (!collapsed) {\n      html.classList.remove(LAYOUT_CLASS) // 끌 때는 즉시 3-column 으로 되돌려 sidebar 가 나타날 자리를 만든다\n      return\n    }\n    if (prefersReducedMotion()) {\n      html.classList.add(LAYOUT_CLASS) // 모션을 줄이길 원하면 기다릴 이유가 없다 — 바로 스냅\n      return\n    }\n    layoutTimer = setTimeout(function () {\n      html.classList.add(LAYOUT_CLASS)\n      layoutTimer = null\n    }, LAYOUT_DELAY_MS)\n  }\n\n  function isOn() {\n    return document.documentElement.getAttribute(\"data-focus-mode\") === \"on\"\n  }\n\n  function updateButton(btn) {\n    var on = isOn()\n    btn.setAttribute(\"aria-pressed\", on ? \"true\" : \"false\")\n    var label = on ? LABEL_ON : LABEL_OFF\n    btn.setAttribute(\"aria-label\", label)\n    btn.setAttribute(\"title\", label)\n  }\n\n  function applyMode(on) {\n    document.documentElement.setAttribute(\"data-focus-mode\", on ? \"on\" : \"off\")\n    setLayoutCollapsed(on)\n    try {\n      localStorage.setItem(STORAGE_KEY, on ? \"on\" : \"off\")\n    } catch (e) {\n      // localStorage 를 못 쓰는 환경 — 이번 페이지를 보는 동안만 유지되고 새로고침하면 풀린다\n    }\n    var buttons = document.getElementsByClassName(\"focus-mode-toggle\")\n    for (var i = 0; i < buttons.length; i++) updateButton(buttons[i])\n  }\n\n  function handleClick() {\n    applyMode(!isOn())\n  }\n\n  function setup() {\n    var buttons = document.getElementsByClassName(\"focus-mode-toggle\")\n    for (var i = 0; i < buttons.length; i++) {\n      var btn = buttons[i]\n      updateButton(btn)\n      btn.addEventListener(\"click\", handleClick)\n      window.addCleanup(\n        (function (b) {\n          return function () {\n            b.removeEventListener(\"click\", handleClick)\n          }\n        })(btn),\n      )\n    }\n  }\n\n  document.addEventListener(\"nav\", setup)\n  document.addEventListener(\"render\", setup)\n\n  // ---------- 단축키(Cmd/Ctrl+Shift+F), Escape ----------\n\n  // input/textarea/select/contenteditable 등 \"글자를 입력 중인\" 상황이면 단축키를 막는다\n  // (요구사항: 검색창·댓글 textarea·note-properties 편집 등에서 F 를 못 치게 되는 걸 방지).\n  function isEditableTarget(el) {\n    if (!el) return false\n    var tag = el.tagName\n    if (tag === \"INPUT\" || tag === \"TEXTAREA\" || tag === \"SELECT\") return true\n    if (el.isContentEditable) return true\n    return false\n  }\n\n  // 이미 열려 있는 모달/다이얼로그가 있으면 그쪽 Escape 동작(모달 닫기)을 방해하지 않는다 —\n  // climate-timeline 의 상세 카드(.tl-modal)와 gallery-page 라이트박스(.gg-lightbox)는 둘 다\n  // role=\"dialog\" + hidden 토글이라 이 한 줄로 같이 잡힌다. quartz-community/search 는\n  // role 없이 .search-container.active 로 여는 상태를 표시해서 따로 확인한다.\n  function hasOpenOverlay() {\n    if (document.querySelector('[role=\"dialog\"]:not([hidden])')) return true\n    var search = document.querySelector(\".search-container\")\n    if (search && search.classList.contains(\"active\")) return true\n    return false\n  }\n\n  document.addEventListener(\"keydown\", function (e) {\n    if (e.repeat) return // 키를 누르고 있어도 반복 토글되지 않게(깜빡임 방지)\n\n    var key = typeof e.key === \"string\" ? e.key.toLowerCase() : \"\"\n    if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === \"f\") {\n      if (isEditableTarget(document.activeElement)) return\n      e.preventDefault()\n      applyMode(!isOn())\n      return\n    }\n\n    if (e.key === \"Escape\" && isOn() && !hasOpenOverlay()) {\n      applyMode(false)\n    }\n  })\n})()\n"
  return Component
}
