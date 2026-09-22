// ④ 아빠의 화단 홈 슬라이드쇼 동작. 자동 전환(겹쳐지며), 그림/버튼 클릭으로 일시정지·재생,
// 좌우 버튼, 꽃봉오리 클릭으로 이동, 화면 밖이면 자동 전환 멈춤. component.js 가 만든
// data-index 슬라이드/봉오리를 그대로 쓴다.
;(function () {
  function initGallerySlideshow(section) {
    if (!section || section.dataset.gsInit === "true") return
    section.dataset.gsInit = "true"

    var slides = Array.prototype.slice.call(section.querySelectorAll(".gallery-slide"))
    var buds = Array.prototype.slice.call(section.querySelectorAll(".gallery-bud"))
    var playBtn = section.querySelector(".gallery-play")
    var prevBtn = section.querySelector(".gallery-prev")
    var nextBtn = section.querySelector(".gallery-next")
    var track = section.querySelector(".gallery-slide-track")
    var intervalMs = parseInt(section.dataset.intervalMs, 10) || 4000
    if (!slides.length) return

    var current = 0
    var playing = true
    var timer = null
    var visible = true

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

    function render() {
      slides.forEach(function (s, i) {
        s.classList.toggle("is-active", i === current)
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
      current = ((i % slides.length) + slides.length) % slides.length
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
      if (playing && visible && slides.length > 1) {
        timer = setInterval(next, intervalMs)
      }
    }

    function setPlaying(next) {
      playing = next
      if (playBtn) {
        playBtn.textContent = playing ? "❙❙" : "▶"
        playBtn.setAttribute("aria-label", playing ? "일시정지" : "재생")
      }
      startTimer()
    }

    if (playBtn) playBtn.addEventListener("click", function () { setPlaying(!playing) })
    if (track) {
      track.addEventListener("click", function (e) {
        if (e.target.closest(".gallery-nav")) return
        setPlaying(!playing)
      })
    }
    if (prevBtn) prevBtn.addEventListener("click", prev)
    if (nextBtn) nextBtn.addEventListener("click", next)
    buds.forEach(function (b) {
      b.addEventListener("click", function () {
        goTo(parseInt(b.dataset.index, 10) || 0)
      })
    })

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
