// climate glossary 의 핵심 — 카드 그리드 + 검색/필터 + 상세 패널을 순수 함수로 HTML 문자열로
// 만든다. 검색은 서버가 각 카드에 미리 만들어 둔 data-search 문자열(용어·풀네임·한국어 이름·설명을
// 합친 소문자 텍스트)을 클라이언트가 부분 일치로 찾는 방식이라(글자 수가 적은 정적 데이터셋이라
// FlexSearch 등 별도 색인 라이브러리 없이도 충분하다), 이 파일이 만드는 data-search 값과
// glossary-interactive.js 의 매칭 로직이 항상 같은 규칙(소문자, 공백 join)을 써야 한다.

function glEsc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** <script type="application/json"> 안에 그대로 넣을 수 있게 "</" 를 끊는다. */
function escJsonForScript(json) {
  return json.replace(/</g, "\\u003c")
}

const SOURCE_TYPE_LABELS = {
  primary: "1차 자료",
  scientific: "과학 논문",
  institutional: "기관",
  news: "뉴스",
  secondary: "2차 자료",
}

/** 풀네임·한국어 이름을 " · "로 잇는다. 둘 다 없으면 null(그 칸 자체를 안 만든다). */
function subtitle(t) {
  const parts = [t.fullName, t.korean].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

function preview(text, max) {
  if (!text) return ""
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}

/** sources: [{title,url,type?,publisher?,date?}]. 데이터에 없는 필드는 null 로 둬서
 * 클라이언트가 "없으면 그 칸을 안 만든다"는 규칙을 그대로 적용하게 한다. */
function normalizeSources(t) {
  const raw = Array.isArray(t.sources) ? t.sources : []
  return raw
    .filter((s) => s && s.url)
    .map((s) => ({
      title: s.title || s.url,
      url: s.url,
      typeLabel: s.type ? SOURCE_TYPE_LABELS[s.type] || s.type : null,
      publisher: s.publisher || null,
      date: s.date || null,
    }))
}

/**
 * terms: climate-glossary.json 의 terms 배열.
 * categories: [{key,label}, ...].
 * 반환: glossary 섹션 안에 그대로 넣을 HTML 문자열. terms 가 비어 있으면 null.
 */
export function renderGlossary(terms, categories) {
  if (terms.length === 0) return null

  const labelByKey = new Map(categories.map((c) => [c.key, c.label]))
  const byId = new Map(terms.map((t) => [t.id, t]))
  const sorted = [...terms].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }))

  const filterHtml =
    `<button type="button" class="gl-filter" data-filter="all" role="radio" aria-checked="true">` +
    `<span class="gl-legend-swatch gl-legend-all" aria-hidden="true"></span>전체</button>` +
    categories
      .map(
        (c) =>
          `<button type="button" class="gl-filter" data-filter="${glEsc(c.key)}" data-category="${glEsc(c.key)}" role="radio" aria-checked="false">` +
          `<span class="gl-legend-swatch" aria-hidden="true"></span>${glEsc(c.label)}</button>`,
      )
      .join("")

  const cardsHtml = sorted
    .map((t) => {
      const catLabel = labelByKey.get(t.category) || t.category
      const sub = subtitle(t)
      const searchBlob = [t.term, t.fullName, t.korean, t.definition].filter(Boolean).join(" ").toLowerCase()
      return (
        `<button type="button" class="gl-card" data-id="${glEsc(t.id)}" data-category="${glEsc(t.category)}" ` +
        `data-search="${glEsc(searchBlob)}" aria-haspopup="dialog">` +
        `<span class="gl-card-head">` +
        `<span class="gl-card-term">${glEsc(t.term)}</span>` +
        `<span class="gl-card-badge" data-category="${glEsc(t.category)}">${glEsc(catLabel)}</span>` +
        `</span>` +
        (sub ? `<span class="gl-card-sub">${glEsc(sub)}</span>` : "") +
        `<span class="gl-card-preview">${glEsc(preview(t.definition, 90))}</span>` +
        `</button>`
      )
    })
    .join("")

  // 상세 패널용 데이터. related 는 존재하는 id 로만 필터링해서, 오탈자나 나중에 지운 용어를
  // 가리키는 죽은 칩이 안 생기게 한다.
  const detailById = {}
  terms.forEach((t) => {
    const related = Array.isArray(t.related) ? t.related.filter((id) => byId.has(id)) : []
    detailById[t.id] = {
      term: t.term,
      sub: subtitle(t),
      category: labelByKey.get(t.category) || t.category,
      definition: t.definition || "",
      sources: normalizeSources(t),
      related: related.map((id) => ({ id, term: byId.get(id).term })),
    }
  })

  const modalHtml =
    `<div class="gl-modal" hidden role="dialog" aria-modal="true" aria-labelledby="gl-modal-title">` +
    `<div class="gl-modal-backdrop" data-gl-close="true"></div>` +
    `<div class="gl-modal-panel">` +
    `<button type="button" class="gl-modal-close" aria-label="닫기" data-gl-close="true">✕</button>` +
    `<p class="sr-only gl-modal-status" aria-live="polite"></p>` +
    `<div class="gl-modal-body">` +
    `<p class="gl-modal-meta"></p>` +
    `<h3 class="gl-modal-title" id="gl-modal-title" tabindex="-1"></h3>` +
    `<p class="gl-modal-sub" hidden></p>` +
    `<p class="gl-modal-desc"></p>` +
    `<div class="gl-modal-sources" hidden>` +
    `<h4 class="gl-modal-sources-title">출처</h4>` +
    `<ul class="gl-modal-sources-list"></ul>` +
    `</div>` +
    `<div class="gl-modal-related" hidden>` +
    `<h4 class="gl-modal-related-title">관련 용어</h4>` +
    `<ul class="gl-modal-related-list"></ul>` +
    `</div>` +
    `</div>` +
    `</div>` +
    `</div>`

  const searchHtml =
    `<div class="gl-search">` +
    `<label class="sr-only" for="gl-search-input">용어 검색</label>` +
    `<input id="gl-search-input" class="gl-search-input" type="search" placeholder="용어, 약어, 설명으로 검색" autocomplete="off" spellcheck="false">` +
    `</div>`

  return (
    `<div class="gl-controls">` +
    searchHtml +
    `<div class="gl-legend" role="radiogroup" aria-label="카테고리 필터">${filterHtml}</div>` +
    `</div>` +
    `<p class="gl-result-count" aria-live="polite">${sorted.length}개 용어</p>` +
    `<div class="gl-grid">${cardsHtml}</div>` +
    `<p class="gl-empty" hidden>일치하는 용어가 없어요. 다른 검색어나 카테고리를 시도해 보세요.</p>` +
    modalHtml +
    `<script type="application/json" class="gl-detail-data">${escJsonForScript(JSON.stringify(detailById))}</script>`
  )
}
