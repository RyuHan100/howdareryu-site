// 카테고리 필터: 라디오 그룹처럼 한 번에 하나만 선택된다("전체"가 기본). 서버가 이미 모든
// 이벤트를 그린 정적 HTML 이므로, 필터는 보이기/숨기기만 토글한다 — JS 없이도 전체 타임라인이
// 그대로 보인다(progressive enhancement). 필터는 줌(tlCreateView, timeline-view.js)과 무관하게
// 동작한다 — 위치는 항상 CSS calc(var(--month-width)*var(--x)) 라 줌 배율이 바뀌어도 숨김
// 여부와 상관없이 정확하다.
//
// 상세 모달: gallery-page 의 라이트박스와 같은 패턴(포커스 이동·Escape·배경 클릭으로 닫기).
// position:fixed 라 .tl-scroll 의 overflow-x:auto 와 무관하게 항상 화면 안에 꽉 차게 뜬다
// (이전엔 hover 로만 뜨는 작은 라벨이 .tl-scroll 의 overflow 에 잘리는 문제가 있었다).
;(function () {
  // 아래 표시 자리에 build.mjs 가 timeline-scale.js + timeline-view.js(tlCreateView 등)를
  // 그대로 이어붙인다. 이 IIFE 안에 들어와야(garden-home 처럼 다른 인터랙티브 파일들과 한
  // 스코프를 공유하는 번들에서도) 이름이 안 새어나간다. 집중 모드(Focus Mode)의 폭 자동 확장은
  // 이제 tlCreateView 안의 autoBasePx() 가 맡는다 — 예전엔 여기 별도 initResponsiveScale
  // 함수가 .tl-track 에 직접 --month-width 를 심었는데, 줌 컨트롤러도 같은 변수를 다루게
  // 되면서 하나로 합쳤다(둘이 서로 다른 요소에 같은 변수를 심으면 집중 모드가 켜졌을 때 줌이
  // 풀리거나 반대로 줌이 집중 모드의 폭 확장을 무시하는 문제가 생긴다).
  // __TL_SCALE_AND_VIEW__

  function initTimeline(section) {
    if (!section || section.dataset.tlInit === "true") return
    section.dataset.tlInit = "true"

    var filters = Array.prototype.slice.call(section.querySelectorAll(".tl-filter"))
    var events = Array.prototype.slice.call(section.querySelectorAll(".tl-event"))
    var modal = section.querySelector(".tl-modal")
    var dataEl = section.querySelector(".tl-detail-data")
    if (events.length === 0) return

    // ---------- 필터 ----------
    function applyFilter(key) {
      events.forEach(function (el) {
        el.hidden = key !== "all" && el.dataset.category !== key
      })
      filters.forEach(function (btn) {
        btn.setAttribute("aria-checked", btn.dataset.filter === key ? "true" : "false")
      })
    }
    filters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyFilter(btn.dataset.filter)
      })
    })

    if (typeof tlCreateView === "function") tlCreateView(section)

    // ---------- 상세 모달 ----------
    if (!modal || !dataEl) return
    var detailById = {}
    try {
      detailById = JSON.parse(dataEl.textContent || "{}")
    } catch {
      detailById = {}
    }

    var img = modal.querySelector(".tl-modal-image")
    var meta = modal.querySelector(".tl-modal-meta")
    var title = modal.querySelector(".tl-modal-title")
    var desc = modal.querySelector(".tl-modal-desc")
    var links = modal.querySelector(".tl-modal-links")
    var closeEls = Array.prototype.slice.call(modal.querySelectorAll("[data-tl-close]"))
    var lastFocused = null

    function open(id) {
      var d = detailById[id]
      if (!d) return
      lastFocused = document.activeElement

      meta.textContent = d.category + " · " + d.date
      title.textContent = d.title
      desc.textContent = d.description || ""

      if (d.image) {
        img.src = d.image
        img.alt = d.imageAlt || d.title
        img.hidden = false
      } else {
        img.removeAttribute("src")
        img.hidden = true
      }

      links.innerHTML = ""
      ;(d.links || []).forEach(function (link) {
        var li = document.createElement("li")
        var a = document.createElement("a")
        a.href = link.url
        a.target = "_blank"
        a.rel = "noopener noreferrer"
        a.textContent = link.title || link.url
        li.appendChild(a)
        links.appendChild(li)
      })

      modal.hidden = false
      var closeBtn = modal.querySelector(".tl-modal-close")
      if (closeBtn) closeBtn.focus()
      document.addEventListener("keydown", onKeydown)
    }

    function close() {
      modal.hidden = true
      document.removeEventListener("keydown", onKeydown)
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus()
    }

    function onKeydown(e) {
      if (e.key === "Escape") close()
    }

    events.forEach(function (btn) {
      btn.addEventListener("click", function () {
        open(btn.dataset.id)
      })
    })
    closeEls.forEach(function (el) {
      el.addEventListener("click", close)
    })
  }

  function init() {
    var sections = document.querySelectorAll(".climate-timeline")
    for (var i = 0; i < sections.length; i++) initTimeline(sections[i])
  }

  document.addEventListener("nav", init)
})()
