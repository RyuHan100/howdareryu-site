// 줌 컨트롤러 — timeline-interactive.js 의 initTimeline() 안에서 섹션 하나당 한 번
// tlCreateView(section) 로 호출된다(build.mjs 가 이 파일을 그 IIFE 안에 이어붙인다). 실제
// 위치 계산은 전부 timeline-scale.js 의 tlTToPx/tlPxToT(서버 timeline-render.js 와 완전히
// 같은 함수)로 하므로, 줌 때문에 이벤트가 실제 날짜와 다른 자리에 찍히는 일이 없다(요구사항:
// event positioning 의 날짜 정확성 유지).
//
// 상태는 의도적으로 최소화한다: 어떤 날짜가 화면 가운데인지는 저장하지 않고 scroll.scrollLeft
// 를 원본으로 삼는다(네이티브 가로 스크롤과 절대 어긋나지 않는다, 요구사항 1). 줌 배율은
// section 의 인라인 CSS 커스텀 프로퍼티 --month-width 하나로 표현된다 — timeline.css 의
// calc(var(--month-width) * var(--x)) 가 이벤트/연도/눈금 전부의 위치를 이미 계산하고
// 있으므로, 이 값 하나만 바꾸면 나머지는 브라우저가 다시 그린다(요구사항 9).

var TL_MIN_LABEL_PX_DESKTOP = 56
var TL_MIN_LABEL_PX_MOBILE = 44
var TL_MOBILE_BREAKPOINT = 800 // timeline.css 의 @media (max-width: 800px) 와 같은 값
var TL_MAX_PX_PER_MONTH = 200 // 1년 ≈ 2400px — 월 라벨이 넉넉히 들어가는 수준을 상한으로 둔다
var TL_NOW_PAD_MONTHS = 6

function tlTodayISO() {
  var d = new Date()
  var mo = d.getMonth() + 1
  var day = d.getDate()
  return d.getFullYear() + "-" + (mo < 10 ? "0" + mo : mo) + "-" + (day < 10 ? "0" + day : day)
}

function tlTouchDist(touches) {
  var dx = touches[0].clientX - touches[1].clientX
  var dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy) || 1
}

function tlTouchMidX(touches, scrollEl) {
  var rect = scrollEl.getBoundingClientRect()
  return (touches[0].clientX + touches[1].clientX) / 2 - rect.left
}

/**
 * section(.climate-timeline) 안의 .tl-scroll/.tl-track/.tl-ticks/.tl-toolbar 를 찾아 줌
 * 상호작용을 건다. 필요한 요소가 없으면(구버전 마크업 등) 조용히 null 을 반환한다.
 */
