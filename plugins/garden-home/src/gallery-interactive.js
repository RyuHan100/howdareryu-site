// ④ 아빠의 화단 홈 필름스트립 동작. 슬라이드마다 가운데로부터의 거리(--pos, data-dist)를 붙여
// CSS 가 양옆으로 늘어놓게 하고, 자동 전환·일시정지 버튼·좌우 버튼·꽃봉오리·옆 그림 클릭·
// 밀어서 넘기기로 이동한다. 가운데 그림을 누르면 검은 화면 라이트박스(원본)로 크게 본다.
// 화면 밖이거나 라이트박스가 열려 있으면 자동 전환을 멈춘다.
;(function () {
  var SWIPE_PX = 40

  function onSwipe(el, onLeft, onRight) {
    var startX = null
    var startY = null
    el.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches.length !== 1) return
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
      },
      { passive: true },
    )
    el.addEventListener("touchend", function (e) {
      if (startX === null) return
      var dx = e.changedTouches[0].clientX - startX
      var dy = e.changedTouches[0].clientY - startY
      startX = null
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return
      // 밀었으면 뒤따르는 click(그림 열기·이동)은 무시한다
      el.dataset.swiped = "true"
      setTimeout(function () {
        el.dataset.swiped = ""
      }, 350)
      if (dx < 0) onLeft()
      else onRight()
    })
  }

  function initGallerySlideshow(section) {
    if (!section || section.dataset.gsInit === "true") return
    section.dataset.gsInit = "true"

    var slides = Array.prototype.slice.call(section.querySelectorAll(".gallery-slide"))
    var buds = Array.prototype.slice.call(section.querySelectorAll(".gallery-bud"))
    var playBtn = section.querySelector(".gallery-play")
    var prevBtn = section.querySelector(".gallery-prev")
    var nextBtn = section.querySelector(".gallery-next")
    var track = section.querySelector(".gallery-slide-track")
    var lb = section.querySelector(".gallery-lightbox")
    var intervalMs = parseInt(section.dataset.intervalMs, 10) || 4000
    if (!slides.length) return

    var n = slides.length
    var current = 0
    var playing = true
    var timer = null
    var visible = true
    var lbOpen = false

    function budSvg(active) {
      if (active) {
        return (
          '<path class="gb-stem" d="M10 20L10 11"/>' +
          '<circle class="gb-petal-0" cx="10" cy="3.1" r="3.4"/>' +
          '<circle class="gb-petal-1" cx="13.2" cy="5.2" r="3.4"/>' +
          '<circle class="gb-petal-2" cx="11.8" cy="9.4" r="3.4"/>' +
          '<circle class="gb-petal-0" cx="8.2" cy="9.4" r="3.4"/>' +
          '<circle class="gb-petal-1" cx="6.8" cy="5.2" r="3.4"/>' +
          '<circle class="gb-heart" cx="10" cy="7" r="2.1"/>'
        )
      }
      return (
        '<path class="gb-stem" d="M10 20L10 11"/>' +
        '<path class="gb-bud" d="M10 3C6.5 3 5 6 5 9C5 11.8 7.2 13.5 10 13.5C12.8 13.5 15 11.8 15 9C15 6 13.5 3 10 3Z"/>'
      )
    }

    // 가운데(current)로부터 i 번 슬라이드까지의 가장 가까운 칸 수(끝과 처음이 이어진 고리처럼)
    function offsetOf(i) {
      var d = (((i - current) % n) + n) % n
      return d > n / 2 ? d - n : d
    }

    function render() {
      slides.forEach(function (s, i) {
        var pos = offsetOf(i)
        var dist = Math.abs(pos)
        s.style.setProperty("--pos", String(pos))
        s.dataset.dist = dist <= 2 ? String(dist) : "far"
        s.classList.toggle("is-active", pos === 0)
        s.setAttribute("aria-hidden", pos === 0 ? "false" : "true")
      })
      buds.forEach(function (b, i) {
        var active = i === current
        b.classList.toggle("is-active", active)
        b.setAttribute("aria-selected", String(active))
        var svg = b.querySelector(".gallery-bud-svg")
        if (svg) svg.innerHTML = budSvg(active)
      })
    }

    function goTo(i) {
      current = ((i % n) + n) % n
      render()
    }
    function next() {
      goTo(current + 1)
    }
    function prev() {
      goTo(current - 1)
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    function startTimer() {
      stopTimer()
      if (playing && visible && !lbOpen && n > 1) {
        timer = setInterval(next, intervalMs)
      }
    }
    // 손으로 넘기면 그 그림을 볼 시간을 주려고 타이머를 처음부터 다시 센다
    function manual(fn) {
      return function () {
        fn()
        startTimer()
      }
    }

    function setPlaying(v) {
      playing = v
      if (playBtn) {
        playBtn.textContent = playing ? "❙❙" : "▶"
        playBtn.setAttribute("aria-label", playing ? "일시정지" : "재생")
      }
      startTimer()
    }

    // ---- 라이트박스(검은 화면에서 원본 크게 보기) ----
    var lbImg = lb && lb.querySelector(".gallery-lb-img")
    var lbCaption = lb && lb.querySelector(".gallery-lb-caption")
    var lbClose = lb && lb.querySelector(".gallery-lb-close")
    var lastFocused = null

    function lbShow() {
      var s = slides[current]
      lbImg.src = s.dataset.full
      lbImg.alt = s.dataset.caption || "작품 이미지"
      lbCaption.textContent = s.dataset.caption || ""
    }
    function lbStep(delta) {
      goTo(current + delta)
      lbShow()
    }
    function openLightbox() {
      if (!lb) return
      lastFocused = document.activeElement
      lbOpen = true
      stopTimer()
      lbShow()
      lb.hidden = false
      document.body.style.overflow = "hidden"
      if (lbClose) lbClose.focus()
    }
    function closeLightbox() {
      if (!lb || !lbOpen) return
      lbOpen = false
      lb.hidden = true
      document.body.style.overflow = ""
      if (lastFocused && lastFocused.focus) lastFocused.focus()
      startTimer()
    }

    if (lb) {
      if (lbClose) lbClose.addEventListener("click", closeLightbox)
      var lbPrev = lb.querySelector(".gallery-lb-prev")
      var lbNext = lb.querySelector(".gallery-lb-next")
      if (lbPrev) lbPrev.addEventListener("click", function () { lbStep(-1) })
      if (lbNext) lbNext.addEventListener("click", function () { lbStep(1) })
      lb.addEventListener("click", function (e) {
        if (e.target === lb && lb.dataset.swiped !== "true") closeLightbox()
      })
      lb.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeLightbox()
        else if (e.key === "ArrowLeft") lbStep(-1)
        else if (e.key === "ArrowRight") lbStep(1)
      })
      onSwipe(lb, function () { lbStep(1) }, function () { lbStep(-1) })
    }

    // ---- 필름스트립 ----
    if (playBtn) playBtn.addEventListener("click", function () { setPlaying(!playing) })
    if (prevBtn) prevBtn.addEventListener("click", manual(prev))
    if (nextBtn) nextBtn.addEventListener("click", manual(next))
    slides.forEach(function (s, i) {
      s.addEventListener("click", function () {
        if (track && track.dataset.swiped === "true") return
        if (i === current) openLightbox()
        else manual(function () { goTo(i) })()
      })
    })
    buds.forEach(function (b) {
      b.addEventListener("click", manual(function () {
        goTo(parseInt(b.dataset.index, 10) || 0)
      }))
    })
    if (track) onSwipe(track, manual(next), manual(prev))

    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            visible = entry.isIntersecting
            startTimer()
          })
        },
        { rootMargin: "60px" },
      )
      io.observe(section)
      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))
    }

    render()
    startTimer()
    if (window.addCleanup) {
      window.addCleanup(function () {
        stopTimer()
        document.body.style.overflow = ""
        section.dataset.gsInit = "false"
      })
    }
  }

  function init() {
    initGallerySlideshow(document.querySelector(".garden-home-gallery"))
  }

  document.addEventListener("nav", init)
  init()
})()
