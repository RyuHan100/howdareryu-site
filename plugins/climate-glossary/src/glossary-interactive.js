// 검색 + 카테고리 필터: 서버가 이미 모든 카드를 그린 정적 HTML이므로, 필터/검색은 보이기/숨기기만
// 토글한다 — JS 없이도 전체 용어 목록이 그대로 보인다(progressive enhancement). 카테고리는
// climate-timeline 의 .tl-filter 와 같은 라디오 그룹(한 번에 하나, "전체"가 기본), 검색은 그
// 위에 AND 조건으로 더 좁힌다.
//
// 상세 패널: climate-timeline 의 .tl-modal 과 같은 패턴(포커스 이동·Escape·배경 클릭으로 닫기,
// position:fixed 드로어/바텀시트). 관련 용어 칩을 누르면 같은 패널이 그 용어 내용으로 다시
// 그려진다(별도 "이전/다음"이 아니라 명시적 관계로만 이동 — 타임라인의 시간순 이웃과 달리 용어
// 사이의 관계는 순서가 없다).
;(function () {
  function initGlossary(section) {
    if (!section || section.dataset.glInit === "true") return
    section.dataset.glInit = "true"

    var filters = Array.prototype.slice.call(section.querySelectorAll(".gl-filter"))
    var cards = Array.prototype.slice.call(section.querySelectorAll(".gl-card"))
    var searchInput = section.querySelector(".gl-search-input")
    var resultCount = section.querySelector(".gl-result-count")
    var emptyState = section.querySelector(".gl-empty")
    var modal = section.querySelector(".gl-modal")
    var dataEl = section.querySelector(".gl-detail-data")
    if (cards.length === 0) return

    var selectedCategory = "all"
    var query = ""

    // ---------- 검색 + 카테고리 필터 ----------
    function applyVisibility() {
      var visibleCount = 0
      cards.forEach(function (card) {
        var matchesCategory = selectedCategory === "all" || card.dataset.category === selectedCategory
        var matchesQuery = query === "" || card.dataset.search.indexOf(query) !== -1
        var visible = matchesCategory && matchesQuery
        card.hidden = !visible
        if (visible) visibleCount++
      })
      if (resultCount) {
        resultCount.textContent = visibleCount === 0 ? "검색 결과 없음" : visibleCount + "개 용어"
      }
      if (emptyState) emptyState.hidden = visibleCount !== 0
    }

    filters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectedCategory = btn.dataset.filter
        filters.forEach(function (b) {
          b.setAttribute("aria-checked", b === btn ? "true" : "false")
        })
        applyVisibility()
      })
    })

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        query = searchInput.value.trim().toLowerCase()
        applyVisibility()
      })
      // 검색어가 있을 때 Escape 를 누르면 검색만 지운다(모달이 닫혀 있을 때의 편의 기능 —
      // 모달이 열려 있을 때의 Escape 는 아래 onKeydown 이 모달 닫기를 담당한다).
      searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && searchInput.value) {
          e.stopPropagation()
          searchInput.value = ""
          query = ""
          applyVisibility()
        }
      })
    }

    applyVisibility()

    // ---------- 상세 패널 ----------
    if (!modal || !dataEl) return
    var detailById = {}
    try {
      detailById = JSON.parse(dataEl.textContent || "{}")
    } catch {
      detailById = {}
    }

    var title = modal.querySelector(".gl-modal-title")
    var meta = modal.querySelector(".gl-modal-meta")
    var sub = modal.querySelector(".gl-modal-sub")
    var desc = modal.querySelector(".gl-modal-desc")
    var sourcesWrap = modal.querySelector(".gl-modal-sources")
    var sourcesList = modal.querySelector(".gl-modal-sources-list")
    var relatedWrap = modal.querySelector(".gl-modal-related")
    var relatedList = modal.querySelector(".gl-modal-related-list")
    var status = modal.querySelector(".gl-modal-status")
    var panel = modal.querySelector(".gl-modal-panel")
    var closeEls = Array.prototype.slice.call(modal.querySelectorAll("[data-gl-close]"))
    var lastFocused = null
    // 닫기(애니메이션)를 시작할 때마다 1씩 올린다 — climate-timeline 의 closeToken 과 같은 이유
    // (닫히는 도중 다시 열리면 이전 닫기의 뒤늦은 마무리가 새로 연 패널을 닫지 못하게 한다).
    var closeToken = 0
    var currentId = null

    function fillOrHide(el, text) {
      if (text) {
        el.textContent = text
        el.hidden = false
      } else {
        el.textContent = ""
        el.hidden = true
      }
    }

    function renderSources(sources) {
      sourcesList.innerHTML = ""
      sourcesWrap.hidden = sources.length === 0
      sources.forEach(function (s) {
        var li = document.createElement("li")
        li.className = "gl-source"

        var a = document.createElement("a")
        a.className = "gl-source-link"
        a.href = s.url
        a.target = "_blank"
        a.rel = "noopener noreferrer"

        var icon = document.createElement("span")
        icon.className = "gl-source-icon"
        icon.setAttribute("aria-hidden", "true")
        icon.textContent = "↗"

        var name = document.createElement("span")
        name.className = "gl-source-name"
        name.textContent = s.title

        a.appendChild(icon)
        a.appendChild(name)
        li.appendChild(a)

        if (s.typeLabel) {
          var badge = document.createElement("span")
          badge.className = "gl-source-type"
          badge.textContent = s.typeLabel
          li.appendChild(badge)
        }

        var metaParts = []
        if (s.publisher) metaParts.push(s.publisher)
        if (s.date) metaParts.push(s.date)
        if (metaParts.length > 0) {
          var metaEl = document.createElement("span")
          metaEl.className = "gl-source-meta"
          metaEl.textContent = metaParts.join(" · ")
          li.appendChild(metaEl)
        }

        sourcesList.appendChild(li)
      })
    }

    function renderRelated(related) {
      relatedList.innerHTML = ""
      relatedWrap.hidden = related.length === 0
      related.forEach(function (r) {
        var li = document.createElement("li")
        var btn = document.createElement("button")
        btn.type = "button"
        btn.className = "gl-related-chip"
        btn.textContent = r.term
        btn.addEventListener("click", function () {
          navigateTo(r.id)
        })
        li.appendChild(btn)
        relatedList.appendChild(li)
      })
    }

    function render(d) {
      meta.textContent = d.category
      title.textContent = d.term
      fillOrHide(sub, d.sub)
      desc.textContent = d.definition || ""
      renderSources(d.sources || [])
      renderRelated(d.related || [])
    }

    // triggerEl: 카드를 연 실제 버튼(있으면). Chrome은 마우스 클릭만으로도 버튼에 포커스가
    // 가지만 Safari·Firefox 는 기본적으로 마우스 클릭으로 버튼에 포커스를 주지 않는다 — 그
    // 브라우저들에서 document.activeElement 에만 의존하면 lastFocused 가 body 가 돼서, 패널을
    // 닫을 때 포커스가 어디로도 안 돌아간다. 그래서 클릭 핸들러가 실제 버튼 참조를 넘겨준다
    // (키보드로 열었을 때는 활성 요소 자체가 이미 그 버튼이라 인자를 안 줘도 정확하다).
    function open(id, triggerEl) {
      var d = detailById[id]
      if (!d) return
      lastFocused = triggerEl || document.activeElement
      currentId = id
      render(d)

      closeToken++
      modal.hidden = false
      // hidden 을 떼자마자 클래스를 붙이면 브라우저가 시작 상태를 못 그리고 바로 최종 상태로
      // 뛰어버려 슬라이드 트랜지션이 재생되지 않는다 — 한 프레임 쉬고 붙인다.
      requestAnimationFrame(function () {
        modal.classList.add("is-open")
      })
      var closeBtn = modal.querySelector(".gl-modal-close")
      if (closeBtn) closeBtn.focus()
      status.textContent = d.term
      document.addEventListener("keydown", onKeydown)
    }

    // 관련 용어 칩으로 다른 용어로 이동: 이미 열려 있는 같은 패널의 내용만 다시 그린다.
    // open() 을 다시 부르면 lastFocused 가 (페이지의 카드가 아니라) 방금 누른 칩으로
    // 덮어써져서, 나중에 패널을 닫을 때 포커스가 이미 지워진 칩으로 돌아가려다 사라지는
    // 문제가 생긴다(패널을 처음 연 카드로 포커스가 돌아가야 한다) — 그래서 lastFocused 는
    // 건드리지 않고, climate-timeline 의 이전/다음 이동처럼 제목으로 포커스를 옮겨 스크린
    // 리더가 바뀐 내용을 바로 읽게 한다.
    function navigateTo(id) {
      var d = detailById[id]
      if (!d || id === currentId) return
      currentId = id
      render(d)
      title.focus()
      status.textContent = d.term
    }

    function close() {
      modal.classList.remove("is-open")
      document.removeEventListener("keydown", onKeydown)
      var reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      var token = ++closeToken
      function finish() {
        if (token !== closeToken) return
        closeToken++
        modal.hidden = true
        if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus()
      }
      if (reduced) {
        finish()
        return
      }
      setTimeout(finish, 250)
      if (panel) {
        panel.addEventListener("transitionend", function onEnd(e) {
          if (e.target !== panel) return
          panel.removeEventListener("transitionend", onEnd)
          finish()
        })
      }
    }

    // aria-modal 패널: Tab 이 패널 밖(뒤의 카드 그리드)으로 빠져나가지 않게 처음/끝에서 돈다.
    function trapTab(e) {
      var focusables = Array.prototype.filter.call(panel.querySelectorAll("a[href], button"), function (el) {
        return !el.hidden && !el.disabled
      })
      if (focusables.length === 0) return
      var first = focusables[0]
      var last = focusables[focusables.length - 1]
      var active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    function onKeydown(e) {
      if (e.key === "Escape") close()
      else if (e.key === "Tab") trapTab(e)
    }
    if (window.addCleanup) {
      window.addCleanup(function () {
        document.removeEventListener("keydown", onKeydown)
      })
    }

    cards.forEach(function (btn) {
      btn.addEventListener("click", function () {
        open(btn.dataset.id, btn)
      })
    })
    closeEls.forEach(function (el) {
      el.addEventListener("click", close)
    })
  }

  function init() {
    var sections = document.querySelectorAll(".climate-glossary")
    for (var i = 0; i < sections.length; i++) initGlossary(sections[i])
  }

  document.addEventListener("nav", init)
})()