function tlCreateView(section) {
  var scroll = section.querySelector(".tl-scroll")
  var track = section.querySelector(".tl-track")
  var ticksLayer = section.querySelector(".tl-ticks")
  var nowLayer = section.querySelector(".tl-now-layer")
  var toolbar = section.querySelector(".tl-toolbar")
  if (!scroll || !track || !ticksLayer || !toolbar) return null

  var zoomOutBtn = toolbar.querySelector(".tl-zoom-out")
  var zoomInBtn = toolbar.querySelector(".tl-zoom-in")
  var resetBtn = toolbar.querySelector(".tl-zoom-reset")
  var levelEl = toolbar.querySelector(".tl-zoom-level")

  var timelineStart = Number(track.dataset.start)
  var builtEnd = Number(track.dataset.end)
  var nowT = tlDateToT(tlTodayISO())
  // 사이트를 한동안 다시 안 만들면 "오늘"이 빌드 시점의 끝(builtEnd)보다 나중일 수 있다 —
  // 하드코딩된 연도가 아니라 클라이언트의 실제 현재 시각을 기준으로 범위를 늘린다.
  var timelineEnd = Math.max(builtEnd, Math.ceil(nowT) + TL_NOW_PAD_MONTHS)

  // timeline.css 의 미디어쿼리 기본값(PC 8px/모바일 4px)을 매번 다시 읽는다 — 한 번만 읽어
  // 캐싱하면, 로드된 뒤 뷰포트가 모바일 분기점을 넘나들 때(창 크기 조절, 태블릿 회전) 기본
  // 배율이 계속 예전 값에 머무른다. 우리가 심어 둔 인라인 값을 잠깐 지우고 캐스케이드(CSS)
  // 값만 측정한 뒤 되돌린다 — 8/4 라는 숫자를 JS 에 다시 적지 않아도 항상 CSS 와 일치한다.
  function cssDefaultPx() {
    var prev = section.style.getPropertyValue("--month-width")
    section.style.removeProperty("--month-width")
    var val = parseFloat(getComputedStyle(track).getPropertyValue("--month-width")) || 8
    if (prev) section.style.setProperty("--month-width", prev)
    return val
  }

  // cssDefaultPx() 는 인라인 값을 지웠다 되돌리며 타임라인 전체의 스타일 재계산을 강제하므로
  // 줌 프레임마다 부르지 않는다 — 값이 바뀔 수 있는 때(처음, 레이아웃 변화)에만 다시 읽는다.
  var cssDefault = cssDefaultPx()
  var view = { timelineStart: timelineStart, pxPerMonth: cssDefault }
  var userZoomed = false // Reset 전까지는 "자동 기준폭"을 계속 따라간다(아래 autoBasePx 참고)

  function containerWidth() {
    return scroll.clientWidth || 1
  }
  function fitAllPxPerMonth() {
    return containerWidth() / (timelineEnd - timelineStart)
  }
  function minLabelPx() {
    return window.innerWidth <= TL_MOBILE_BREAKPOINT ? TL_MIN_LABEL_PX_MOBILE : TL_MIN_LABEL_PX_DESKTOP
  }
  // 집중 모드(Focus Mode, plugins/focus-mode)에서 좌우 사이드바가 사라져 .tl-scroll 의 실제
  // 폭이 넓어지면, 고정된 CSS 기본 폭 대신 그 폭에 맞춰 최대 3배까지 넓힌 값을 "기준폭"으로
  // 삼는다(이 파일이 생기기 전부터 있던 동작 — 이전엔 별도 initResponsiveScale 이 .tl-track 에
  // 직접 --month-width 를 심었는데, 이 컨트롤러도 같은 변수를 다루므로 하나로 합쳤다). 사용자가
  // 아직 직접 줌하지 않았을 때만(!userZoomed) 이 기준폭을 따라간다 — 한 번 줌한 뒤에는 창
  // 크기가 바뀌어도 사용자가 고른 배율을 그대로 존중하고 허용 범위만 다시 계산한다.
  function autoBasePx() {
    var isMobile = window.innerWidth <= TL_MOBILE_BREAKPOINT
    var focusModeOn = document.documentElement.getAttribute("data-focus-mode") === "on"
    var base = cssDefault
    if (isMobile || !focusModeOn) return base
    var fitToFull = containerWidth() / (timelineEnd - timelineStart)
    return Math.max(base, Math.min(fitToFull, base * 3))
  }
  function clampPx(px) {
    var base = cssDefault
    var min = Math.min(fitAllPxPerMonth(), base)
    if (!isFinite(px)) return base
    return Math.max(min, Math.min(TL_MAX_PX_PER_MONTH, px))
  }

  function applyPx(px) {
    view.pxPerMonth = clampPx(px)
    section.style.setProperty("--month-width", view.pxPerMonth + "px")
  }

  function visibleRange() {
    var t0 = tlPxToT(scroll.scrollLeft, view)
    var t1 = tlPxToT(scroll.scrollLeft + containerWidth(), view)
    return { t0: t0, t1: t1 }
  }

  function zoomAt(newPx, anchorPx) {
    userZoomed = true
    var t = tlPxToT(scroll.scrollLeft + anchorPx, view)
    applyPx(newPx)
    scroll.scrollLeft = tlTToPx(t, view) - anchorPx
    scheduleUpdate()
  }

  function zoomBy(factor, anchorPx) {
    if (anchorPx === undefined || anchorPx === null) anchorPx = containerWidth() / 2
    zoomAt(view.pxPerMonth * factor, anchorPx)
  }

  function reset() {
    userZoomed = false
    applyPx(autoBasePx())
    scroll.scrollLeft = 0
    scheduleUpdate()
  }

  function fitRange(t0, t1) {
    userZoomed = true
    var span = Math.max(t1 - t0, 1)
    var px = clampPx(containerWidth() / span)
    applyPx(px)
    var center = (t0 + t1) / 2
    scroll.scrollLeft = tlTToPx(center, view) - containerWidth() / 2
    scheduleUpdate()
  }

  // ---------- 눈금(보이는 구간 + 여유분만 그린다 — 요구사항: 성능) ----------
  // 눈금 위치는 --x(월 수)라 줌 배율이 바뀌어도 CSS 가 옮긴다 — 그려야 할 눈금 집합(첫·끝
  // 눈금과 개수, 개수로 간격도 정해짐)이 같으면 DOM 을 다시 만들지 않는다. 가로 스크롤
  // 프레임마다 버튼 수십 개를 지웠다 만드는 일을 막는다.
  var lastTickKey = ""
  function renderTicks() {
    var range = visibleRange()
    var margin = (range.t1 - range.t0) * 0.5
    var ticks = tlTicks(range.t0 - margin, range.t1 + margin, view.pxPerMonth, minLabelPx())
    var key = ticks.length ? ticks[0].t + ":" + ticks[ticks.length - 1].t + ":" + ticks.length : ""
    if (key === lastTickKey) return
    lastTickKey = key

    // 키보드로 눈금에 머물러 있던 경우, 다시 그린 뒤 같은(없으면 가장 가까운) 눈금에 포커스를
    // 돌려준다 — 안 그러면 눈금을 눌러 확대하는 순간 포커스가 body 로 사라진다.
    var active = document.activeElement
    var focusedT = active && ticksLayer.contains(active) ? Number(active.dataset.t) : null
    var html = ""
    for (var i = 0; i < ticks.length; i++) {
      var tk = ticks[i]
      html +=
        '<button type="button" class="tl-tick" data-major="' +
        (tk.major ? "true" : "false") +
        '" data-t="' +
        tk.t +
        '" style="--x:' +
        (tk.t - timelineStart) +
        '" aria-label="' +
        tk.label +
        (tk.major ? "년으로" : "로") +
        ' 확대·이동">' +
        '<span class="tl-tick-mark" aria-hidden="true"></span>' +
        '<span class="tl-tick-label">' +
        tk.label +
        "</span></button>"
    }
    ticksLayer.innerHTML = html

    if (focusedT !== null) {
      var buttons = ticksLayer.querySelectorAll(".tl-tick")
      var best = null
      for (var j = 0; j < buttons.length; j++) {
        if (!best || Math.abs(buttons[j].dataset.t - focusedT) < Math.abs(best.dataset.t - focusedT)) best = buttons[j]
      }
      if (best) best.focus({ preventScroll: true })
    }
  }

  // 눈금 버튼은 수시로 다시 만들어지므로 버튼마다 리스너를 달지 않고 레이어에 하나만 단다.
  ticksLayer.addEventListener("click", function (e) {
    var btn = e.target.closest(".tl-tick")
    if (!btn || !ticksLayer.contains(btn)) return
    var t = Number(btn.dataset.t)
    var step = tlPickTickStep(view.pxPerMonth, minLabelPx())
    fitRange(t, t + step)
  })

  // ---------- "오늘" 표시선(요구사항: 2026년을 쉽게 찾을 수 있어야 한다) ----------
  function renderNow() {
    if (!nowLayer || nowLayer.dataset.tlDone === "true") return
    nowLayer.dataset.tlDone = "true"
    var x = nowT - timelineStart
    nowLayer.innerHTML =
      '<div class="tl-now" style="--x:' +
      x +
      '" aria-hidden="true"></div>' +
      '<div class="tl-now-label" style="--x:' +
      x +
      '">오늘</div>'
  }

  function updateToolbar() {
    var step = tlPickTickStep(view.pxPerMonth, minLabelPx())
    var label = step >= 600 ? "전체" : step >= 120 ? "수십 년" : step >= 12 ? "연도" : "월"
    // aria-live 영역이라 같은 값을 매 프레임 다시 쓰면 스크린리더가 반복해 읽을 수 있다.
    if (levelEl && levelEl.textContent !== label) levelEl.textContent = label
    if (zoomOutBtn) zoomOutBtn.disabled = view.pxPerMonth <= clampPx(0) + 0.01
    if (zoomInBtn) zoomInBtn.disabled = view.pxPerMonth >= TL_MAX_PX_PER_MONTH - 0.01
  }

  var rafPending = false
  function scheduleUpdate() {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(function () {
      rafPending = false
      renderTicks()
      updateToolbar()
    })
  }

  // ---------- 입력: 데스크톱 휠(수식키 필수 — 요구사항: 일반 스크롤 방해 금지) ----------
  scroll.addEventListener(
    "wheel",
    function (e) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      var rect = scroll.getBoundingClientRect()
      var anchorPx = e.clientX - rect.left
      var factor = Math.exp(-e.deltaY * 0.003)
      zoomBy(factor, anchorPx)
    },
    { passive: false },
  )

  // Safari 데스크톱 트랙패드 핀치(비표준 gesture 이벤트 — ctrlKey 휠로는 안 들어온다)
  var gestureStartPx = null
  scroll.addEventListener("gesturestart", function (e) {
    e.preventDefault()
    gestureStartPx = view.pxPerMonth
  })
  scroll.addEventListener("gesturechange", function (e) {
    if (gestureStartPx === null) return
    e.preventDefault()
    var rect = scroll.getBoundingClientRect()
    zoomAt(gestureStartPx * e.scale, e.clientX - rect.left)
  })
  scroll.addEventListener("gestureend", function () {
    gestureStartPx = null
  })

  // ---------- 입력: 모바일 두 손가락 핀치 ----------
  var touchState = null
  scroll.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 2) {
        touchState = null
        return
      }
      e.preventDefault()
      var mid = tlTouchMidX(e.touches, scroll)
      touchState = {
        dist: tlTouchDist(e.touches),
        px: view.pxPerMonth,
        t: tlPxToT(scroll.scrollLeft + mid, view),
      }
    },
    { passive: false },
  )
  scroll.addEventListener(
    "touchmove",
    function (e) {
      if (!touchState || e.touches.length !== 2) return
      e.preventDefault()
      var dist = tlTouchDist(e.touches)
      var mid = tlTouchMidX(e.touches, scroll)
      applyPx((touchState.px * dist) / touchState.dist)
      scroll.scrollLeft = tlTToPx(touchState.t, view) - mid
      scheduleUpdate()
    },
    { passive: false },
  )
  scroll.addEventListener("touchend", function (e) {
    if (e.touches.length < 2) touchState = null
  })

  // ---------- 입력: 버튼 · 키보드 ----------
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", function () {
      zoomBy(1 / 1.6)
    })
  }
  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", function () {
      zoomBy(1.6)
    })
  }
  if (resetBtn) resetBtn.addEventListener("click", reset)

  section.addEventListener("keydown", function (e) {
    if (e.target.closest(".tl-modal")) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === "+" || e.key === "=") {
      e.preventDefault()
      zoomBy(1.6)
    } else if (e.key === "-") {
      e.preventDefault()
      zoomBy(1 / 1.6)
    } else if (e.key === "0") {
      e.preventDefault()
      reset()
    }
  })

  var scrollRafPending = false
  scroll.addEventListener("scroll", function () {
    if (scrollRafPending) return
    scrollRafPending = true
    requestAnimationFrame(function () {
      scrollRafPending = false
      renderTicks()
    })
  })

  function onLayoutChange() {
    // 창 크기 변화로 모바일 분기점을 넘었을 수 있으니 CSS 기본 폭을 여기서만 다시 읽는다.
    cssDefault = cssDefaultPx()
    // 아직 직접 줌하지 않았으면(userZoomed === false) 집중 모드/창 크기에 맞춘 자동 기준폭을
    // 계속 따라간다. 이미 줌했다면 그 배율은 그대로 두고 허용 범위(clampPx)만 다시 맞춘다.
    applyPx(userZoomed ? view.pxPerMonth : autoBasePx())
    scheduleUpdate()
  }

  if (typeof ResizeObserver !== "undefined") {
    var ro = new ResizeObserver(onLayoutChange)
    ro.observe(scroll)
    if (window.addCleanup) {
      window.addCleanup(function () {
        ro.disconnect()
      })
    }
  }
  if (typeof MutationObserver !== "undefined") {
    // 집중 모드 토글이 사이드바 레이아웃을 바꾸는 시점과 --month-width 재계산 시점이 어긋나지
    // 않도록, ResizeObserver 와 별개로 속성 변화 자체도 직접 본다(예전 initResponsiveScale 이
    // data-focus-mode 를 직접 읽던 것과 같은 이유).
    var mo = new MutationObserver(onLayoutChange)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-focus-mode"] })
    if (window.addCleanup) {
      window.addCleanup(function () {
        mo.disconnect()
      })
    }
  }

  track.style.setProperty("--total-months", String(timelineEnd - timelineStart))
  applyPx(autoBasePx())
  section.classList.add("is-enhanced")
  renderNow()
  scheduleUpdate()

  return { zoomBy: zoomBy, reset: reset, fitRange: fitRange }
}
