// 정원의 상호작용·움직임. component.js 가 Component.afterDOMLoaded 로 붙인다(build.mjs 가
// 이 파일을 문자열로 넣는다). 홈(index)에서만 존재하는 .garden-home-garden 섹션을 다룬다.
// SPA 라 nav 이벤트마다 다시 찾아서 건다(quartz/components/scripts/spa.inline.ts 패턴).
//
// - 식물을 클릭/키보드로 고르면: 패널에 제목·종류·물 준 날 + 노트로 가는 링크, 그 식물의
//   뿌리(이 정원 안의 다른 식물로 가는 링크·백링크)만 곡선으로 표시.
// - 화면에 보이는 이랑(.gp-row)만 살짝 흔들리게(prefers-reduced-motion 이면 아예 안 붙인다).
// - 재생 버튼: 가장 오래된 식물의 심은 날부터 오늘까지 1주 단위로 식물이 하나씩 나타난다.
;(function () {
  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&")
  }

  function initGarden(section) {
    if (!section || section.dataset.gpInit === "true") return
    section.dataset.gpInit = "true"

    var plants = Array.prototype.slice.call(section.querySelectorAll(".gp-plant"))
    var panel = section.querySelector(".gp-panel")
    var panelTitle = panel && panel.querySelector(".gp-panel-title")
    var panelMeta = panel && panel.querySelector(".gp-panel-meta")
    var panelLink = panel && panel.querySelector(".gp-panel-link")
    var panelClose = panel && panel.querySelector(".gp-panel-close")

    function overlaysOf() {
      return Array.prototype.slice.call(section.querySelectorAll(".gp-roots"))
    }

    function clearRoots() {
      overlaysOf().forEach(function (svg) {
        svg.textContent = ""
      })
    }

    function drawRoots(plant) {
      clearRoots()
      var links = (plant.dataset.links || "").split(",").filter(Boolean)
      if (!links.length) return
      var bed = plant.closest(".gp-beds")
      var overlay = bed && bed.querySelector(".gp-roots")
      if (!bed || !overlay) return
      var bedRect = bed.getBoundingClientRect()
      var fromRect = plant.getBoundingClientRect()
      var fromX = fromRect.left + fromRect.width / 2 - bedRect.left
      var fromY = fromRect.bottom - bedRect.top - 2
      var d = ""
      links.forEach(function (slug) {
        var target = bed.querySelector('.gp-plant[data-slug="' + cssEscape(slug) + '"]')
        if (!target) return
        var r = target.getBoundingClientRect()
        var toX = r.left + r.width / 2 - bedRect.left
        var toY = r.bottom - bedRect.top - 2
        var dipY = Math.max(fromY, toY) + 18
        d += "M" + fromX + " " + fromY + "Q" + (fromX + toX) / 2 + " " + dipY + " " + toX + " " + toY + " "
      })
      if (d) overlay.innerHTML = '<path class="gp-root-line" d="' + d + '"></path>'
    }

    function showPanel(plant) {
      if (!panel) return
      if (panelTitle) panelTitle.textContent = plant.dataset.title || ""
      var kind = plant.dataset.kind || ""
      var modified = plant.dataset.modified || ""
      if (panelMeta) panelMeta.textContent = [kind, modified ? "물 준 날 " + modified : ""].filter(Boolean).join(" · ")
      if (panelLink) panelLink.setAttribute("href", "./" + (plant.dataset.slug || ""))
      panel.classList.add("is-open")
    }

    function hidePanel() {
      if (panel) panel.classList.remove("is-open")
    }

    var selected = null

    function deselect() {
      selected = null
      plants.forEach(function (p) {
        p.setAttribute("aria-expanded", "false")
      })
      hidePanel()
      clearRoots()
    }

    function select(plant) {
      if (selected === plant) {
        deselect()
        return
      }
      selected = plant
      plants.forEach(function (p) {
        p.setAttribute("aria-expanded", p === plant ? "true" : "false")
      })
      showPanel(plant)
      drawRoots(plant)
    }

    plants.forEach(function (p) {
      p.addEventListener("click", function (e) {
        e.preventDefault()
        select(p)
      })
      p.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault()
          select(p)
        } else if (e.key === "Escape") {
          deselect()
        }
      })
    })
    if (panelClose) panelClose.addEventListener("click", deselect)

    // 화면에 보이는 이랑만 흔들리게. 모션 최소화를 선호하면 관찰기 자체를 안 붙인다
    // (CSS 도 같은 media query 로 한 번 더 막아 둔다 — CLAUDE.md §9).
    if (window.IntersectionObserver && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            entry.target.classList.toggle("is-visible", entry.isIntersecting)
          })
        },
        { rootMargin: "80px" },
      )
      section.querySelectorAll(".gp-row").forEach(function (row) {
        io.observe(row)
      })
      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))
    }

    // 타임랩스
    var playBtn = section.querySelector(".gp-play")
    var dateLabel = section.querySelector(".gp-timelapse-date")
    var timer = null

    function stopTimelapse(reveal) {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (playBtn) playBtn.textContent = "▶ 타임랩스로 보기"
      if (reveal) {
        plants.forEach(function (p) {
          p.classList.remove("gp-future")
        })
        if (dateLabel) dateLabel.textContent = ""
      }
    }

    function weeklySteps(startMs, todayMs) {
      var steps = []
      var t = startMs
      var week = 7 * 24 * 60 * 60 * 1000
      while (t < todayMs) {
        steps.push(t)
        t += week
      }
      steps.push(todayMs)
      return steps
    }

    function startTimelapse() {
      var created = plants
        .map(function (p) {
          var t = p.dataset.created ? new Date(p.dataset.created).getTime() : NaN
          return isNaN(t) ? null : t
        })
        .filter(function (t) {
          return t !== null
        })
      if (!created.length) return
      var steps = weeklySteps(Math.min.apply(null, created), Date.now())

      if (playBtn) playBtn.textContent = "■ 멈추기"
      var i = 0

      function frame() {
        var cur = steps[i]
        plants.forEach(function (p) {
          var t = p.dataset.created ? new Date(p.dataset.created).getTime() : NaN
          var show = isNaN(t) || t <= cur
          p.classList.toggle("gp-future", !show)
        })
        if (dateLabel) dateLabel.textContent = new Date(cur).toISOString().slice(0, 10)
        i++
        if (i >= steps.length) stopTimelapse(false)
      }

      frame()
      timer = setInterval(frame, 260)
      if (window.addCleanup) window.addCleanup(function () { stopTimelapse(true) })
    }

    if (playBtn) {
      playBtn.addEventListener("click", function () {
        if (timer) {
          stopTimelapse(true)
        } else {
          startTimelapse()
        }
      })
    }

    if (window.addCleanup) {
      window.addCleanup(function () {
        section.dataset.gpInit = "false"
      })
    }
  }

  function init() {
    initGarden(document.querySelector(".garden-home-garden"))
  }

  document.addEventListener("nav", init)
  init()
})()
