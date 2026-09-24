// afterDOMLoaded — 버튼 클릭·키보드 처리 + localStorage 저장. 상태 자체는 <html
// data-focus-mode> 속성 하나로 관리한다: Quartz 의 SPA 라우터(spa.inline.ts)는 micromorph 로
// document.body 만 갈아 끼우고 document.documentElement(<html>) 는 건드리지 않으므로, 이
// 속성은 페이지 이동(nav) 마다 다시 설정해 줄 필요 없이 그대로 유지된다 — CSS 선택자
// (focus-mode.css 의 html[data-focus-mode="on"] ...)가 새로 그려진 sidebar/center 에도
// 곧바로 적용된다. 버튼 엘리먼트 자체는 페이지마다 새로 생기므로, nav 때마다 클릭 리스너만
// 다시 건다.
//
// 키보드 단축키(Cmd/Ctrl+Shift+F)와 Escape 는 document 전역에 딱 한 번만 건다 — document 는
// SPA 이동으로 안 바뀌므로 nav 마다 다시 걸 필요가 없고(중복 리스너 방지), afterDOMLoaded
// 스크립트 자체가 실제 페이지 로드당 한 번만 실행된다(SPA 이동 때는 재실행 안 됨)는 것도
// 이미 같은 보장을 준다.
;(function () {
  var STORAGE_KEY = "focus-mode"
  var LABEL_OFF = "집중 모드 켜기 — 좌우 사이드바 숨기기"
  var LABEL_ON = "집중 모드 끄기 — 원래 3단 레이아웃으로"

  // sidebar 의 opacity 페이드(focus-mode.css)와 같은 시간 — 켤 때는 이 시간만큼 기다렸다가
  // 그리드를 스냅해서(html.fm-layout-collapsed) "이미 안 보이는 것이 사라지고 그 자리를
  // 본문이 채우는" 것처럼 보이게 한다. CSS 의 transition-delay 만으로는 grid-template-
  // columns/areas(트랙 개수가 바뀌는 이산적 값) 의 지연 스냅이 헤드리스 크롬에서 무시되거나
  // 깨지는 걸 확인해서(2026-09-24, focus-mode.css 주석 참고) 타이밍은 JS 가 직접 맡는다.
  var LAYOUT_CLASS = "fm-layout-collapsed"
  var LAYOUT_DELAY_MS = 200
  var layoutTimer = null

  function prefersReducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  }

  function setLayoutCollapsed(collapsed) {
    if (layoutTimer) {
      clearTimeout(layoutTimer)
      layoutTimer = null
    }
    var html = document.documentElement
    if (!collapsed) {
      html.classList.remove(LAYOUT_CLASS) // 끌 때는 즉시 3-column 으로 되돌려 sidebar 가 나타날 자리를 만든다
      return
    }
    if (prefersReducedMotion()) {
      html.classList.add(LAYOUT_CLASS) // 모션을 줄이길 원하면 기다릴 이유가 없다 — 바로 스냅
      return
    }
    layoutTimer = setTimeout(function () {
      html.classList.add(LAYOUT_CLASS)
      layoutTimer = null
    }, LAYOUT_DELAY_MS)
  }

  function isOn() {
    return document.documentElement.getAttribute("data-focus-mode") === "on"
  }

  function updateButton(btn) {
    var on = isOn()
    btn.setAttribute("aria-pressed", on ? "true" : "false")
    var label = on ? LABEL_ON : LABEL_OFF
    btn.setAttribute("aria-label", label)
    btn.setAttribute("title", label)
  }

  function applyMode(on) {
    document.documentElement.setAttribute("data-focus-mode", on ? "on" : "off")
    setLayoutCollapsed(on)
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off")
    } catch (e) {
      // localStorage 를 못 쓰는 환경 — 이번 페이지를 보는 동안만 유지되고 새로고침하면 풀린다
    }
    var buttons = document.getElementsByClassName("focus-mode-toggle")
    for (var i = 0; i < buttons.length; i++) updateButton(buttons[i])
  }

  function handleClick() {
    applyMode(!isOn())
  }

  function setup() {
    var buttons = document.getElementsByClassName("focus-mode-toggle")
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i]
      updateButton(btn)
      btn.addEventListener("click", handleClick)
      window.addCleanup(
        (function (b) {
          return function () {
            b.removeEventListener("click", handleClick)
          }
        })(btn),
      )
    }
  }

  document.addEventListener("nav", setup)
  document.addEventListener("render", setup)

  // ---------- 단축키(Cmd/Ctrl+Shift+F), Escape ----------

  // input/textarea/select/contenteditable 등 "글자를 입력 중인" 상황이면 단축키를 막는다
  // (요구사항: 검색창·댓글 textarea·note-properties 편집 등에서 F 를 못 치게 되는 걸 방지).
  function isEditableTarget(el) {
    if (!el) return false
    var tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
    if (el.isContentEditable) return true
    return false
  }

  // 이미 열려 있는 모달/다이얼로그가 있으면 그쪽 Escape 동작(모달 닫기)을 방해하지 않는다 —
  // climate-timeline 의 상세 카드(.tl-modal)와 gallery-page 라이트박스(.gg-lightbox)는 둘 다
  // role="dialog" + hidden 토글이라 이 한 줄로 같이 잡힌다. quartz-community/search 는
  // role 없이 .search-container.active 로 여는 상태를 표시해서 따로 확인한다.
  function hasOpenOverlay() {
    if (document.querySelector('[role="dialog"]:not([hidden])')) return true
    var search = document.querySelector(".search-container")
    if (search && search.classList.contains("active")) return true
    return false
  }

  document.addEventListener("keydown", function (e) {
    if (e.repeat) return // 키를 누르고 있어도 반복 토글되지 않게(깜빡임 방지)

    var key = typeof e.key === "string" ? e.key.toLowerCase() : ""
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === "f") {
      if (isEditableTarget(document.activeElement)) return
      e.preventDefault()
      applyMode(!isOn())
      return
    }

    if (e.key === "Escape" && isOn() && !hasOpenOverlay()) {
      applyMode(false)
    }
  })
})()
