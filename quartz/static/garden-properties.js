// 노트 상단 Properties 표를 정원 콘셉트 표시 이름으로 갈아 끼운다. frontmatter 의 실제 키는
// 절대 안 건드리고(note-properties 플러그인이 렌더링한 뒤, 화면에 보이는 텍스트만 바꾼다),
// SPA 이동(quartz.config.yaml 의 note-properties 는 매번 새로 렌더링되므로) 때마다 nav 이벤트로
// 다시 적용한다. 설정/데이터(window.__GARDEN_PROPERTIES__)는 garden-properties-data.js
// (quartz/garden/syncPropertiesFromGarden.ts 가 빌드 시점에 생성) 가 이 스크립트보다 먼저
// 로드되어 정의해 둔다 — 그 파일이 없거나 아직 없으면 조용히 아무 것도 하지 않는다.
;(function () {
  function apply() {
    var cfg = window.__GARDEN_PROPERTIES__
    if (!cfg) return

    var box = document.querySelector(".note-properties")
    if (!box) return

    var titleEl = box.querySelector(".note-properties-title")
    if (titleEl && cfg.tableTitle) titleEl.textContent = cfg.tableTitle

    var slug = (document.body && document.body.dataset && document.body.dataset.slug) || ""
    var top = slug.split("/")[0]
    var isRadar = !!cfg.radarFolder && top === cfg.radarFolder
    var labels = cfg.labels || {}
    if (isRadar && cfg.radarLabelOverrides) {
      labels = Object.assign({}, labels, cfg.radarLabelOverrides)
    }

    var dropKeys = {}
    ;(cfg.dropKeys || []).forEach(function (k) {
      dropKeys[k] = true
    })

    var removed = 0
    var rows = box.querySelectorAll(".note-properties-row")
    rows.forEach(function (row) {
      var keyEl = row.querySelector(".note-properties-key")
      if (!keyEl) return
      var rawKey = (keyEl.textContent || "").trim()
      if (dropKeys[rawKey]) {
        row.remove()
        removed++
        return
      }
      if (labels[rawKey]) keyEl.textContent = labels[rawKey]
    })

    var extra = cfg.notes && cfg.notes[slug]
    var added = 0
    if (extra) {
      var tbody = box.querySelector(".note-properties-table tbody")
      if (tbody && !tbody.querySelector('[data-garden-extra="true"]')) {
        Object.keys(extra).forEach(function (label) {
          var tr = document.createElement("tr")
          tr.className = "note-properties-row metadata-property"
          tr.setAttribute("data-garden-extra", "true")

          var tdKey = document.createElement("td")
          tdKey.className = "note-properties-key metadata-property-key"
          tdKey.textContent = label

          var tdVal = document.createElement("td")
          tdVal.className = "note-properties-value metadata-property-value"
          var span = document.createElement("span")
          span.className = "note-properties-text"
          span.textContent = extra[label]
          tdVal.appendChild(span)

          tr.appendChild(tdKey)
          tr.appendChild(tdVal)
          tbody.appendChild(tr)
          added++
        })
      }
    }

    var countEl = box.querySelector(".note-properties-count")
    if (countEl) {
      var current = parseInt(countEl.textContent || "0", 10) || 0
      countEl.textContent = String(current - removed + added)
    }
  }

  document.addEventListener("nav", apply)
  apply()
})()
