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
    var locationEl = modal.querySelector(".tl-modal-location")
    var desc = modal.querySelector(".tl-modal-desc")
    var sourcesWrap = modal.querySelector(".tl-modal-sources")
    var sourcesList = modal.querySelector(".tl-modal-sources-list")
    var tagsEl = modal.querySelector(".tl-modal-tags")
    var status = modal.querySelector(".tl-modal-status")
    var prevBtn = modal.querySelector(".tl-modal-prev")
    var nextBtn = modal.querySelector(".tl-modal-next")
    var panel = modal.querySelector(".tl-modal-panel")
    var closeEls = Array.prototype.slice.call(modal.querySelectorAll("[data-tl-close]"))
    var lastFocused = null
    var currentId = null
    var closeTimer = null

    // 존재하지 않는 필드는 빈 칸으로 안 남기고 그 요소 자체를 hidden 처리한다(요구사항).
    // 지금 데이터에는 location/tags 가 없어 항상 hidden 이지만, 나중에 이벤트에 추가되면
    // 이 함수는 고칠 필요 없이 그대로 표시한다.
    function fillOrHide(el, text) {
      if (text) {
        el.textContent = text
        el.hidden = false
      } else {
        el.textContent = ""
        el.hidden = true
      }
    }

    // 출처 목록 렌더링을 카드 본문 렌더링(render)과 분리해 둔다 — source type 배지, 인용
    // 횟수, 1차 자료 표시, 외부 링크 아이콘 같은 걸 나중에 추가할 때 이 함수만 고치면 되고,
    // render() 나 다른 필드 처리 로직을 건드릴 필요가 없다. sources 는 timeline-render.js 의
    // normalizeSources() 가 이미 title/url/type/typeLabel/publisher/date 로 통일해 둔 배열이라
    // (옛 links 스키마여도 여기 도착할 땐 같은 모양) 여기서 스키마 분기를 할 필요가 없다.
    function renderSources(sources) {
      sourcesList.innerHTML = ""
      sourcesWrap.hidden = sources.length === 0
      sources.forEach(function (source) {
        var li = document.createElement("li")
        li.className = "tl-source"

        var a = document.createElement("a")
        a.className = "tl-source-link"
        a.href = source.url
        a.target = "_blank"
        a.rel = "noopener noreferrer"

        var icon = document.createElement("span")
        icon.className = "tl-source-icon"
        icon.setAttribute("aria-hidden", "true")
        icon.textContent = "↗"

        var name = document.createElement("span")
        name.className = "tl-source-name"
        name.textContent = source.title

        a.appendChild(icon)
        a.appendChild(name)
        li.appendChild(a)

        // type/publisher/date 는 실제 데이터에 있을 때만 만든다 — 없는 값을 빈 칸으로
        // 남기지 않는다(요구사항).
        if (source.typeLabel) {
          var badge = document.createElement("span")
          badge.className = "tl-source-type"
          badge.textContent = source.typeLabel
          li.appendChild(badge)
        }

        var metaParts = []
        if (source.publisher) metaParts.push(source.publisher)
        if (source.date) metaParts.push(source.date)
        if (metaParts.length > 0) {
          var metaEl = document.createElement("span")
          metaEl.className = "tl-source-meta"
          metaEl.textContent = metaParts.join(" · ")
          li.appendChild(metaEl)
        }

        sourcesList.appendChild(li)
      })
    }

    function render(d) {
      meta.textContent = d.category + " · " + d.date
      title.textContent = d.title
      fillOrHide(locationEl, d.location)
      desc.textContent = d.description || ""

      if (d.image) {
        img.src = d.image
        img.alt = d.imageAlt || d.title
        img.hidden = false
      } else {
        img.removeAttribute("src")
        img.hidden = true
      }

      renderSources(d.sources || [])

      tagsEl.innerHTML = ""
      var tags = d.tags || []
      tagsEl.hidden = tags.length === 0
      tags.forEach(function (tag) {
        var li = document.createElement("li")
        li.textContent = tag
        tagsEl.appendChild(li)
      })

      prevBtn.hidden = !d.prevId
      nextBtn.hidden = !d.nextId
    }

    function open(id) {
      var d = detailById[id]
      if (!d) return
      lastFocused = document.activeElement
      currentId = id
      render(d)

      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      modal.hidden = false
      // hidden 을 떼자마자 클래스를 붙이면 브라우저가 시작 상태를 못 그리고 바로 최종
      // 상태로 뛰어버려 슬라이드 트랜지션이 재생되지 않는다 — 한 프레임 쉬고 붙인다.
      requestAnimationFrame(function () {
        modal.classList.add("is-open")
      })
      var closeBtn = modal.querySelector(".tl-modal-close")
      if (closeBtn) closeBtn.focus()
      document.addEventListener("keydown", onKeydown)
    }

    function navigate(dir) {
      var d = detailById[currentId]
      if (!d) return
      var targetId = dir === "prev" ? d.prevId : d.nextId
      if (!targetId) return
      var target = detailById[targetId]
      if (!target) return
      currentId = targetId
      render(target)
      // 화면이 갑자기 안 바뀐 것처럼 보이지 않도록, 이전/다음 사건으로 넘어가면 초점을
      // 제목으로 옮긴다(스크린리더가 새 사건 제목을 바로 읽는다) — 처음 열 때는 그대로
      // 닫기 버튼에 초점을 준다(위 open() 참고, 서로 다른 상황이라 다르게 처리한다).
      title.focus()
      status.textContent = target.date + " · " + target.title
    }

    function close() {
      modal.classList.remove("is-open")
      document.removeEventListener("keydown", onKeydown)
      var reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      var finished = false
      function finish() {
        if (finished) return // 트랜지션 종료(transitionend)와 안전장치 타이머가 둘 다
        finished = true // 걸려 있어, 먼저 끝나는 쪽이 실행된 뒤 나머지는 조용히 무시한다.
        closeTimer = null
        modal.hidden = true
        currentId = null
        if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus()
      }
      if (reduced) {
        finish()
        return
      }
      closeTimer = setTimeout(finish, 250)
      if (panel) {
        panel.addEventListener(
          "transitionend",
          function once() {
            panel.removeEventListener("transitionend", once)
            if (closeTimer) clearTimeout(closeTimer)
            finish()
          },
          { once: true },
        )
      }
    }

    function onKeydown(e) {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowLeft") navigate("prev")
      else if (e.key === "ArrowRight") navigate("next")
    }

    events.forEach(function (btn) {
      btn.addEventListener("click", function () {
        open(btn.dataset.id)
      })
    })
    closeEls.forEach(function (el) {
      el.addEventListener("click", close)
    })
    prevBtn.addEventListener("click", function () {
      navigate("prev")
    })
    nextBtn.addEventListener("click", function () {
      navigate("next")
    })
  }

  function init() {
    var sections = document.querySelectorAll(".climate-timeline")
    for (var i = 0; i < sections.length; i++) initTimeline(sections[i])
  }

  document.addEventListener("nav", init)
})()
