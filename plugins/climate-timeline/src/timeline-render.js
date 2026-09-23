// climate histography 의 핵심 — 월 단위 가로 타임라인을 순수 함수로 HTML 문자열로 만든다
// (D3 없음: 이 저장소는 플러그인 dist 에 npm 의존성을 못 쓰고, 줌 없는 정적 타임라인이라
// scaleTime/axis 계산도 한 화면(빌드 시점)에서 한 번만 하면 되므로 라이브러리가 필요 없다).
// x 축: 이벤트의 "YYYY-MM" 을 절대 월 인덱스(연*12+월)로 바꿔 선형 배치한다(월 단위 간격이
// 실제 시간 간격과 같다). 같은 달 이벤트는 같은 x, 여러 개면 축 위/아래로 번갈아 쌓는다
// (histography.io 참고 — 한쪽으로만 쌓으면 붐비는 달에서 세로로 너무 길어진다).
// 실제 px 값은 CSS 변수(--month-width/--stack-gap, timeline.css)가 정하므로 이 파일은 각
// 요소에 "몇 번째 달/축에서 몇 단 떨어졌는지"(정수)만 --x/--level 커스텀 프로퍼티로 심어
// 둔다 — PC/모바일 값이 달라져도(반응형) 여기서 다시 계산할 필요가 없다.

// 이름을 tlEsc 로 한 이유: 이 파일은 climate-timeline 뿐 아니라 garden-home 의 build.mjs 도
// 그대로 읽어다 자기 번들에 붙인다(홈에 타임라인 전체를 넣으려고, 2026-09-23). garden-svg.js
// 에 이미 있는 esc() 와 같은 이름이면 ES 모듈에서 "Identifier 'esc' has already been
// declared" SyntaxError 가 난다(둘 다 top-level function 이라 sloppy 스크립트와 달리 모듈
// 스코프에서는 재선언이 허용되지 않는다) — 짧은 이름 대신 접두사를 붙여 피한다.
function tlEsc(s) {
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

const PAD_MONTHS = 6 // 첫/마지막 이벤트가 축 끝에 바짝 붙지 않도록 좌우 여백(반 년)

/** "YYYY-MM" → 절대 월 인덱스(연*12+월-1). 잘못된 값이면 null. */
function monthIndex(yyyyMm) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(yyyyMm ?? ""))
  if (!m) return null
  return Number(m[1]) * 12 + (Number(m[2]) - 1)
}

function formatDateLabel(ev) {
  const src = ev.exactDate || ev.date
  const parts = src.split("-").map(Number)
  if (parts.length === 3) {
    const [y, mo, d] = parts
    return `${y}년 ${mo}월 ${d}일`
  }
  const [y, mo] = parts
  return `${y}년 ${mo}월`
}

/**
 * events: climate-timeline.json 의 events 배열(date 는 "YYYY-MM" 필수).
 * categories: [{key,label}, ...] (climate-timeline.json 의 categories 배열).
 * 반환: 타임라인 섹션 안에 그대로 넣을 HTML 문자열. events 가 비어 있으면 null.
 */
