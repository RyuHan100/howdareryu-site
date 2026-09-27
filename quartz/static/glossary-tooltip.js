// 용어집 인라인 연동. plugins/glossary-linker 가 노트 본문에 심어둔
// <a class="glossary-ref" href="/glossary#id" data-no-popover> 위에, 그 용어 하나의 짧은
// 정의만 보여주는 작은 툴팁을 띄운다(Quartz 기본 팝오버는 data-no-popover 로 이미 꺼져 있다).
// 데이터(window.__GLOSSARY_TERMS__)는 glossary-terms-data.js(quartz/garden/
// syncGlossaryTermsData.ts 가 빌드 시점에 생성)가 이 스크립트보다 먼저 로드해 둔다.
//
// href 는 JS 없을 때를 위한 진짜 링크로 남겨두지만(용어집 페이지의 hash 오픈 로직,
// plugins/climate-glossary/src/glossary-interactive.js 이 그 대상), 이 스크립트가 로드되면
// 클릭(마우스 클릭·터치 탭·포커스 상태에서 Enter/Space 로 활성화하는 것 전부 DOM 상
// "click" 이벤트 하나로 들어온다)을 가로채 preventDefault 해서 이동을 막는다(2026-09-27부터
// — 이전에는 클릭하면 곧장 이동했다). 대신 hover 나 focus 로 툴팁을 띄워 그 자리에
// 머무르게 한다. 데스크톱은 마우스 hover 로 이미 보이는 채로 클릭해도 그대로 유지되고,
// 터치 기기는 hover 가 없어서 탭 자체가 첫 표시 트리거다 — 같은 용어를 다시 탭하면
// 닫히고(토글), 용어가 아닌 다른 곳을 탭/클릭해도 닫힌다. 이 토글/바깥-탭-닫기 판정에서
// "포커스가 막 이 링크로 온 직후의 클릭"(키보드 Enter, 또는 터치 탭이 focus+click 두
// 이벤트로 갈라지는 경우)과 "이미 열려 있는 걸 다시 누른 것"을 구분해야 하는데, 전자를
// 토글로 착각해 방금 연 툴팁을 그 자리에서 닫아버리면 안 되므로 suppressNextToggle 로
// 표시해둔다(아래 focusin/click 참고) — 실제 헤드리스 크롬 CDP 로 마우스 클릭·키보드
// Tab+Enter·터치 탭(hover 없이 곧장 클릭) 세 가지 순서를 재현해 검증했다.
;(function () {
  var tooltip = null
  var currentLink = null
  var hideTimer = null
  // focusin 이 방금 이 링크를 열었으면 true — 그 직후 같은 활성화(키보드 Enter, 또는 터치
  // 탭의 click 절반)가 click 핸들러에서 "이미 열린 걸 또 눌렀다"로 오인돼 토글로 닫히지
  // 않게 한다. click 핸들러가 한 번 소비하면 바로 false 로 되돌린다.
  var suppressNextToggle = false

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
        if (link) {
          show(link)
          suppressNextToggle = true
        }
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
    root.addEventListener("click", function (e) {
      var link = e.target.closest && e.target.closest(".glossary-ref")
      if (!link) return
      e.preventDefault()
      var wasSuppressed = suppressNextToggle
      suppressNextToggle = false
      if (currentLink === link && tooltip && !tooltip.hidden && !wasSuppressed) {
        // 이미 열려 있는 걸 다시 눌렀다(마우스 재클릭 또는 터치 두 번째 탭) — 토글로 닫는다.
        hide()
      } else {
        show(link)
      }
    })
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
  // 용어가 아닌 곳을 클릭/탭하면 닫는다 — article 안의 mouseout/focusout 만으로는 터치에서
  // 안 잡히는 경우가 있다(포커스가 안 옮겨가는 비-포커스 요소를 탭했을 때). document 에
  // 한 번만 묶는다(nav 마다 다시 그려지는 article 과 달리 document 는 페이지 내내 그대로라
  // init() 안에서 묶으면 nav 때마다 중복 등록된다).
  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest(".glossary-ref")
    if (!link) hide()
  })
  if (window.addCleanup) {
    window.addCleanup(function () {
      hide()
    })
  }
})()
