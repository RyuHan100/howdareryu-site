// climate histography 의 핵심 — 월 단위 가로 타임라인을 순수 함수로 HTML 문자열로 만든다
// (D3 없음: 플러그인 dist 에 npm 의존성을 못 쓰는 저장소라, 선형 시간축 하나에 D3 를 끌어올
// 이유가 없다 — 날짜/줌 계산은 timeline-scale.js 순수 함수 몇 개로 충분하다).
// x 축: 이벤트의 날짜를 timeline-scale.js 의 tlEventT() 로 소수 월 인덱스(t)로 바꿔 선형
// 배치한다. 같은 달 이벤트는 같은 정수 월에 속하고, 여러 개면 축 위/아래로 번갈아 쌓는다
// (histography.io 참고 — 한쪽으로만 쌓으면 붐비는 달에서 세로로 너무 길어진다).
// 실제 px 값은 CSS 변수(--month-width/--stack-gap, timeline.css)가 정하므로 이 파일은 각
// 요소에 "timelineStart 로부터 몇 달 떨어졌는지"(소수 가능)만 --x 커스텀 프로퍼티로 심어
// 둔다 — 줌으로 --month-width 가 바뀌어도(클라이언트, timeline-view.js) 이 파일이 다시
// 계산할 필요가 없다. tlDateToT/tlEventT/tlTicks 등은 이 파일 앞에 timeline-scale.js 가
// 이어붙여진다는 전제로 호출한다(build.mjs 참고, 서버·클라이언트가 같은 함수를 쓴다).

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
    .map((ev) => {
      const t = tlEventT(ev)
      return t === null ? null : { ...ev, t, monthIdx: Math.floor(t) }
    })
    .filter((ev) => ev !== null)
    .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))

  if (dated.length === 0) return null

  const minIdx = dated[0].monthIdx
  const maxIdx = dated[dated.length - 1].monthIdx
  // 줌(timeline-view.js)이 "오늘"까지 항상 다룰 수 있도록, 빌드 시점의 달도 범위에 포함한다
  // — 하드코딩된 연도가 아니라 빌드가 도는 실제 시각 기준이라 다시 빌드할 때마다 저절로
  // 따라온다(마지막 이벤트가 미래에 추가돼도, 오래 안 만들어도 둘 다 자연스럽게 커버된다).
  const now = new Date()
  const buildMonthIdx = now.getFullYear() * 12 + now.getMonth()
  const timelineStart = minIdx - PAD_MONTHS
  const timelineEnd = Math.max(maxIdx, buildMonthIdx) + PAD_MONTHS
  const totalMonths = timelineEnd - timelineStart

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
      positioned.push({ ...ev, x: ev.t - timelineStart, depth, dir: "up" })
    })
    downSide.forEach((ev, i) => {
      const depth = i + 1
      stackDown = Math.max(stackDown, depth)
      positioned.push({ ...ev, x: ev.t - timelineStart, depth, dir: "down" })
    })
  }

  // 연도 눈금: 요구사항대로 빠짐없이 매년 표시한다(줌 없이 JS 가 꺼져 있을 때의 화면 그대로).
  // 줌이 켜지면 timeline-view.js 가 이 자리를 숨기고 화면 밀도에 맞는 .tl-ticks 로 대신한다.
  const minYear = Math.floor(minIdx / 12)
  const maxYear = Math.max(Math.floor(maxIdx / 12), Math.floor(buildMonthIdx / 12))

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
    const x = y * 12 - timelineStart
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

  // 줌 컨트롤(+/−/Reset). timeline-view.js 가 이 버튼들과 .tl-zoom-level 을 찾아 연결한다 —
  // JS 가 없으면 그냥 아무 동작 없는 버튼일 뿐이고(progressive enhancement), 타임라인
  // 자체(연도 눈금 포함)는 지금처럼 그대로 보인다.
  const toolbarHtml =
    `<div class="tl-toolbar" role="group" aria-label="타임라인 확대·축소">` +
    `<button type="button" class="tl-zoom-btn tl-zoom-out" aria-label="타임라인 축소">−</button>` +
    `<span class="tl-zoom-level" aria-live="polite">연도</span>` +
    `<button type="button" class="tl-zoom-btn tl-zoom-in" aria-label="타임라인 확대">+</button>` +
    `<button type="button" class="tl-zoom-btn tl-zoom-reset" aria-label="처음 화면으로 되돌리기">Reset</button>` +
    `</div>`

  return (
    `<div class="tl-controls">` +
    `<div class="tl-legend" role="radiogroup" aria-label="카테고리 필터">${legendHtml}</div>` +
    toolbarHtml +
    `</div>` +
    `<div class="tl-scroll">` +
    `<div class="tl-track" data-start="${timelineStart}" data-end="${timelineEnd}" ` +
    `style="--total-months:${totalMonths};--stack-up:${stackUp};--stack-down:${stackDown}">` +
    `<div class="tl-axis" aria-hidden="true"></div>` +
    yearsHtml.join("") +
    eventsHtml +
    `<div class="tl-ticks"></div>` +
    `<div class="tl-now-layer"></div>` +
    `</div>` +
    `</div>` +
    modalHtml +
    `<script type="application/json" class="tl-detail-data">${escJsonForScript(JSON.stringify(detailById))}</script>`
  )
}
