// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
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

// 서버(빌드) 쪽 컴포넌트. climate-timeline/gallery-page 와 같은 방식으로 preact vnode 를 직접
// 만든다(Quartz 는 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). h 는
// 다른 플러그인에도 각자 있는데, 서로 다른 dist 번들이라 공유가 안 돼 여기 다시 만든다.
// Component.css/afterDOMLoaded 의 자리표시자는 build.mjs 가 채운다. quartz.config.yaml 에서
// layout.condition: "glossary" 로 등록해 content/glossary.md 에서만 나오게 한다
// (quartz.ts 의 registerCondition). 용어 데이터는 콘텐츠(마크다운 파이프라인 대상)가 아니라 이
// 플러그인 전용 빌드 데이터라 content/ 가 아니라 플러그인 옆(data/)에 둔다 — climate-timeline 과
// 같은 이유(content/glossary/ 폴더를 만들면 오솔길에 드롭다운 폴더로 보인다).
import { readFileSync } from "node:fs"
import { join } from "node:path"

const GLOSSARY_DATA_PATH = join(process.cwd(), "plugins/climate-glossary/data/climate-glossary.json")

function readGlossaryData() {
  try {
    return JSON.parse(readFileSync(GLOSSARY_DATA_PATH, "utf-8"))
  } catch {
    return null
  }
}

let vnodeId = 0
function h(type, props) {
  return {
    type,
    props,
    key: undefined,
    ref: undefined,
    __k: null,
    __: null,
    __b: 0,
    __e: null,
    __c: null,
    constructor: undefined,
    __v: --vnodeId,
    __i: -1,
    __u: 0,
  }
}

