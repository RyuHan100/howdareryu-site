// radar 구역의 상호작용·움직임. 회전·반짝임 자체는 CSS 애니메이션(garden-home.css)이 하고,
// 이 스크립트는: 점을 클릭/키보드로 고르면 패널에 정보 채우기, 화면 밖이면 애니메이션 멈추기만
// 한다. component.js 가 Component.afterDOMLoaded 로 garden-interactive.js 뒤에 붙인다(build.mjs).
;(function () {
  function initRadar(section) {
    if (!section || section.dataset.radarInit === "true") return
    section.dataset.radarInit = "true"

    var dots = Array.prototype.slice.call(section.querySelectorAll(".radar-dot"))
    var panel = section.querySelector(".radar-panel")
    var panelSub = panel && panel.querySelector(".radar-panel-subfolder")
    var panelDate = panel && panel.querySelector(".radar-panel-date")
    var panelTitle = panel && panel.querySelector(".radar-panel-title")
    var panelLink = panel && panel.querySelector(".radar-panel-link")
    var panelClose = panel && panel.querySelector(".gp-panel-close")
    var selected = null

    function hidePanel() {
      if (panel) panel.classList.remove("is-open")
    }

    function select(dot) {
      if (selected === dot) {
        deselect()
        return
      }
      selected = dot
      dots.forEach(function (d) {
        d.setAttribute("aria-pressed", d === dot ? "true" : "false")
        d.style.animationPlayState = d === dot ? "paused" : ""
      })
      if (panel) {
        if (panelSub) panelSub.textContent = dot.dataset.subfolder || ""
        if (panelDate) panelDate.textContent = dot.dataset.date || ""
        if (panelTitle) panelTitle.textContent = dot.dataset.title || ""
        if (panelLink) panelLink.setAttribute("href", "./" + (dot.dataset.slug || ""))
        panel.classList.add("is-open")
      }
    }

    function deselect() {
      selected = null
      dots.forEach(function (d) {
        d.setAttribute("aria-pressed", "false")
        d.style.animationPlayState = ""
      })
      hidePanel()
    }

    dots.forEach(function (d) {
      d.setAttribute("aria-pressed", "false")
      d.addEventListener("click", function () {
        select(d)
      })
      d.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault()
          select(d)
        } else if (e.key === "Escape") {
          deselect()
        }
      })
    })
    if (panelClose) panelClose.addEventListener("click", deselect)

    // 화면 밖이면 회전·반짝임 멈춤(움직이는 게 안 보이는데 계속 도는 건 낭비고, 다시 보일 때
    // 느닷없이 위상이 튀는 것도 자연스럽다 — CSS 애니메이션은 멈췄다 다시 켜면 그 지점부터 이어진다).
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            section.classList.toggle("radar-is-visible", entry.isIntersecting)
          })
        },
        { rootMargin: "60px" },
      )
      var dial = section.querySelector(".radar-dial")
      if (dial) io.observe(dial)
      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))
    } else {
      section.classList.add("radar-is-visible")
    }

    if (window.addCleanup) {
      window.addCleanup(function () {
        section.dataset.radarInit = "false"
      })
    }
  }

  function init() {
    initRadar(document.querySelector(".garden-home-radar"))
  }

  document.addEventListener("nav", init)
  init()
})()
