// 용어집 인라인 연동. plugins/glossary-linker 가 노트 본문에 심어둔
// <a class="glossary-ref" href="/glossary#id" data-no-popover> 위에, 그 용어 하나의 짧은
// 정의만 보여주는 작은 툴팁을 띄운다(Quartz 기본 팝오버는 data-no-popover 로 이미 꺼져 있다).
// 데이터(window.__GLOSSARY_TERMS__)는 glossary-terms-data.js(quartz/garden/
// syncGlossaryTermsData.ts 가 빌드 시점에 생성)가 이 스크립트보다 먼저 로드해 둔다.
//
// 링크 자체는 진짜 <a href> 라 JS 없이도 클릭하면 /glossary#id 로 이동한다 — 이 스크립트는
// 순수 향상(hover/focus 시 미리보기)만 담당한다. 툴팁은 마우스를 올리거나 키보드로 포커스했을
// 때만 보이고, 클릭하면 곧장 이동(SPA 라우터가 가로채 nav 이벤트를 새로 낸다) — 그 페이지에서
// glossary-page.js 쪽(climate-glossary 컴포넌트)이 location.hash 를 보고 그 용어 패널을
// 자동으로 연다(plugins/climate-glossary/src/glossary-interactive.js 참고).
;(function () {
  var tooltip = null
  var currentLink = null
  var hideTimer = null

  function ensureTooltip() {
    if (tooltip) return tooltip
    tooltip = document.createElement("div")
    tooltip.className = "glossary-tooltip"
    tooltip.setAttribute("role", "tooltip")
    tooltip.hidden = true
    document.body.appendChild(tooltip)
    return tooltip
  }

  function truncate(text, max) {
    if (!text) return ""
    return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
  }

  function show(link) {
    var data = window.__GLOSSARY_TERMS__
    var id = link.dataset.termId
    var term = data && id ? data[id] : null
    if (!term) return

    clearTimeout(hideTimer)
    currentLink = link
    var el = ensureTooltip()
    el.innerHTML = ""

    var head = document.createElement("div")
    head.className = "glossary-tooltip-term"
    head.textContent = term.term
    if (term.category) {
      var badge = document.createElement("span")
      badge.className = "glossary-tooltip-badge"
      badge.textContent = term.category
      head.appendChild(badge)
    }
    el.appendChild(head)

    if (term.definition) {
      var desc = document.createElement("p")
      desc.className = "glossary-tooltip-desc"
      desc.textContent = truncate(term.definition, 110)
      el.appendChild(desc)
    }

    var hint = document.createElement("span")
    hint.className = "glossary-tooltip-hint"
    hint.textContent = "자세히 보기 →"
    el.appendChild(hint)

    el.hidden = false
    position(link, el)
  }

  function position(link, el) {
    var rect = link.getBoundingClientRect()
    var elRect = el.getBoundingClientRect()
    var top = rect.bottom + 8
    var left = rect.left
    // 오른쪽이 화면 밖으로 나가면 왼쪽으로 당기고, 아래도 마찬가지로 좁은 화면을 고려한다.
    if (left + elRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - elRect.width - 8)
    }
    if (top + elRect.height > window.innerHeight - 8) {
      top = rect.top - elRect.height - 8
    }
    el.style.top = Math.max(8, top) + "px"
    el.style.left = left + "px"
  }

  function hide() {
    currentLink = null
    if (tooltip) tooltip.hidden = true
  }

  function scheduleHide() {
    clearTimeout(hideTimer)
    hideTimer = setTimeout(hide, 80)
  }

  function initGlossaryTooltip(root) {
    if (!root || root.dataset.glossaryTooltipInit === "true") return
    root.dataset.glossaryTooltipInit = "true"

    root.addEventListener("mouseover", function (e) {
      var link = e.target.closest && e.target.closest(".glossary-ref")
      if (link && root.contains(link)) show(link)
    })
    root.addEventListener("mouseout", function (e) {
      var link = e.target.closest && e.target.closest(".glossary-ref")
      if (link) scheduleHide()
    })
    root.addEventListener(
      "focusin",
      function (e) {
        var link = e.target.closest && e.target.closest(".glossary-ref")
        if (link) show(link)
      },
      true,
    )
    root.addEventListener(
      "focusout",
      function (e) {
        var link = e.target.closest && e.target.closest(".glossary-ref")
        if (link) scheduleHide()
      },
      true,
    )
  }

  function onScrollOrResize() {
    if (currentLink && tooltip && !tooltip.hidden) position(currentLink, tooltip)
  }

  function init() {
    var article = document.querySelector("article")
    if (article) initGlossaryTooltip(article)
    hide()
  }

  document.addEventListener("nav", init)
  // defer 로 늦게 로드되면 최초 nav 이벤트를 놓칠 수 있어(gallery-page-interactive.js 와 같은
  // 이유) 스크립트가 실행되는 즉시 한 번 더 부른다 — initGlossaryTooltip 은 dataset 플래그로
  // 중복 실행을 막으니 두 번 불려도 안전하다.
  init()
  window.addEventListener("scroll", onScrollOrResize, true)
  window.addEventListener("resize", onScrollOrResize)
  if (window.addCleanup) {
    window.addCleanup(function () {
      hide()
    })
  }
})()
