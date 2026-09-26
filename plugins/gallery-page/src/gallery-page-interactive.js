// 전체 그림 페이지: 격자에서 그림을 누르면 라이트박스(원본 크기)로 크게 보고, 좌우 버튼/화살표
// 키로 넘기고, 닫기 버튼·배경 클릭·Escape 로 닫는다.
;(function () {
  function initGalleryPage(section) {
    if (!section || section.dataset.ggInit === "true") return
    section.dataset.ggInit = "true"

    var items = Array.prototype.slice.call(section.querySelectorAll(".gg-item"))
    var lb = section.querySelector(".gg-lightbox")
    if (!items.length || !lb) return

    var img = lb.querySelector(".gg-lb-img")
    var caption = lb.querySelector(".gg-lb-caption")
    var closeBtn = lb.querySelector(".gg-lb-close")
    var prevBtn = lb.querySelector(".gg-lb-prev")
    var nextBtn = lb.querySelector(".gg-lb-next")
    var current = -1
    var lastFocused = null

    function show(i) {
      current = ((i % items.length) + items.length) % items.length
      var item = items[current]
      img.src = item.dataset.full
      img.alt = item.dataset.caption || "작품 이미지"
      caption.textContent = item.dataset.caption || ""
    }

    function open(i) {
      lastFocused = document.activeElement
      show(i)
      lb.hidden = false
      document.body.style.overflow = "hidden"
      if (closeBtn) closeBtn.focus()
    }

    function close() {
      lb.hidden = true
      document.body.style.overflow = ""
      if (lastFocused && lastFocused.focus) lastFocused.focus()
    }

    items.forEach(function (item, i) {
      item.addEventListener("click", function () {
        open(i)
      })
    })
    if (closeBtn) closeBtn.addEventListener("click", close)
    if (prevBtn) prevBtn.addEventListener("click", function () { show(current - 1) })
    if (nextBtn) nextBtn.addEventListener("click", function () { show(current + 1) })

    lb.addEventListener("click", function (e) {
      if (e.target === lb && lb.dataset.swiped !== "true") close()
    })

    // 휴대폰: 좌우로 밀어서 넘기기
    var startX = null
    var startY = null
    lb.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches.length !== 1) return
        startX = e.touches[0].clientX
        startY = e.touches[0].clientY
      },
      { passive: true },
    )
    lb.addEventListener("touchend", function (e) {
      if (startX === null) return
      var dx = e.changedTouches[0].clientX - startX
      var dy = e.changedTouches[0].clientY - startY
      startX = null
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
      lb.dataset.swiped = "true"
      setTimeout(function () {
        lb.dataset.swiped = ""
      }, 350)
      show(dx < 0 ? current + 1 : current - 1)
    })
    lb.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowLeft") show(current - 1)
      else if (e.key === "ArrowRight") show(current + 1)
    })

    if (window.addCleanup) {
      window.addCleanup(function () {
        document.body.style.overflow = ""
        section.dataset.ggInit = "false"
      })
    }
  }

  function init() {
    initGalleryPage(document.querySelector(".gallery-page"))
  }

  document.addEventListener("nav", init)
  init()
})()