export function renderTimeline(events, categories) {
  const labelByKey = new Map(categories.map((c) => [c.key, c.label]))
  const dated = events
    .map((ev) => ({ ...ev, monthIdx: monthIndex(ev.date) }))
    .filter((ev) => ev.monthIdx !== null)
    .sort((a, b) => a.monthIdx - b.monthIdx || a.id.localeCompare(b.id))

  if (dated.length === 0) return null

  const minIdx = dated[0].monthIdx
  const maxIdx = dated[dated.length - 1].monthIdx
  const totalMonths = maxIdx - minIdx + PAD_MONTHS * 2

  // 같은 달 이벤트를 모아, 축을 기준으로 번갈아 위(-)/아래(+)로 단(level)을 매긴다.
  // 방향(위/아래)은 "같은 달 안에서" 가 아니라 전체 시간순 인덱스로 번갈아 정한다 — 대부분의
  // 달은 이벤트가 하나뿐이라(이번 시드 데이터가 그렇다), 달 안에서만 번갈아 매기면 전부
  // 짝수 번째(0)라 전부 위로만 몰린다. 전체 인덱스로 번갈아야 위/아래가 고르게 쓰인다.
  // 같은 달에 여러 이벤트가 있어도 전체 인덱스가 보통 이웃해 있어 서로 다른 방향으로
  // 갈라지고(자동으로 안 겹침), 셋 이상 몰리면 그때 같은 방향 안에서 단(depth)이 쌓인다.
  const byMonth = new Map()
  for (const ev of dated) {
    if (!byMonth.has(ev.monthIdx)) byMonth.set(ev.monthIdx, [])
    byMonth.get(ev.monthIdx).push(ev)
  }
  let stackUp = 1
  let stackDown = 1
  const positioned = []
  let globalIndex = 0
  for (const list of byMonth.values()) {
    const upSide = []
    const downSide = []
    for (const ev of list) {
      ;(globalIndex % 2 === 0 ? upSide : downSide).push(ev)
      globalIndex++
    }
    upSide.forEach((ev, i) => {
      const depth = i + 1
      stackUp = Math.max(stackUp, depth)
      positioned.push({ ...ev, x: ev.monthIdx - minIdx + PAD_MONTHS, depth, dir: "up" })
    })
    downSide.forEach((ev, i) => {
      const depth = i + 1
      stackDown = Math.max(stackDown, depth)
      positioned.push({ ...ev, x: ev.monthIdx - minIdx + PAD_MONTHS, depth, dir: "down" })
    })
  }

  // 연도 눈금: 요구사항대로 빠짐없이 매년 표시한다.
  const minYear = Math.floor(minIdx / 12)
  const maxYear = Math.floor(maxIdx / 12)

  const eventsHtml = positioned
    .map((ev) => {
      const catLabel = labelByKey.get(ev.category) || ev.category
      const dateLabel = formatDateLabel(ev)
      const ariaLabel = `${ev.title} · ${catLabel} · ${dateLabel}`
      return (
        `<button type="button" class="tl-event" data-id="${tlEsc(ev.id)}" data-category="${tlEsc(ev.category)}" ` +
        `data-dir="${ev.dir}" style="--x:${ev.x};--depth:${ev.depth}" aria-label="${tlEsc(ariaLabel)}" title="${tlEsc(ariaLabel)}">` +
        `<span class="tl-stem" aria-hidden="true"></span>` +
        `<span class="tl-dot" aria-hidden="true"></span>` +
        `</button>`
      )
    })
    .join("")

  const yearsHtml = []
  for (let y = minYear; y <= maxYear; y++) {
    const x = y * 12 - minIdx + PAD_MONTHS
    yearsHtml.push(
      `<div class="tl-year" style="--x:${x}">` +
        `<span class="tl-year-tick" aria-hidden="true"></span>` +
        `<span class="tl-year-label">${y}</span>` +
        `</div>`,
    )
  }

  const legendHtml =
    `<button type="button" class="tl-filter" data-filter="all" role="radio" aria-checked="true">` +
    `<span class="tl-legend-swatch tl-legend-all" aria-hidden="true"></span>전체</button>` +
    categories
      .map(
        (c) =>
          `<button type="button" class="tl-filter" data-filter="${tlEsc(c.key)}" data-category="${tlEsc(c.key)}" role="radio" aria-checked="false">` +
          `<span class="tl-legend-swatch" aria-hidden="true"></span>${tlEsc(c.label)}</button>`,
      )
      .join("")

  // 점 클릭 시 여는 상세 카드용 데이터. 고정(position:fixed) 모달이 읽어서 채우므로
  // 타임라인의 가로 스크롤 영역(overflow) 과 무관하게 항상 화면 안에 꽉 차게 뜬다.
  const detailById = {}
  for (const ev of dated) {
    detailById[ev.id] = {
      title: ev.title,
      category: labelByKey.get(ev.category) || ev.category,
      date: formatDateLabel(ev),
      description: ev.description || "",
      image: ev.image || null,
      imageAlt: ev.imageAlt || ev.title,
      links: Array.isArray(ev.links) ? ev.links : [],
    }
  }

  const modalHtml =
    `<div class="tl-modal" hidden role="dialog" aria-modal="true" aria-labelledby="tl-modal-title">` +
    `<div class="tl-modal-backdrop" data-tl-close="true"></div>` +
    `<div class="tl-modal-panel">` +
    `<button type="button" class="tl-modal-close" aria-label="닫기" data-tl-close="true">✕</button>` +
    `<img class="tl-modal-image" alt="" hidden>` +
    `<div class="tl-modal-body">` +
    `<p class="tl-modal-meta"></p>` +
    `<h3 class="tl-modal-title" id="tl-modal-title"></h3>` +
    `<p class="tl-modal-desc"></p>` +
    `<ul class="tl-modal-links"></ul>` +
    `</div>` +
    `</div>` +
    `</div>`

  return (
    `<div class="tl-legend" role="radiogroup" aria-label="카테고리 필터">${legendHtml}</div>` +
    `<div class="tl-scroll">` +
    `<div class="tl-track" style="--total-months:${totalMonths};--stack-up:${stackUp};--stack-down:${stackDown}">` +
    `<div class="tl-axis" aria-hidden="true"></div>` +
    yearsHtml.join("") +
    eventsHtml +
    `</div>` +
    `</div>` +
    modalHtml +
    `<script type="application/json" class="tl-detail-data">${escJsonForScript(JSON.stringify(detailById))}</script>`
  )
}