export const ClimateGlossary = () => {
  const Component = ({ displayClass }) => {
    const data = readGlossaryData()
    const terms = data?.terms ?? []
    const categories = data?.categories ?? []
    const html = terms.length > 0 ? renderGlossary(terms, categories) : null

    if (!html) {
      return h("section", {
        class: [displayClass, "climate-glossary"].filter(Boolean).join(" "),
        children: [h("p", { class: "climate-glossary-note", children: "아직 채운 용어가 없어요." })],
      })
    }

    return h("section", {
      class: [displayClass, "climate-glossary"].filter(Boolean).join(" "),
      children: [
        h("p", {
          class: "sr-only",
          children:
            "기후·에너지·탄소시장 관련 용어와 약어를 찾아보는 용어집입니다. 검색창에 낱말을 입력하거나 카테고리 버튼으로 좁혀 볼 수 있습니다. 카드를 클릭하면 자세한 설명과 출처, 관련 용어가 담긴 패널이 열립니다.",
        }),
        h("div", { dangerouslySetInnerHTML: { __html: html } }),
      ],
    })
  }

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). 요구사항: 색상만으로 카테고리를\n   구분하지 않는다 — 필터 버튼과 카드 배지에 항상 이름 텍스트가 같이 나온다. */\n.climate-glossary {\n  margin-top: 1.5rem;\n}\n\n.climate-glossary-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n/* ---------- 카테고리 색(필터 버튼 + 카드 배지가 같은 규칙을 쓴다) ---------- */\n.gl-filter[data-category=\"international\"],\n.gl-card-badge[data-category=\"international\"] {\n  --cat-color: var(--color-blue, var(--secondary));\n}\n.gl-filter[data-category=\"carbon-market\"],\n.gl-card-badge[data-category=\"carbon-market\"] {\n  --cat-color: var(--color-orange, var(--darkgray));\n}\n.gl-filter[data-category=\"energy\"],\n.gl-card-badge[data-category=\"energy\"] {\n  --cat-color: var(--color-green, var(--secondary));\n}\n.gl-filter[data-category=\"science\"],\n.gl-card-badge[data-category=\"science\"] {\n  --cat-color: var(--color-cyan, var(--tertiary));\n}\n.gl-filter[data-category=\"policy-kr\"],\n.gl-card-badge[data-category=\"policy-kr\"] {\n  --cat-color: var(--color-yellow, var(--tertiary));\n}\n.gl-filter[data-category=\"global-initiatives\"],\n.gl-card-badge[data-category=\"global-initiatives\"] {\n  --cat-color: var(--color-purple, #a882ff);\n}\n\n/* ---------- 검색 + 필터 ---------- */\n.gl-controls {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 0.6rem 1rem;\n  margin-bottom: 0.6rem;\n}\n.gl-search {\n  flex: 1 1 220px;\n  min-width: 180px;\n}\n.gl-search-input {\n  width: 100%;\n  box-sizing: border-box;\n  font: inherit;\n  font-size: 0.95rem;\n  color: var(--dark);\n  background: var(--light);\n  border: 1px solid color-mix(in srgb, var(--gray) 45%, var(--light));\n  border-radius: 999px;\n  padding: 0.5rem 1rem;\n}\n.gl-search-input::placeholder {\n  color: var(--gray);\n}\n.gl-search-input:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n\n.gl-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.4rem;\n}\n.gl-filter {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.35rem;\n  font: inherit;\n  font-size: 0.85rem;\n  color: var(--dark);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border: 1px solid color-mix(in srgb, var(--gray) 40%, var(--light));\n  border-radius: 999px;\n  padding: 0.25rem 0.7rem;\n  cursor: pointer;\n}\n.gl-filter:hover {\n  border-color: var(--gray);\n}\n.gl-filter:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.gl-filter[aria-checked=\"true\"] {\n  color: var(--light);\n  background: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n  border-color: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n}\n.gl-legend-swatch {\n  width: 0.6rem;\n  height: 0.6rem;\n  border-radius: 999px;\n  background: var(--cat-color, var(--gray));\n  flex: none;\n}\n.gl-legend-all {\n  background: var(--gray);\n}\n.gl-filter[aria-checked=\"true\"] .gl-legend-swatch {\n  background: var(--light);\n}\n\n.gl-result-count {\n  margin: 0 0 0.75rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n\n/* ---------- 카드 그리드 ----------\n   auto-fill/minmax 라 모바일(390px 안팎)에서는 저절로 한 줄에 카드 하나만 들어간다 —\n   좁은 화면 전용 미디어쿼리 없이도 반응형이다. */\n.gl-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));\n  gap: 0.9rem;\n}\n.gl-card {\n  display: flex;\n  flex-direction: column;\n  gap: 0.4rem;\n  text-align: left;\n  padding: 0.9rem 1rem;\n  border-radius: 0.9rem;\n  border: 1px solid color-mix(in srgb, var(--gray) 35%, var(--light));\n  background: color-mix(in srgb, var(--gray) 8%, var(--light));\n  color: inherit;\n  font: inherit;\n  cursor: pointer;\n}\n.gl-card:hover {\n  border-color: var(--gray);\n}\n.gl-card:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.gl-card[hidden] {\n  display: none;\n}\n.gl-card-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.5rem;\n}\n.gl-card-term {\n  font-weight: 700;\n  font-size: 1.05rem;\n}\n.gl-card-badge {\n  flex: none;\n  font-size: 0.68rem;\n  color: var(--light);\n  background: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n  border-radius: 999px;\n  padding: 0.15rem 0.55rem;\n  white-space: nowrap;\n}\n.gl-card-sub {\n  font-size: 0.8rem;\n  color: var(--gray);\n}\n.gl-card-preview {\n  font-size: 0.88rem;\n  color: var(--dark);\n  line-height: 1.45;\n  display: -webkit-box;\n  -webkit-line-clamp: 3;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.gl-empty {\n  margin-top: 1rem;\n  color: var(--gray);\n  font-style: italic;\n}\n.gl-empty[hidden] {\n  display: none;\n}\n\n/* ---------- 상세 패널 ----------\n   climate-timeline 의 .tl-modal 과 같은 구조/트랜지션(데스크톱은 오른쪽 드로어, 모바일은\n   아래에서 올라오는 바텀시트). prefers-reduced-motion 이면 트랜지션 없이 즉시 나타나고\n   사라진다. */\n.gl-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  pointer-events: none;\n}\n.gl-modal[hidden] {\n  display: none;\n}\n.gl-modal.is-open {\n  pointer-events: auto;\n}\n.gl-modal-backdrop {\n  position: absolute;\n  inset: 0;\n  background: color-mix(in srgb, var(--dark) 88%, transparent);\n  opacity: 0;\n}\n.gl-modal.is-open .gl-modal-backdrop {\n  opacity: 1;\n}\n.gl-modal-panel {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  width: min(420px, 92vw);\n  display: flex;\n  flex-direction: column;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  background: var(--light);\n  border-left: 1px solid color-mix(in srgb, var(--gray) 45%, var(--light));\n  box-shadow: -12px 0 48px color-mix(in srgb, var(--dark) 45%, transparent);\n  transform: translateX(100%);\n}\n.gl-modal.is-open .gl-modal-panel {\n  transform: translateX(0);\n}\n@media (max-width: 800px) {\n  .gl-modal-panel {\n    top: auto;\n    right: 0;\n    left: 0;\n    bottom: 0;\n    width: auto;\n    max-height: min(82vh, 720px);\n    max-height: min(82dvh, 720px);\n    border-left: none;\n    border-top: 1px solid color-mix(in srgb, var(--gray) 45%, var(--light));\n    border-radius: 1rem 1rem 0 0;\n    box-shadow: 0 -12px 48px color-mix(in srgb, var(--dark) 45%, transparent);\n    transform: translateY(100%);\n  }\n  .gl-modal.is-open .gl-modal-panel {\n    transform: translateY(0);\n  }\n}\n@media (prefers-reduced-motion: no-preference) {\n  .gl-modal-backdrop {\n    transition: opacity 0.22s ease;\n  }\n  .gl-modal-panel {\n    transition: transform 0.28s ease;\n  }\n}\n.gl-modal-body {\n  padding: 3rem 1.5rem 1.5rem;\n  flex: 1 1 auto;\n}\n.gl-modal-meta {\n  margin: 0 0 0.35rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.gl-modal-title {\n  margin: 0 0 0.35rem;\n  font-size: 1.4rem;\n  line-height: 1.3;\n}\n.gl-modal-title:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 4px;\n}\n.gl-modal-sub {\n  margin: 0 0 0.75rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.gl-modal-desc {\n  margin: 0 0 1rem;\n  line-height: 1.6;\n  color: var(--dark);\n}\n/* ---------- 출처 ---------- */\n.gl-modal-sources {\n  margin: 0 0 1rem;\n}\n.gl-modal-sources-title {\n  margin: 0 0 0.4rem;\n  font-size: 0.72rem;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--gray);\n}\n.gl-modal-sources-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 0.35rem;\n}\n.gl-source {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 0.4rem;\n  font-size: 0.85rem;\n}\n.gl-source-link {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 0.3rem;\n  color: var(--secondary);\n}\n.gl-source-link:hover {\n  text-decoration: underline;\n}\n.gl-source-icon {\n  font-size: 0.8em;\n}\n.gl-source-type {\n  font-size: 0.7rem;\n  color: var(--gray);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border-radius: 999px;\n  padding: 0.1rem 0.5rem;\n}\n.gl-source-meta {\n  font-size: 0.75rem;\n  color: var(--gray);\n}\n/* ---------- 관련 용어 ---------- */\n.gl-modal-related-title {\n  margin: 0 0 0.4rem;\n  font-size: 0.72rem;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--gray);\n}\n.gl-modal-related-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.4rem;\n}\n.gl-related-chip {\n  font: inherit;\n  font-size: 0.8rem;\n  color: var(--dark);\n  background: color-mix(in srgb, var(--secondary) 12%, var(--light));\n  border: 1px solid color-mix(in srgb, var(--secondary) 35%, var(--light));\n  border-radius: 999px;\n  padding: 0.25rem 0.7rem;\n  cursor: pointer;\n}\n.gl-related-chip:hover {\n  border-color: var(--secondary);\n}\n.gl-related-chip:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.gl-modal-close {\n  position: absolute;\n  top: 0.75rem;\n  right: 0.75rem;\n  width: 2.2rem;\n  height: 2.2rem;\n  border-radius: 999px;\n  border: none;\n  font: inherit;\n  font-size: 1.1rem;\n  cursor: pointer;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 55%, transparent);\n  z-index: 1;\n}\n.gl-modal-close:hover {\n  background: color-mix(in srgb, var(--dark) 75%, transparent);\n}\n.gl-modal-close:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n"
  Component.afterDOMLoaded = "// 검색 + 카테고리 필터: 서버가 이미 모든 카드를 그린 정적 HTML이므로, 필터/검색은 보이기/숨기기만\n// 토글한다 — JS 없이도 전체 용어 목록이 그대로 보인다(progressive enhancement). 카테고리는\n// climate-timeline 의 .tl-filter 와 같은 라디오 그룹(한 번에 하나, \"전체\"가 기본), 검색은 그\n// 위에 AND 조건으로 더 좁힌다.\n//\n// 상세 패널: climate-timeline 의 .tl-modal 과 같은 패턴(포커스 이동·Escape·배경 클릭으로 닫기,\n// position:fixed 드로어/바텀시트). 관련 용어 칩을 누르면 같은 패널이 그 용어 내용으로 다시\n// 그려진다(별도 \"이전/다음\"이 아니라 명시적 관계로만 이동 — 타임라인의 시간순 이웃과 달리 용어\n// 사이의 관계는 순서가 없다).\n;(function () {\n  function initGlossary(section) {\n    if (!section || section.dataset.glInit === \"true\") return\n    section.dataset.glInit = \"true\"\n\n    var filters = Array.prototype.slice.call(section.querySelectorAll(\".gl-filter\"))\n    var cards = Array.prototype.slice.call(section.querySelectorAll(\".gl-card\"))\n    var searchInput = section.querySelector(\".gl-search-input\")\n    var resultCount = section.querySelector(\".gl-result-count\")\n    var emptyState = section.querySelector(\".gl-empty\")\n    var modal = section.querySelector(\".gl-modal\")\n    var dataEl = section.querySelector(\".gl-detail-data\")\n    if (cards.length === 0) return\n\n    var selectedCategory = \"all\"\n    var query = \"\"\n\n    // ---------- 검색 + 카테고리 필터 ----------\n    function applyVisibility() {\n      var visibleCount = 0\n      cards.forEach(function (card) {\n        var matchesCategory = selectedCategory === \"all\" || card.dataset.category === selectedCategory\n        var matchesQuery = query === \"\" || card.dataset.search.indexOf(query) !== -1\n        var visible = matchesCategory && matchesQuery\n        card.hidden = !visible\n        if (visible) visibleCount++\n      })\n      if (resultCount) {\n        resultCount.textContent = visibleCount === 0 ? \"검색 결과 없음\" : visibleCount + \"개 용어\"\n      }\n      if (emptyState) emptyState.hidden = visibleCount !== 0\n    }\n\n    filters.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        selectedCategory = btn.dataset.filter\n        filters.forEach(function (b) {\n          b.setAttribute(\"aria-checked\", b === btn ? \"true\" : \"false\")\n        })\n        applyVisibility()\n      })\n    })\n\n    if (searchInput) {\n      searchInput.addEventListener(\"input\", function () {\n        query = searchInput.value.trim().toLowerCase()\n        applyVisibility()\n      })\n      // 검색어가 있을 때 Escape 를 누르면 검색만 지운다(모달이 닫혀 있을 때의 편의 기능 —\n      // 모달이 열려 있을 때의 Escape 는 아래 onKeydown 이 모달 닫기를 담당한다).\n      searchInput.addEventListener(\"keydown\", function (e) {\n        if (e.key === \"Escape\" && searchInput.value) {\n          e.stopPropagation()\n          searchInput.value = \"\"\n          query = \"\"\n          applyVisibility()\n        }\n      })\n    }\n\n    applyVisibility()\n\n    // ---------- 상세 패널 ----------\n    if (!modal || !dataEl) return\n    var detailById = {}\n    try {\n      detailById = JSON.parse(dataEl.textContent || \"{}\")\n    } catch {\n      detailById = {}\n    }\n\n    var title = modal.querySelector(\".gl-modal-title\")\n    var meta = modal.querySelector(\".gl-modal-meta\")\n    var sub = modal.querySelector(\".gl-modal-sub\")\n    var desc = modal.querySelector(\".gl-modal-desc\")\n    var sourcesWrap = modal.querySelector(\".gl-modal-sources\")\n    var sourcesList = modal.querySelector(\".gl-modal-sources-list\")\n    var relatedWrap = modal.querySelector(\".gl-modal-related\")\n    var relatedList = modal.querySelector(\".gl-modal-related-list\")\n    var status = modal.querySelector(\".gl-modal-status\")\n    var panel = modal.querySelector(\".gl-modal-panel\")\n    var closeEls = Array.prototype.slice.call(modal.querySelectorAll(\"[data-gl-close]\"))\n    var lastFocused = null\n    // 닫기(애니메이션)를 시작할 때마다 1씩 올린다 — climate-timeline 의 closeToken 과 같은 이유\n    // (닫히는 도중 다시 열리면 이전 닫기의 뒤늦은 마무리가 새로 연 패널을 닫지 못하게 한다).\n    var closeToken = 0\n    var currentId = null\n\n    function fillOrHide(el, text) {\n      if (text) {\n        el.textContent = text\n        el.hidden = false\n      } else {\n        el.textContent = \"\"\n        el.hidden = true\n      }\n    }\n\n    function renderSources(sources) {\n      sourcesList.innerHTML = \"\"\n      sourcesWrap.hidden = sources.length === 0\n      sources.forEach(function (s) {\n        var li = document.createElement(\"li\")\n        li.className = \"gl-source\"\n\n        var a = document.createElement(\"a\")\n        a.className = \"gl-source-link\"\n        a.href = s.url\n        a.target = \"_blank\"\n        a.rel = \"noopener noreferrer\"\n\n        var icon = document.createElement(\"span\")\n        icon.className = \"gl-source-icon\"\n        icon.setAttribute(\"aria-hidden\", \"true\")\n        icon.textContent = \"↗\"\n\n        var name = document.createElement(\"span\")\n        name.className = \"gl-source-name\"\n        name.textContent = s.title\n\n        a.appendChild(icon)\n        a.appendChild(name)\n        li.appendChild(a)\n\n        if (s.typeLabel) {\n          var badge = document.createElement(\"span\")\n          badge.className = \"gl-source-type\"\n          badge.textContent = s.typeLabel\n          li.appendChild(badge)\n        }\n\n        var metaParts = []\n        if (s.publisher) metaParts.push(s.publisher)\n        if (s.date) metaParts.push(s.date)\n        if (metaParts.length > 0) {\n          var metaEl = document.createElement(\"span\")\n          metaEl.className = \"gl-source-meta\"\n          metaEl.textContent = metaParts.join(\" · \")\n          li.appendChild(metaEl)\n        }\n\n        sourcesList.appendChild(li)\n      })\n    }\n\n    function renderRelated(related) {\n      relatedList.innerHTML = \"\"\n      relatedWrap.hidden = related.length === 0\n      related.forEach(function (r) {\n        var li = document.createElement(\"li\")\n        var btn = document.createElement(\"button\")\n        btn.type = \"button\"\n        btn.className = \"gl-related-chip\"\n        btn.textContent = r.term\n        btn.addEventListener(\"click\", function () {\n          navigateTo(r.id)\n        })\n        li.appendChild(btn)\n        relatedList.appendChild(li)\n      })\n    }\n\n    function render(d) {\n      meta.textContent = d.category\n      title.textContent = d.term\n      fillOrHide(sub, d.sub)\n      desc.textContent = d.definition || \"\"\n      renderSources(d.sources || [])\n      renderRelated(d.related || [])\n    }\n\n    // triggerEl: 카드를 연 실제 버튼(있으면). Chrome은 마우스 클릭만으로도 버튼에 포커스가\n    // 가지만 Safari·Firefox 는 기본적으로 마우스 클릭으로 버튼에 포커스를 주지 않는다 — 그\n    // 브라우저들에서 document.activeElement 에만 의존하면 lastFocused 가 body 가 돼서, 패널을\n    // 닫을 때 포커스가 어디로도 안 돌아간다. 그래서 클릭 핸들러가 실제 버튼 참조를 넘겨준다\n    // (키보드로 열었을 때는 활성 요소 자체가 이미 그 버튼이라 인자를 안 줘도 정확하다).\n    function open(id, triggerEl) {\n      var d = detailById[id]\n      if (!d) return\n      lastFocused = triggerEl || document.activeElement\n      currentId = id\n      render(d)\n\n      closeToken++\n      modal.hidden = false\n      // hidden 을 떼자마자 클래스를 붙이면 브라우저가 시작 상태를 못 그리고 바로 최종 상태로\n      // 뛰어버려 슬라이드 트랜지션이 재생되지 않는다 — 한 프레임 쉬고 붙인다.\n      requestAnimationFrame(function () {\n        modal.classList.add(\"is-open\")\n      })\n      var closeBtn = modal.querySelector(\".gl-modal-close\")\n      if (closeBtn) closeBtn.focus()\n      status.textContent = d.term\n      document.addEventListener(\"keydown\", onKeydown)\n    }\n\n    // 관련 용어 칩으로 다른 용어로 이동: 이미 열려 있는 같은 패널의 내용만 다시 그린다.\n    // open() 을 다시 부르면 lastFocused 가 (페이지의 카드가 아니라) 방금 누른 칩으로\n    // 덮어써져서, 나중에 패널을 닫을 때 포커스가 이미 지워진 칩으로 돌아가려다 사라지는\n    // 문제가 생긴다(패널을 처음 연 카드로 포커스가 돌아가야 한다) — 그래서 lastFocused 는\n    // 건드리지 않고, climate-timeline 의 이전/다음 이동처럼 제목으로 포커스를 옮겨 스크린\n    // 리더가 바뀐 내용을 바로 읽게 한다.\n    function navigateTo(id) {\n      var d = detailById[id]\n      if (!d || id === currentId) return\n      currentId = id\n      render(d)\n      title.focus()\n      status.textContent = d.term\n    }\n\n    function close() {\n      modal.classList.remove(\"is-open\")\n      document.removeEventListener(\"keydown\", onKeydown)\n      var reduced =\n        typeof window.matchMedia === \"function\" &&\n        window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches\n      var token = ++closeToken\n      function finish() {\n        if (token !== closeToken) return\n        closeToken++\n        modal.hidden = true\n        if (lastFocused && typeof lastFocused.focus === \"function\") lastFocused.focus()\n      }\n      if (reduced) {\n        finish()\n        return\n      }\n      setTimeout(finish, 250)\n      if (panel) {\n        panel.addEventListener(\"transitionend\", function onEnd(e) {\n          if (e.target !== panel) return\n          panel.removeEventListener(\"transitionend\", onEnd)\n          finish()\n        })\n      }\n    }\n\n    // aria-modal 패널: Tab 이 패널 밖(뒤의 카드 그리드)으로 빠져나가지 않게 처음/끝에서 돈다.\n    function trapTab(e) {\n      var focusables = Array.prototype.filter.call(panel.querySelectorAll(\"a[href], button\"), function (el) {\n        return !el.hidden && !el.disabled\n      })\n      if (focusables.length === 0) return\n      var first = focusables[0]\n      var last = focusables[focusables.length - 1]\n      var active = document.activeElement\n      if (e.shiftKey && (active === first || !panel.contains(active))) {\n        e.preventDefault()\n        last.focus()\n      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {\n        e.preventDefault()\n        first.focus()\n      }\n    }\n\n    function onKeydown(e) {\n      if (e.key === \"Escape\") close()\n      else if (e.key === \"Tab\") trapTab(e)\n    }\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        document.removeEventListener(\"keydown\", onKeydown)\n      })\n    }\n\n    cards.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        open(btn.dataset.id, btn)\n      })\n    })\n    closeEls.forEach(function (el) {\n      el.addEventListener(\"click\", close)\n    })\n  }\n\n  function init() {\n    var sections = document.querySelectorAll(\".climate-glossary\")\n    for (var i = 0; i < sections.length; i++) initGlossary(sections[i])\n  }\n\n  document.addEventListener(\"nav\", init)\n})()\n"
  return Component
}
