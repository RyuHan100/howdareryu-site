// afterDOMLoaded — <article> 기준으로 스크롤 진행률을 계산해 위쪽 바에 반영한다.
//
// 기준 element: document.querySelector("article") — Quartz 의 실제 렌더링 구조(quartz/
// components/frames/DefaultFrame.tsx)에서 본문 콘텐츠는 항상 <article class="popover-hint">
// 하나뿐이다. 클래스가 아니라 태그로 찾는 이유: beforeBody 를 감싸는 .page-header 안의
// 래퍼 div 도 우연히 같은 "popover-hint" 클래스를 쓰고 있어서(팝오버 미리보기 기능용,
// 이 컴포넌트와 무관) 클래스로 찾으면 엉뚱한(더 먼저 나오는) 요소를 잡는다 — 헤드리스
// 크롬으로 실제 DOM 을 떠서 확인 후 태그 선택자로 바꿨다(2026-09-24).
//
// 성능: scroll 이벤트에서는 절대 getBoundingClientRect/offsetHeight 등 강제 리플로우를
// 유발하는 측정을 하지 않는다 — 캐시된 articleTop/scrollableHeight 와 window.scrollY 만
// 읽고 transform 만 쓴다(레이아웃에 영향 없음). 실제 측정(measure)은 초기화·ResizeObserver·
// window resize 때만 한다 — ResizeObserver 가 <article> 자체를 관찰하므로 집중 모드
// (plugins/focus-mode)가 본문 폭을 바꿔 텍스트가 다시 줄바꿈되어 높이가 바뀌는 경우도
// 이 컴포넌트를 전혀 안 건드리고도 자동으로 잡힌다.
;(function () {
  var wrap = null
  var bar = null
  var articleEl = null
  var articleTop = 0
  var scrollableHeight = 0
  var scrollTicking = false

  function measure() {
    if (!articleEl) return
    var rect = articleEl.getBoundingClientRect()
    articleTop = rect.top + window.scrollY
    scrollableHeight = Math.max(articleEl.offsetHeight - window.innerHeight, 0)
  }

  function update() {
    if (!bar) return
    if (scrollableHeight <= 0) {
      // 화면에 다 들어오는 짧은 글 — 더 스크롤할 게 없으니 꽉 채운다.
      bar.style.transform = "scaleX(1)"
      return
    }
    var raw = (window.scrollY - articleTop) / scrollableHeight
    var clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw
    bar.style.transform = "scaleX(" + clamped + ")"
  }

  function onScroll() {
    if (scrollTicking) return
    scrollTicking = true
    requestAnimationFrame(function () {
      scrollTicking = false
      update()
    })
  }

  function onResize() {
    measure()
    update()
  }

  function init() {
    wrap = document.querySelector(".reading-progress")
    if (!wrap) return
    bar = wrap.querySelector(".reading-progress-bar")
    articleEl = document.querySelector("article")

    // climate histography 처럼 세로 스크롤로 "읽는" 페이지가 아니라 자체 가로 스크롤·줌을
    // 가진 시각화 페이지에서는 진행률 바가 부자연스럽다(요구사항) — timeline 코드는 안
    // 건드리고 그 마크업(.climate-timeline)이 있는지만 본다.
    if (!articleEl || document.querySelector(".climate-timeline")) {
      wrap.hidden = true
      return
    }
    wrap.hidden = false

    measure()
    update()

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addCleanup(function () {
      window.removeEventListener("scroll", onScroll)
    })

    window.addEventListener("resize", onResize)
    window.addCleanup(function () {
      window.removeEventListener("resize", onResize)
    })

    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(onResize)
      ro.observe(articleEl)
      window.addCleanup(function () {
        ro.disconnect()
      })
    }
  }

  // nav 는 최초 로드 + 이후 모든 SPA 이동(뒤로/앞으로 가기 포함, spa.inline.ts 의 popstate
  // 핸들러도 결국 notifyNav 를 부른다)마다 한 번씩만 온다. 새 페이지의 <article> 을 다시
  // 찾고, 이전 페이지의 리스너/ResizeObserver 는 Quartz 라우터가 nav 직전에 모든
  // window.addCleanup 콜백을 실행해 정리해 준다 — 여기서 따로 또 지울 필요가 없다.
  document.addEventListener("nav", init)
})()
