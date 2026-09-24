// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
// 날짜 <-> 시간값(t, 소수 월 인덱스) <-> px 변환. timeline-render.js(서버)와 timeline-view.js
// (클라이언트, build.mjs 가 timeline-interactive.js 의 IIFE 안에 이어붙인다 — 그 파일의
// "__TL_SCALE_AND_VIEW__" 표시 참고)가 이 파일을 글자 그대로 공유한다. 위치 계산이 서버와
// 클라이언트에서 갈라지면 줌했을 때 이벤트가 실제 날짜와 다른 자리에 찍히는 문제가 생기므로,
// 이 파일 하나만 고치면 둘 다 같이 바뀌게 한다.
//
// IIFE 로 감싸지 않는다: 서버에서는 이 파일이 ES 모듈 최상위에 오므로 자기 모듈 스코프라
// 안전하고, 클라이언트에서는 timeline-interactive.js 자신의 IIFE 안에 스플라이스되어 들어가므로
// 거기서 스코프가 보장된다(다른 플러그인과 문자열로 이어붙는 garden-home 번들에서도 마찬가지).
//
// t 는 정수부가 절대 월 인덱스(연*12+월-1), 소수부가 그 달 안에서의 위치 비율이다. 날짜만
// 아는 이벤트("YYYY-MM")는 그 달의 가운데(+0.5)에 둔다 — 월 단위까지 확대했을 때 달의 왼쪽
// 끝에 쏠려 보이지 않게 하려는 것이다(같은 달 이벤트를 위/아래로 번갈아 쌓는 규칙은 정수 월
// 기준이라 이 소수부와 무관하게 그대로 동작한다).

/**
 * "YYYY-MM" 또는 "YYYY-MM-DD" → 소수 월 인덱스 t. 형식이 안 맞으면 null. 월/일은 1~2자리
 * 둘 다 받는다(formatDateLabel 과 같은 관용도 — 실제 데이터에 "2025-1-10" 처럼 0 없이 적힌
 * exactDate 가 있어서, 2자리로 강제하면 그 이벤트 전체가 조용히 사라진다).
 */
function tlDateToT(dateStr) {
  var m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(String(dateStr == null ? "" : dateStr))
  if (!m) return null
  var year = Number(m[1])
  var month = Number(m[2])
  var day = m[3] ? Number(m[3]) : null
  var monthIdx = year * 12 + (month - 1)
  if (day === null) return monthIdx + 0.5
  var daysInMonth = new Date(year, month, 0).getDate()
  return monthIdx + (day - 1) / daysInMonth
}

/** 이벤트의 exactDate 가 있으면 그걸, 없으면 date 를 써서 t 를 구한다. */
function tlEventT(ev) {
  return tlDateToT(ev.exactDate || ev.date)
}

/** 소수 월 인덱스 t → {year, month}(1~12). */
function tlTToYearMonth(t) {
  var monthIdx = Math.floor(t)
  var year = Math.floor(monthIdx / 12)
  var month = monthIdx - year * 12 + 1
  return { year: year, month: month }
}

/** t(월 인덱스) → 트랙 기준 px. view = {timelineStart, pxPerMonth}. (dateToPosition) */
function tlTToPx(t, view) {
  return (t - view.timelineStart) * view.pxPerMonth
}

/** 트랙 기준 px → t(월 인덱스). (positionToDate) */
function tlPxToT(px, view) {
  return view.timelineStart + px / view.pxPerMonth
}

// 눈금 간격 후보(월 단위), 오름차순. tlPickTickStep 이 화면 밀도에 맞는 하나를 고른다.
var TL_TICK_STEPS = [1, 3, 6, 12, 24, 60, 120, 240, 600, 1200]

/** 라벨 하나당 minLabelPx 이상 간격이 나오는 가장 촘촘한(=작은) 단계를 고른다. */
function tlPickTickStep(pxPerMonth, minLabelPx) {
  for (var i = 0; i < TL_TICK_STEPS.length; i++) {
    var step = TL_TICK_STEPS[i]
    if (step * pxPerMonth >= minLabelPx) return step
  }
  return TL_TICK_STEPS[TL_TICK_STEPS.length - 1]
}

/**
 * [t0, t1] 구간에 그릴 눈금 목록을 만든다. step 이 12 이상이면 매 step 개월(연 단위 이상)마다
 * 연도를 라벨로 쓰고, step 이 12 미만이면 매달 눈금을 찍어 1월엔 연도를, 나머지 달엔 "N월"을
 * 라벨로 쓴다(달력 연도가 자연스럽게 보이도록 절대 월 인덱스를 step 으로 나눈 나머지 기준).
 */
function tlTicks(t0, t1, pxPerMonth, minLabelPx) {
  var step = tlPickTickStep(pxPerMonth, minLabelPx)
  var startIdx = Math.floor(t0 / step) * step
  var endIdx = Math.ceil(t1 / step) * step
  var ticks = []
  for (var m = startIdx; m <= endIdx; m += step) {
    var ym = tlTToYearMonth(m)
    var major = step >= 12 || ym.month === 1
    var label = step >= 12 || ym.month === 1 ? String(ym.year) : ym.month + "월"
    ticks.push({ t: m, label: label, major: major })
  }
  return ticks
}

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

// 출처 종류(source.type) 표시 이름. 자유 문자열이라 이 다섯 개 말고 다른 값이 와도 깨지지
// 않는다 — 매핑에 없으면 원래 문자열을 그대로 보여준다(라벨만 없을 뿐, 기능은 그대로).
const SOURCE_TYPE_LABELS = {
  primary: "1차 자료",
  scientific: "과학 논문",
  institutional: "기관",
  news: "뉴스",
  secondary: "2차 자료",
}

/**
 * 이벤트의 출처 목록을 통일된 모양으로 만든다. 새 스키마(`sources: [{title,url,type?,
 * publisher?,date?}]`)를 우선 읽고, 옛 스키마(`links: [{title,url}]`)도 그대로 인식한다 —
 * climate-timeline.json 의 기존 이벤트를 안 건드려도(또는 다른 도구가 여전히 links 로 써도)
 * 깨지지 않는다(하위 호환). type/publisher/date 처럼 데이터에 없는 필드는 null 로 둬서,
 * 클라이언트가 "없으면 그 칸 자체를 안 만든다" 는 규칙을 그대로 적용할 수 있게 한다 —
 * 실제로 없는 정보를 여기서 추측해 채우지 않는다.
 */
function normalizeSources(ev) {
  const raw = Array.isArray(ev.sources) ? ev.sources : Array.isArray(ev.links) ? ev.links : []
  return raw
    .filter((s) => s && s.url)
    .map((s) => ({
      title: s.title || s.url,
      url: s.url,
      type: s.type || null,
      typeLabel: s.type ? SOURCE_TYPE_LABELS[s.type] || s.type : null,
      publisher: s.publisher || null,
      date: s.date || null,
    }))
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

  // 점 클릭 시 여는 상세 카드용 데이터. 고정(position:fixed) 패널이 읽어서 채우므로
  // 타임라인의 가로 스크롤 영역(overflow) 과 무관하게 항상 화면 안에 꽉 차게 뜬다.
  // prevId/nextId: dated 가 이미 시간순으로 정렬돼 있으므로(위 sort 참고), 그 순서 그대로
  // 이전/다음 사건이 된다 — 따로 "관련 사건" 판정 로직을 만들지 않는다. 양 끝은 null.
  // location/tags: 지금 데이터에는 없는 필드지만, 나중에 이벤트에 추가되면(예: `location:
  // "파리"`, `tags: ["COP"]`) 별도 코드 수정 없이 그대로 표시되도록 있는 그대로 넘긴다 —
  // 없으면 null/빈 배열이라 클라이언트가 그 칸을 만들지 않는다(빈 영역을 안 남기는 요구사항).
  const detailById = {}
  dated.forEach((ev, i) => {
    detailById[ev.id] = {
      title: ev.title,
      category: labelByKey.get(ev.category) || ev.category,
      date: formatDateLabel(ev),
      description: ev.description || "",
      image: ev.image || null,
      imageAlt: ev.imageAlt || ev.title,
      sources: normalizeSources(ev),
      location: ev.location || null,
      tags: Array.isArray(ev.tags) ? ev.tags : [],
      prevId: i > 0 ? dated[i - 1].id : null,
      nextId: i < dated.length - 1 ? dated[i + 1].id : null,
    }
  })

  const modalHtml =
    `<div class="tl-modal" hidden role="dialog" aria-modal="true" aria-labelledby="tl-modal-title">` +
    `<div class="tl-modal-backdrop" data-tl-close="true"></div>` +
    `<div class="tl-modal-panel">` +
    `<button type="button" class="tl-modal-close" aria-label="닫기" data-tl-close="true">✕</button>` +
    `<p class="sr-only tl-modal-status" aria-live="polite"></p>` +
    `<img class="tl-modal-image" alt="" hidden>` +
    `<div class="tl-modal-body">` +
    `<p class="tl-modal-meta"></p>` +
    `<h3 class="tl-modal-title" id="tl-modal-title" tabindex="-1"></h3>` +
    `<p class="tl-modal-location" hidden></p>` +
    `<p class="tl-modal-desc"></p>` +
    `<div class="tl-modal-sources" hidden>` +
    `<h4 class="tl-modal-sources-title">Sources</h4>` +
    `<ul class="tl-modal-sources-list"></ul>` +
    `</div>` +
    `<ul class="tl-modal-tags" hidden></ul>` +
    `</div>` +
    `<div class="tl-modal-nav">` +
    `<button type="button" class="tl-modal-prev" data-tl-nav="prev">← 이전 사건</button>` +
    `<button type="button" class="tl-modal-next" data-tl-nav="next">다음 사건 →</button>` +
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

// 서버(빌드) 쪽 컴포넌트. gallery-page 와 같은 방식으로 preact vnode 를 직접 만든다(Quartz 는
// 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). h/esc 는 다른
// 플러그인에도 각자 있는데, 서로 다른 dist 번들이라 공유가 안 돼 여기 다시 만든다.
// Component.css/afterDOMLoaded 의 자리표시자는 build.mjs 가 채운다. quartz.config.yaml 에서
// layout.condition: "timeline" 으로 등록해 content/timeline.md 에서만 나오게 한다
// (quartz.ts 의 registerCondition). 이벤트 데이터는 콘텐츠(마크다운 파이프라인 대상)가
// 아니라 이 플러그인 전용 빌드 데이터라 content/ 가 아니라 플러그인 옆(data/)에 둔다 —
// content/timeline/ 폴더를 만들면 오솔길(탐색기)에 드롭다운 폴더로 보여서 피한다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

const TIMELINE_DATA_PATH = join(process.cwd(), "plugins/climate-timeline/data/climate-timeline.json")

function readTimelineData() {
  try {
    return JSON.parse(readFileSync(TIMELINE_DATA_PATH, "utf-8"))
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

export const ClimateTimeline = () => {
  const Component = ({ displayClass }) => {
    const data = readTimelineData()
    const events = data?.events ?? []
    const categories = data?.categories ?? []
    const html = events.length > 0 ? renderTimeline(events, categories) : null

    if (!html) {
      return h("section", {
        class: [displayClass, "climate-timeline"].filter(Boolean).join(" "),
        children: [h("p", { class: "climate-timeline-note", children: "아직 연표에 채운 사건이 없어요." })],
      })
    }

    return h("section", {
      class: [displayClass, "climate-timeline"].filter(Boolean).join(" "),
      children: [
        h("p", {
          class: "sr-only",
          children:
            "1824년부터 지금까지 기후 관련 사건을 월 단위로 배치한 가로 타임라인입니다. 위 카테고리 버튼으로 필터링할 수 있고, 타임라인 영역만 가로로 스크롤됩니다. 각 점에는 사건 제목·분류·날짜가 붙어 있습니다. −/+/Reset 버튼이나 Ctrl(또는 Cmd)을 누른 채 휠을 굴려 확대·축소할 수 있고, 연도를 누르면 그 구간으로 이동합니다.",
        }),
        h("div", { dangerouslySetInnerHTML: { __html: html } }),
      ],
    })
  }

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). --lightgray 는 이 다크 테마에서\n   배경과 거의 같은 색이라 선·테두리에 쓰지 않는다(§4 함정 2). ryu 카테고리만 전용 변수\n   --timeline-ryu 를 새로 둔다(기존 --color-purple 은 이미 정원 줄기/덩굴에 쓰이는 중이라,\n   나중에 이 타임라인만 색을 바꾸고 싶을 때 정원 쪽과 얽히지 않도록 분리했다).\n   요구사항: 색상만으로 카테고리를 구분하지 않는다 — 범례 버튼에 항상 이름 텍스트가 같이\n   나오고, 각 점의 aria-label/title(네이티브 툴팁)에도 분류 이름이 같이 들어간다. */\n:root {\n  --timeline-ryu: var(--color-purple, #a882ff);\n}\n\n.climate-timeline {\n  margin-top: 1.5rem;\n  /* PC — 요구사항: 타임라인 영역(특히 축 위/아래)을 훨씬 넉넉하게. */\n  --month-width: 8px;\n  --stack-gap: 100px;\n  --edge-pad: 64px;\n  --dot-size: 7px;\n}\n@media (max-width: 800px) {\n  .climate-timeline {\n    --month-width: 4px;\n    --stack-gap: 70px;\n    --edge-pad: 44px;\n    --dot-size: 6px;\n  }\n}\n\n.climate-timeline-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n/* ---------- 카테고리 색(범례 버튼 + 이벤트 점이 같은 규칙을 쓴다) ---------- */\n.tl-filter[data-category=\"science\"],\n.tl-event[data-category=\"science\"] {\n  --cat-color: var(--color-blue, var(--secondary));\n}\n.tl-filter[data-category=\"international\"],\n.tl-event[data-category=\"international\"] {\n  --cat-color: var(--color-cyan, var(--tertiary));\n}\n.tl-filter[data-category=\"korea\"],\n.tl-event[data-category=\"korea\"] {\n  --cat-color: var(--color-green, var(--secondary));\n}\n.tl-filter[data-category=\"disaster\"],\n.tl-event[data-category=\"disaster\"] {\n  --cat-color: var(--color-orange, var(--darkgray));\n}\n.tl-filter[data-category=\"ryu\"],\n.tl-event[data-category=\"ryu\"] {\n  --cat-color: var(--timeline-ryu);\n}\n\n/* ---------- 범례 · 줌 컨트롤(둘 다 \"타임라인 근처의 controls\") ---------- */\n.tl-controls {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.5rem 1rem;\n  margin-bottom: 0.75rem;\n}\n.tl-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.4rem;\n}\n.tl-filter {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.35rem;\n  font: inherit;\n  font-size: 0.85rem;\n  color: var(--dark);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border: 1px solid color-mix(in srgb, var(--gray) 40%, var(--light));\n  border-radius: 999px;\n  padding: 0.25rem 0.7rem;\n  cursor: pointer;\n}\n.tl-filter:hover {\n  border-color: var(--gray);\n}\n.tl-filter:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.tl-filter[aria-checked=\"true\"] {\n  color: var(--light);\n  background: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n  border-color: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n}\n.tl-legend-swatch {\n  width: 0.6rem;\n  height: 0.6rem;\n  border-radius: 999px;\n  background: var(--cat-color, var(--gray));\n  flex: none;\n}\n.tl-legend-all {\n  background: var(--gray);\n}\n.tl-filter[aria-checked=\"true\"] .tl-legend-swatch {\n  background: var(--light);\n}\n\n/* ---------- 줌 컨트롤(−/레벨/+/Reset) — .tl-filter 와 같은 알약 스타일을 재사용한다 ---------- */\n.tl-toolbar {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.35rem;\n  flex: none;\n}\n.tl-zoom-btn {\n  font: inherit;\n  font-size: 0.85rem;\n  color: var(--dark);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border: 1px solid color-mix(in srgb, var(--gray) 40%, var(--light));\n  border-radius: 999px;\n  cursor: pointer;\n}\n.tl-zoom-out,\n.tl-zoom-in {\n  width: 1.8rem;\n  height: 1.8rem;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  line-height: 1;\n  padding: 0;\n}\n.tl-zoom-reset {\n  padding: 0.25rem 0.7rem;\n}\n.tl-zoom-btn:hover {\n  border-color: var(--gray);\n}\n.tl-zoom-btn:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.tl-zoom-btn:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n.tl-zoom-level {\n  font-size: 0.78rem;\n  color: var(--gray);\n  min-width: 2.6rem;\n  text-align: center;\n}\n\n/* ---------- 가로 스크롤 영역 ----------\n   요구사항: 모바일에서 가로 스크롤이 페이지 전체로 새지 않게, timeline 내부 overflow 와\n   body overflow 를 분리한다. overflow-x:auto 인 이 래퍼 하나만 가로로 넓어지고(.tl-track 이\n   수천 px 폭이어도), overscroll-behavior-x:contain 이 스크롤이 끝에 닿았을 때 상위(body/뒤로\n   가기 제스처)로 새는 것을 막는다. 세로는 clip 하지 않는다(.tl-track 자체 높이가 콘텐츠에\n   맞게 계산되고, 상세 모달은 position:fixed 라 어차피 이 overflow 와 무관하다).\n   touch-action: 두 손가락 핀치를 timeline-view.js 가 직접 처리하므로(줌), 브라우저 기본\n   핀치줌/더블탭줌은 이 영역에서만 꺼둔다(pan-x pan-y = 한 손가락 스크롤은 그대로 허용). */\n.tl-scroll {\n  overflow-x: auto;\n  overflow-y: visible;\n  overscroll-behavior-x: contain;\n  -webkit-overflow-scrolling: touch;\n  touch-action: pan-x pan-y;\n  max-width: 100%;\n  padding-bottom: 0.5rem;\n}\n\n.tl-track {\n  position: relative;\n  width: calc(var(--month-width) * var(--total-months));\n  height: calc(var(--stack-gap) * (var(--stack-up) + var(--stack-down)) + var(--edge-pad) * 2);\n  min-width: 100%;\n  /* 축의 세로 위치(위쪽에서부터). 이벤트/연도 눈금이 전부 이 값을 기준으로 배치된다. */\n  --axis-top: calc(var(--stack-gap) * var(--stack-up) + var(--edge-pad));\n}\n\n.tl-axis {\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: var(--axis-top);\n  height: 2px;\n  background: color-mix(in srgb, var(--gray) 55%, var(--light));\n}\n\n/* ---------- 연도 눈금 — 요구사항: 매년 표시 ---------- */\n.tl-year {\n  position: absolute;\n  left: calc(var(--month-width) * var(--x));\n  top: var(--axis-top);\n  transform: translate(-50%, -50%);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n}\n.tl-year-tick {\n  width: 1px;\n  height: 12px;\n  background: color-mix(in srgb, var(--gray) 55%, var(--light));\n}\n.tl-year-label {\n  margin-top: 2px;\n  font-size: 0.72rem;\n  color: var(--gray);\n  white-space: nowrap;\n}\n/* JS 가 켜지면(timeline-view.js) 정적 연도 눈금 대신 화면 밀도에 맞는 .tl-ticks 를 쓴다 —\n   JS 가 없으면 이 규칙 자체가 적용 안 되니 위 매년 표시가 그대로 남는다(요구사항: JS 없이도\n   기존 화면 유지). */\n.climate-timeline.is-enhanced .tl-year {\n  display: none;\n}\n\n/* ---------- 줌 눈금(timeline-view.js 가 보이는 구간만 채운다) ---------- */\n.tl-ticks {\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 0;\n  height: 100%;\n  pointer-events: none;\n}\n.tl-tick {\n  position: absolute;\n  top: var(--axis-top);\n  left: calc(var(--month-width) * var(--x));\n  transform: translate(-50%, -50%);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  pointer-events: auto;\n  background: none;\n  border: none;\n  padding: 0;\n  font: inherit;\n  color: var(--gray);\n  cursor: pointer;\n}\n.tl-tick-mark {\n  width: 1px;\n  height: 12px;\n  background: color-mix(in srgb, var(--gray) 55%, var(--light));\n}\n.tl-tick-label {\n  margin-top: 2px;\n  font-size: 0.72rem;\n  white-space: nowrap;\n}\n.tl-tick[data-major=\"true\"] .tl-tick-label {\n  color: var(--dark);\n  font-weight: 600;\n}\n.tl-tick:hover .tl-tick-label,\n.tl-tick:focus-visible .tl-tick-label {\n  color: var(--secondary);\n}\n.tl-tick:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n\n/* ---------- \"오늘\" 표시선 — 요구사항: 현재 연도를 쉽게 찾을 수 있어야 한다 ---------- */\n.tl-now-layer {\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n}\n.tl-now {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: calc(var(--month-width) * var(--x));\n  width: 1px;\n  background: color-mix(in srgb, var(--secondary) 65%, var(--light));\n}\n.tl-now-label {\n  position: absolute;\n  top: calc(var(--axis-top) - 30px);\n  left: calc(var(--month-width) * var(--x));\n  transform: translateX(-50%);\n  font-size: 0.7rem;\n  color: var(--secondary);\n  white-space: nowrap;\n  background: var(--light);\n  padding: 0 0.3rem;\n}\n\n/* ---------- 이벤트 점 ----------\n   축에서 위/아래로 번갈아 쌓는다(timeline-render.js 의 data-dir/--depth). 이벤트 박스는\n   항상 축(--axis-top)에 한쪽 끝이 붙고, 반대쪽으로 stem 길이(--stack-gap * --depth)만큼\n   뻗어나간 끝에 점이 있다 — 그래서 이벤트 자체의 top 은 위/아래 공통으로 축 위치 하나뿐이고\n   방향은 flex-direction 과 transform 만으로 결정된다. */\n.tl-event {\n  position: absolute;\n  left: calc(var(--month-width) * var(--x));\n  top: var(--axis-top);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  transform: translate(-50%, 0);\n  padding: 0;\n  border: none;\n  background: none;\n  cursor: pointer;\n  font: inherit;\n  z-index: 1;\n}\n.tl-event[data-dir=\"up\"] {\n  flex-direction: column-reverse;\n  transform: translate(-50%, -100%);\n}\n.tl-event .tl-stem {\n  width: 1px;\n  height: calc(var(--stack-gap) * var(--depth) - var(--dot-size));\n  background: color-mix(in srgb, var(--cat-color, var(--gray)) 45%, var(--light));\n}\n.tl-event .tl-dot {\n  width: var(--dot-size);\n  height: var(--dot-size);\n  border-radius: 999px;\n  background: var(--cat-color, var(--secondary));\n  border: 2px solid var(--light);\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--cat-color, var(--secondary)) 70%, transparent);\n  flex: none;\n}\n.tl-event:hover .tl-dot,\n.tl-event:focus-visible .tl-dot {\n  filter: brightness(1.3);\n}\n@media (prefers-reduced-motion: no-preference) {\n  .tl-event .tl-dot {\n    transition: filter 0.12s;\n  }\n}\n.tl-event:focus-visible {\n  outline: none;\n}\n.tl-event:focus-visible .tl-dot {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.tl-event[hidden] {\n  display: none;\n}\n\n/* ---------- 상세 카드(패널) ----------\n   요구사항: 패널이 타임라인 자체를 밀거나 layout 을 깨면 안 된다 — gallery-page 라이트박스와\n   같은 position:fixed 오버레이라 .tl-scroll 의 overflow·문서 흐름과 완전히 무관하다. 데스크톱은\n   화면 오른쪽에서 슬라이드해 들어오는 드로어(타임라인을 가리지 않고 나란히 볼 수 있다), 모바일은\n   화면 아래에서 올라오는 바텀시트(모바일에서 익숙한 패턴) — 같은 마크업, 같은 열기/닫기 로직을\n   미디어쿼리로만 다르게 배치한다(timeline-interactive.js 참고). 트랜지션은\n   prefers-reduced-motion 이면 아예 안 걸어서 즉시 나타나고 사라진다. */\n.tl-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  pointer-events: none;\n}\n.tl-modal[hidden] {\n  display: none;\n}\n.tl-modal.is-open {\n  pointer-events: auto;\n}\n.tl-modal-backdrop {\n  position: absolute;\n  inset: 0;\n  background: color-mix(in srgb, var(--dark) 88%, transparent);\n  opacity: 0;\n}\n.tl-modal.is-open .tl-modal-backdrop {\n  opacity: 1;\n}\n.tl-modal-panel {\n  position: fixed;\n  top: 0;\n  right: 0;\n  bottom: 0;\n  width: min(420px, 92vw);\n  display: flex;\n  flex-direction: column;\n  overflow-y: auto;\n  background: var(--light);\n  border-left: 1px solid color-mix(in srgb, var(--gray) 45%, var(--light));\n  box-shadow: -12px 0 48px color-mix(in srgb, var(--dark) 45%, transparent);\n  transform: translateX(100%);\n}\n.tl-modal.is-open .tl-modal-panel {\n  transform: translateX(0);\n}\n@media (max-width: 800px) {\n  .tl-modal-panel {\n    top: auto;\n    right: 0;\n    left: 0;\n    bottom: 0;\n    width: auto;\n    max-height: min(82vh, 720px);\n    border-left: none;\n    border-top: 1px solid color-mix(in srgb, var(--gray) 45%, var(--light));\n    border-radius: 1rem 1rem 0 0;\n    box-shadow: 0 -12px 48px color-mix(in srgb, var(--dark) 45%, transparent);\n    transform: translateY(100%);\n  }\n  .tl-modal.is-open .tl-modal-panel {\n    transform: translateY(0);\n  }\n}\n@media (prefers-reduced-motion: no-preference) {\n  .tl-modal-backdrop {\n    transition: opacity 0.22s ease;\n  }\n  .tl-modal-panel {\n    transition: transform 0.28s ease;\n  }\n}\n.tl-modal-image {\n  display: block;\n  width: 100%;\n  max-height: 40vh;\n  object-fit: cover;\n  flex: none;\n}\n.tl-modal-image[hidden] {\n  display: none;\n}\n.tl-modal-body {\n  padding: 3rem 1.5rem 1.5rem;\n  flex: 1 1 auto;\n}\n.tl-modal-meta {\n  margin: 0 0 0.35rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.tl-modal-title {\n  margin: 0 0 0.5rem;\n  font-size: 1.4rem;\n  line-height: 1.3;\n}\n.tl-modal-title:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 4px;\n}\n.tl-modal-location {\n  margin: 0 0 0.75rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.tl-modal-location::before {\n  content: \"📍 \";\n}\n.tl-modal-desc {\n  margin: 0 0 1rem;\n  line-height: 1.6;\n  color: var(--dark);\n}\n/* ---------- 출처(Sources) ----------\n   요구사항: 설명(desc)보다 작게, 하지만 찾기는 쉽게 — desc 는 기본 글자 크기인데 여기는\n   제목/목록 전부 그보다 작은 폰트를 쓴다. 카드의 주인공은 여전히 제목·설명이라, 이 블록이\n   시각적으로 두드러지지 않게 배경 없이 목록만 둔다. */\n.tl-modal-sources {\n  margin: 0 0 1rem;\n}\n.tl-modal-sources-title {\n  margin: 0 0 0.4rem;\n  font-size: 0.72rem;\n  font-weight: 600;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n  color: var(--gray);\n}\n.tl-modal-sources-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 0.35rem;\n}\n.tl-source {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 0.4rem;\n  font-size: 0.85rem;\n}\n.tl-source-link {\n  display: inline-flex;\n  align-items: baseline;\n  gap: 0.3rem;\n  color: var(--secondary);\n}\n.tl-source-link:hover {\n  text-decoration: underline;\n}\n.tl-source-icon {\n  font-size: 0.8em;\n}\n.tl-source-type {\n  font-size: 0.7rem;\n  color: var(--gray);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border-radius: 999px;\n  padding: 0.1rem 0.5rem;\n}\n.tl-source-meta {\n  font-size: 0.75rem;\n  color: var(--gray);\n}\n.tl-modal-tags {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.35rem;\n}\n.tl-modal-tags li {\n  font-size: 0.78rem;\n  color: var(--gray);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border-radius: 999px;\n  padding: 0.15rem 0.6rem;\n}\n.tl-modal-close {\n  position: absolute;\n  top: 0.75rem;\n  right: 0.75rem;\n  width: 2.2rem;\n  height: 2.2rem;\n  border-radius: 999px;\n  border: none;\n  font: inherit;\n  font-size: 1.1rem;\n  cursor: pointer;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 55%, transparent);\n  z-index: 1;\n}\n.tl-modal-close:hover {\n  background: color-mix(in srgb, var(--dark) 75%, transparent);\n}\n.tl-modal-close:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n/* ---------- 이전/다음 사건 이동 ---------- */\n.tl-modal-nav {\n  flex: none;\n  display: flex;\n  justify-content: space-between;\n  gap: 0.5rem;\n  padding: 0.75rem 1.5rem;\n  border-top: 1px solid color-mix(in srgb, var(--gray) 30%, var(--light));\n  background: var(--light);\n  position: sticky;\n  bottom: 0;\n}\n.tl-modal-nav button {\n  font: inherit;\n  font-size: 0.85rem;\n  color: var(--dark);\n  background: none;\n  border: 1px solid color-mix(in srgb, var(--gray) 40%, var(--light));\n  border-radius: 999px;\n  padding: 0.35rem 0.8rem;\n  cursor: pointer;\n}\n.tl-modal-nav button:hover {\n  border-color: var(--gray);\n}\n.tl-modal-nav button:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.tl-modal-nav button[hidden] {\n  visibility: hidden;\n}\n"
  Component.afterDOMLoaded = "// 카테고리 필터: 라디오 그룹처럼 한 번에 하나만 선택된다(\"전체\"가 기본). 서버가 이미 모든\n// 이벤트를 그린 정적 HTML 이므로, 필터는 보이기/숨기기만 토글한다 — JS 없이도 전체 타임라인이\n// 그대로 보인다(progressive enhancement). 필터는 줌(tlCreateView, timeline-view.js)과 무관하게\n// 동작한다 — 위치는 항상 CSS calc(var(--month-width)*var(--x)) 라 줌 배율이 바뀌어도 숨김\n// 여부와 상관없이 정확하다.\n//\n// 상세 모달: gallery-page 의 라이트박스와 같은 패턴(포커스 이동·Escape·배경 클릭으로 닫기).\n// position:fixed 라 .tl-scroll 의 overflow-x:auto 와 무관하게 항상 화면 안에 꽉 차게 뜬다\n// (이전엔 hover 로만 뜨는 작은 라벨이 .tl-scroll 의 overflow 에 잘리는 문제가 있었다).\n;(function () {\n  // 아래 표시 자리에 build.mjs 가 timeline-scale.js + timeline-view.js(tlCreateView 등)를\n  // 그대로 이어붙인다. 이 IIFE 안에 들어와야(garden-home 처럼 다른 인터랙티브 파일들과 한\n  // 스코프를 공유하는 번들에서도) 이름이 안 새어나간다. 집중 모드(Focus Mode)의 폭 자동 확장은\n  // 이제 tlCreateView 안의 autoBasePx() 가 맡는다 — 예전엔 여기 별도 initResponsiveScale\n  // 함수가 .tl-track 에 직접 --month-width 를 심었는데, 줌 컨트롤러도 같은 변수를 다루게\n  // 되면서 하나로 합쳤다(둘이 서로 다른 요소에 같은 변수를 심으면 집중 모드가 켜졌을 때 줌이\n  // 풀리거나 반대로 줌이 집중 모드의 폭 확장을 무시하는 문제가 생긴다).\n  // 날짜 <-> 시간값(t, 소수 월 인덱스) <-> px 변환. timeline-render.js(서버)와 timeline-view.js\n// (클라이언트, build.mjs 가 timeline-interactive.js 의 IIFE 안에 이어붙인다 — 그 파일의\n// \"__TL_SCALE_AND_VIEW__\" 표시 참고)가 이 파일을 글자 그대로 공유한다. 위치 계산이 서버와\n// 클라이언트에서 갈라지면 줌했을 때 이벤트가 실제 날짜와 다른 자리에 찍히는 문제가 생기므로,\n// 이 파일 하나만 고치면 둘 다 같이 바뀌게 한다.\n//\n// IIFE 로 감싸지 않는다: 서버에서는 이 파일이 ES 모듈 최상위에 오므로 자기 모듈 스코프라\n// 안전하고, 클라이언트에서는 timeline-interactive.js 자신의 IIFE 안에 스플라이스되어 들어가므로\n// 거기서 스코프가 보장된다(다른 플러그인과 문자열로 이어붙는 garden-home 번들에서도 마찬가지).\n//\n// t 는 정수부가 절대 월 인덱스(연*12+월-1), 소수부가 그 달 안에서의 위치 비율이다. 날짜만\n// 아는 이벤트(\"YYYY-MM\")는 그 달의 가운데(+0.5)에 둔다 — 월 단위까지 확대했을 때 달의 왼쪽\n// 끝에 쏠려 보이지 않게 하려는 것이다(같은 달 이벤트를 위/아래로 번갈아 쌓는 규칙은 정수 월\n// 기준이라 이 소수부와 무관하게 그대로 동작한다).\n\n/**\n * \"YYYY-MM\" 또는 \"YYYY-MM-DD\" → 소수 월 인덱스 t. 형식이 안 맞으면 null. 월/일은 1~2자리\n * 둘 다 받는다(formatDateLabel 과 같은 관용도 — 실제 데이터에 \"2025-1-10\" 처럼 0 없이 적힌\n * exactDate 가 있어서, 2자리로 강제하면 그 이벤트 전체가 조용히 사라진다).\n */\nfunction tlDateToT(dateStr) {\n  var m = /^(\\d{4})-(\\d{1,2})(?:-(\\d{1,2}))?$/.exec(String(dateStr == null ? \"\" : dateStr))\n  if (!m) return null\n  var year = Number(m[1])\n  var month = Number(m[2])\n  var day = m[3] ? Number(m[3]) : null\n  var monthIdx = year * 12 + (month - 1)\n  if (day === null) return monthIdx + 0.5\n  var daysInMonth = new Date(year, month, 0).getDate()\n  return monthIdx + (day - 1) / daysInMonth\n}\n\n/** 이벤트의 exactDate 가 있으면 그걸, 없으면 date 를 써서 t 를 구한다. */\nfunction tlEventT(ev) {\n  return tlDateToT(ev.exactDate || ev.date)\n}\n\n/** 소수 월 인덱스 t → {year, month}(1~12). */\nfunction tlTToYearMonth(t) {\n  var monthIdx = Math.floor(t)\n  var year = Math.floor(monthIdx / 12)\n  var month = monthIdx - year * 12 + 1\n  return { year: year, month: month }\n}\n\n/** t(월 인덱스) → 트랙 기준 px. view = {timelineStart, pxPerMonth}. (dateToPosition) */\nfunction tlTToPx(t, view) {\n  return (t - view.timelineStart) * view.pxPerMonth\n}\n\n/** 트랙 기준 px → t(월 인덱스). (positionToDate) */\nfunction tlPxToT(px, view) {\n  return view.timelineStart + px / view.pxPerMonth\n}\n\n// 눈금 간격 후보(월 단위), 오름차순. tlPickTickStep 이 화면 밀도에 맞는 하나를 고른다.\nvar TL_TICK_STEPS = [1, 3, 6, 12, 24, 60, 120, 240, 600, 1200]\n\n/** 라벨 하나당 minLabelPx 이상 간격이 나오는 가장 촘촘한(=작은) 단계를 고른다. */\nfunction tlPickTickStep(pxPerMonth, minLabelPx) {\n  for (var i = 0; i < TL_TICK_STEPS.length; i++) {\n    var step = TL_TICK_STEPS[i]\n    if (step * pxPerMonth >= minLabelPx) return step\n  }\n  return TL_TICK_STEPS[TL_TICK_STEPS.length - 1]\n}\n\n/**\n * [t0, t1] 구간에 그릴 눈금 목록을 만든다. step 이 12 이상이면 매 step 개월(연 단위 이상)마다\n * 연도를 라벨로 쓰고, step 이 12 미만이면 매달 눈금을 찍어 1월엔 연도를, 나머지 달엔 \"N월\"을\n * 라벨로 쓴다(달력 연도가 자연스럽게 보이도록 절대 월 인덱스를 step 으로 나눈 나머지 기준).\n */\nfunction tlTicks(t0, t1, pxPerMonth, minLabelPx) {\n  var step = tlPickTickStep(pxPerMonth, minLabelPx)\n  var startIdx = Math.floor(t0 / step) * step\n  var endIdx = Math.ceil(t1 / step) * step\n  var ticks = []\n  for (var m = startIdx; m <= endIdx; m += step) {\n    var ym = tlTToYearMonth(m)\n    var major = step >= 12 || ym.month === 1\n    var label = step >= 12 || ym.month === 1 ? String(ym.year) : ym.month + \"월\"\n    ticks.push({ t: m, label: label, major: major })\n  }\n  return ticks\n}\n\n// 줌 컨트롤러 — timeline-interactive.js 의 initTimeline() 안에서 섹션 하나당 한 번\n// tlCreateView(section) 로 호출된다(build.mjs 가 이 파일을 그 IIFE 안에 이어붙인다). 실제\n// 위치 계산은 전부 timeline-scale.js 의 tlTToPx/tlPxToT(서버 timeline-render.js 와 완전히\n// 같은 함수)로 하므로, 줌 때문에 이벤트가 실제 날짜와 다른 자리에 찍히는 일이 없다(요구사항:\n// event positioning 의 날짜 정확성 유지).\n//\n// 상태는 의도적으로 최소화한다: 어떤 날짜가 화면 가운데인지는 저장하지 않고 scroll.scrollLeft\n// 를 원본으로 삼는다(네이티브 가로 스크롤과 절대 어긋나지 않는다, 요구사항 1). 줌 배율은\n// section 의 인라인 CSS 커스텀 프로퍼티 --month-width 하나로 표현된다 — timeline.css 의\n// calc(var(--month-width) * var(--x)) 가 이벤트/연도/눈금 전부의 위치를 이미 계산하고\n// 있으므로, 이 값 하나만 바꾸면 나머지는 브라우저가 다시 그린다(요구사항 9).\n\nvar TL_MIN_LABEL_PX_DESKTOP = 56\nvar TL_MIN_LABEL_PX_MOBILE = 44\nvar TL_MOBILE_BREAKPOINT = 800 // timeline.css 의 @media (max-width: 800px) 와 같은 값\nvar TL_MAX_PX_PER_MONTH = 200 // 1년 ≈ 2400px — 월 라벨이 넉넉히 들어가는 수준을 상한으로 둔다\nvar TL_NOW_PAD_MONTHS = 6\n\nfunction tlTodayISO() {\n  var d = new Date()\n  var mo = d.getMonth() + 1\n  var day = d.getDate()\n  return d.getFullYear() + \"-\" + (mo < 10 ? \"0\" + mo : mo) + \"-\" + (day < 10 ? \"0\" + day : day)\n}\n\nfunction tlTouchDist(touches) {\n  var dx = touches[0].clientX - touches[1].clientX\n  var dy = touches[0].clientY - touches[1].clientY\n  return Math.sqrt(dx * dx + dy * dy) || 1\n}\n\nfunction tlTouchMidX(touches, scrollEl) {\n  var rect = scrollEl.getBoundingClientRect()\n  return (touches[0].clientX + touches[1].clientX) / 2 - rect.left\n}\n\n/**\n * section(.climate-timeline) 안의 .tl-scroll/.tl-track/.tl-ticks/.tl-toolbar 를 찾아 줌\n * 상호작용을 건다. 필요한 요소가 없으면(구버전 마크업 등) 조용히 null 을 반환한다.\n */\nfunction tlCreateView(section) {\n  var scroll = section.querySelector(\".tl-scroll\")\n  var track = section.querySelector(\".tl-track\")\n  var ticksLayer = section.querySelector(\".tl-ticks\")\n  var nowLayer = section.querySelector(\".tl-now-layer\")\n  var toolbar = section.querySelector(\".tl-toolbar\")\n  if (!scroll || !track || !ticksLayer || !toolbar) return null\n\n  var zoomOutBtn = toolbar.querySelector(\".tl-zoom-out\")\n  var zoomInBtn = toolbar.querySelector(\".tl-zoom-in\")\n  var resetBtn = toolbar.querySelector(\".tl-zoom-reset\")\n  var levelEl = toolbar.querySelector(\".tl-zoom-level\")\n\n  var timelineStart = Number(track.dataset.start)\n  var builtEnd = Number(track.dataset.end)\n  var nowT = tlDateToT(tlTodayISO())\n  // 사이트를 한동안 다시 안 만들면 \"오늘\"이 빌드 시점의 끝(builtEnd)보다 나중일 수 있다 —\n  // 하드코딩된 연도가 아니라 클라이언트의 실제 현재 시각을 기준으로 범위를 늘린다.\n  var timelineEnd = Math.max(builtEnd, Math.ceil(nowT) + TL_NOW_PAD_MONTHS)\n\n  // timeline.css 의 미디어쿼리 기본값(PC 8px/모바일 4px)을 매번 다시 읽는다 — 한 번만 읽어\n  // 캐싱하면, 로드된 뒤 뷰포트가 모바일 분기점을 넘나들 때(창 크기 조절, 태블릿 회전) 기본\n  // 배율이 계속 예전 값에 머무른다. 우리가 심어 둔 인라인 값을 잠깐 지우고 캐스케이드(CSS)\n  // 값만 측정한 뒤 되돌린다 — 8/4 라는 숫자를 JS 에 다시 적지 않아도 항상 CSS 와 일치한다.\n  function cssDefaultPx() {\n    var prev = section.style.getPropertyValue(\"--month-width\")\n    section.style.removeProperty(\"--month-width\")\n    var val = parseFloat(getComputedStyle(track).getPropertyValue(\"--month-width\")) || 8\n    if (prev) section.style.setProperty(\"--month-width\", prev)\n    return val\n  }\n\n  var view = { timelineStart: timelineStart, pxPerMonth: cssDefaultPx() }\n  var userZoomed = false // Reset 전까지는 \"자동 기준폭\"을 계속 따라간다(아래 autoBasePx 참고)\n\n  function containerWidth() {\n    return scroll.clientWidth || 1\n  }\n  function fitAllPxPerMonth() {\n    return containerWidth() / (timelineEnd - timelineStart)\n  }\n  function minLabelPx() {\n    return window.innerWidth <= TL_MOBILE_BREAKPOINT ? TL_MIN_LABEL_PX_MOBILE : TL_MIN_LABEL_PX_DESKTOP\n  }\n  // 집중 모드(Focus Mode, plugins/focus-mode)에서 좌우 사이드바가 사라져 .tl-scroll 의 실제\n  // 폭이 넓어지면, 고정된 CSS 기본 폭 대신 그 폭에 맞춰 최대 3배까지 넓힌 값을 \"기준폭\"으로\n  // 삼는다(이 파일이 생기기 전부터 있던 동작 — 이전엔 별도 initResponsiveScale 이 .tl-track 에\n  // 직접 --month-width 를 심었는데, 이 컨트롤러도 같은 변수를 다루므로 하나로 합쳤다). 사용자가\n  // 아직 직접 줌하지 않았을 때만(!userZoomed) 이 기준폭을 따라간다 — 한 번 줌한 뒤에는 창\n  // 크기가 바뀌어도 사용자가 고른 배율을 그대로 존중하고 허용 범위만 다시 계산한다.\n  function autoBasePx() {\n    var isMobile = window.innerWidth <= TL_MOBILE_BREAKPOINT\n    var focusModeOn = document.documentElement.getAttribute(\"data-focus-mode\") === \"on\"\n    var base = cssDefaultPx()\n    if (isMobile || !focusModeOn) return base\n    var fitToFull = containerWidth() / (timelineEnd - timelineStart)\n    return Math.max(base, Math.min(fitToFull, base * 3))\n  }\n  function clampPx(px) {\n    var base = cssDefaultPx()\n    var min = Math.min(fitAllPxPerMonth(), base)\n    if (!isFinite(px)) return base\n    return Math.max(min, Math.min(TL_MAX_PX_PER_MONTH, px))\n  }\n\n  function applyPx(px) {\n    view.pxPerMonth = clampPx(px)\n    section.style.setProperty(\"--month-width\", view.pxPerMonth + \"px\")\n  }\n\n  function visibleRange() {\n    var t0 = tlPxToT(scroll.scrollLeft, view)\n    var t1 = tlPxToT(scroll.scrollLeft + containerWidth(), view)\n    return { t0: t0, t1: t1 }\n  }\n\n  function zoomAt(newPx, anchorPx) {\n    userZoomed = true\n    var t = tlPxToT(scroll.scrollLeft + anchorPx, view)\n    applyPx(newPx)\n    scroll.scrollLeft = tlTToPx(t, view) - anchorPx\n    scheduleUpdate()\n  }\n\n  function zoomBy(factor, anchorPx) {\n    if (anchorPx === undefined || anchorPx === null) anchorPx = containerWidth() / 2\n    zoomAt(view.pxPerMonth * factor, anchorPx)\n  }\n\n  function reset() {\n    userZoomed = false\n    applyPx(autoBasePx())\n    scroll.scrollLeft = 0\n    scheduleUpdate()\n  }\n\n  function fitRange(t0, t1) {\n    userZoomed = true\n    var span = Math.max(t1 - t0, 1)\n    var px = clampPx(containerWidth() / span)\n    applyPx(px)\n    var center = (t0 + t1) / 2\n    scroll.scrollLeft = tlTToPx(center, view) - containerWidth() / 2\n    scheduleUpdate()\n  }\n\n  // ---------- 눈금(보이는 구간 + 여유분만 그린다 — 요구사항: 성능) ----------\n  function renderTicks() {\n    var range = visibleRange()\n    var margin = (range.t1 - range.t0) * 0.5\n    var ticks = tlTicks(range.t0 - margin, range.t1 + margin, view.pxPerMonth, minLabelPx())\n    var html = \"\"\n    for (var i = 0; i < ticks.length; i++) {\n      var tk = ticks[i]\n      html +=\n        '<button type=\"button\" class=\"tl-tick\" data-major=\"' +\n        (tk.major ? \"true\" : \"false\") +\n        '\" data-t=\"' +\n        tk.t +\n        '\" style=\"--x:' +\n        (tk.t - timelineStart) +\n        '\" aria-label=\"' +\n        tk.label +\n        (tk.major ? \"년\" : \"\") +\n        '으로 확대·이동\">' +\n        '<span class=\"tl-tick-mark\" aria-hidden=\"true\"></span>' +\n        '<span class=\"tl-tick-label\">' +\n        tk.label +\n        \"</span></button>\"\n    }\n    ticksLayer.innerHTML = html\n    var buttons = ticksLayer.querySelectorAll(\".tl-tick\")\n    for (var j = 0; j < buttons.length; j++) {\n      buttons[j].addEventListener(\"click\", onTickClick)\n    }\n  }\n\n  function onTickClick(e) {\n    var btn = e.currentTarget\n    var t = Number(btn.dataset.t)\n    var step = tlPickTickStep(view.pxPerMonth, minLabelPx())\n    fitRange(t, t + step)\n  }\n\n  // ---------- \"오늘\" 표시선(요구사항: 2026년을 쉽게 찾을 수 있어야 한다) ----------\n  function renderNow() {\n    if (!nowLayer || nowLayer.dataset.tlDone === \"true\") return\n    nowLayer.dataset.tlDone = \"true\"\n    var x = nowT - timelineStart\n    nowLayer.innerHTML =\n      '<div class=\"tl-now\" style=\"--x:' +\n      x +\n      '\" aria-hidden=\"true\"></div>' +\n      '<div class=\"tl-now-label\" style=\"--x:' +\n      x +\n      '\">오늘</div>'\n  }\n\n  function updateToolbar() {\n    var step = tlPickTickStep(view.pxPerMonth, minLabelPx())\n    var label = step >= 600 ? \"전체\" : step >= 120 ? \"수십 년\" : step >= 12 ? \"연도\" : \"월\"\n    if (levelEl) levelEl.textContent = label\n    if (zoomOutBtn) zoomOutBtn.disabled = view.pxPerMonth <= clampPx(0) + 0.01\n    if (zoomInBtn) zoomInBtn.disabled = view.pxPerMonth >= TL_MAX_PX_PER_MONTH - 0.01\n  }\n\n  var rafPending = false\n  function scheduleUpdate() {\n    if (rafPending) return\n    rafPending = true\n    requestAnimationFrame(function () {\n      rafPending = false\n      renderTicks()\n      updateToolbar()\n    })\n  }\n\n  // ---------- 입력: 데스크톱 휠(수식키 필수 — 요구사항: 일반 스크롤 방해 금지) ----------\n  scroll.addEventListener(\n    \"wheel\",\n    function (e) {\n      if (!e.ctrlKey && !e.metaKey) return\n      e.preventDefault()\n      var rect = scroll.getBoundingClientRect()\n      var anchorPx = e.clientX - rect.left\n      var factor = Math.exp(-e.deltaY * 0.003)\n      zoomBy(factor, anchorPx)\n    },\n    { passive: false },\n  )\n\n  // Safari 데스크톱 트랙패드 핀치(비표준 gesture 이벤트 — ctrlKey 휠로는 안 들어온다)\n  var gestureStartPx = null\n  scroll.addEventListener(\"gesturestart\", function (e) {\n    e.preventDefault()\n    gestureStartPx = view.pxPerMonth\n  })\n  scroll.addEventListener(\"gesturechange\", function (e) {\n    if (gestureStartPx === null) return\n    e.preventDefault()\n    var rect = scroll.getBoundingClientRect()\n    zoomAt(gestureStartPx * e.scale, e.clientX - rect.left)\n  })\n  scroll.addEventListener(\"gestureend\", function () {\n    gestureStartPx = null\n  })\n\n  // ---------- 입력: 모바일 두 손가락 핀치 ----------\n  var touchState = null\n  scroll.addEventListener(\n    \"touchstart\",\n    function (e) {\n      if (e.touches.length !== 2) {\n        touchState = null\n        return\n      }\n      e.preventDefault()\n      var mid = tlTouchMidX(e.touches, scroll)\n      touchState = {\n        dist: tlTouchDist(e.touches),\n        px: view.pxPerMonth,\n        t: tlPxToT(scroll.scrollLeft + mid, view),\n      }\n    },\n    { passive: false },\n  )\n  scroll.addEventListener(\n    \"touchmove\",\n    function (e) {\n      if (!touchState || e.touches.length !== 2) return\n      e.preventDefault()\n      var dist = tlTouchDist(e.touches)\n      var mid = tlTouchMidX(e.touches, scroll)\n      applyPx((touchState.px * dist) / touchState.dist)\n      scroll.scrollLeft = tlTToPx(touchState.t, view) - mid\n      scheduleUpdate()\n    },\n    { passive: false },\n  )\n  scroll.addEventListener(\"touchend\", function (e) {\n    if (e.touches.length < 2) touchState = null\n  })\n\n  // ---------- 입력: 버튼 · 키보드 ----------\n  if (zoomOutBtn) {\n    zoomOutBtn.addEventListener(\"click\", function () {\n      zoomBy(1 / 1.6)\n    })\n  }\n  if (zoomInBtn) {\n    zoomInBtn.addEventListener(\"click\", function () {\n      zoomBy(1.6)\n    })\n  }\n  if (resetBtn) resetBtn.addEventListener(\"click\", reset)\n\n  section.addEventListener(\"keydown\", function (e) {\n    if (e.target.closest(\".tl-modal\")) return\n    if (e.ctrlKey || e.metaKey || e.altKey) return\n    if (e.key === \"+\" || e.key === \"=\") {\n      e.preventDefault()\n      zoomBy(1.6)\n    } else if (e.key === \"-\") {\n      e.preventDefault()\n      zoomBy(1 / 1.6)\n    } else if (e.key === \"0\") {\n      e.preventDefault()\n      reset()\n    }\n  })\n\n  var scrollRafPending = false\n  scroll.addEventListener(\"scroll\", function () {\n    if (scrollRafPending) return\n    scrollRafPending = true\n    requestAnimationFrame(function () {\n      scrollRafPending = false\n      renderTicks()\n    })\n  })\n\n  function onLayoutChange() {\n    // 아직 직접 줌하지 않았으면(userZoomed === false) 집중 모드/창 크기에 맞춘 자동 기준폭을\n    // 계속 따라간다. 이미 줌했다면 그 배율은 그대로 두고 허용 범위(clampPx)만 다시 맞춘다.\n    applyPx(userZoomed ? view.pxPerMonth : autoBasePx())\n    scheduleUpdate()\n  }\n\n  if (typeof ResizeObserver !== \"undefined\") {\n    var ro = new ResizeObserver(onLayoutChange)\n    ro.observe(scroll)\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        ro.disconnect()\n      })\n    }\n  }\n  if (typeof MutationObserver !== \"undefined\") {\n    // 집중 모드 토글이 사이드바 레이아웃을 바꾸는 시점과 --month-width 재계산 시점이 어긋나지\n    // 않도록, ResizeObserver 와 별개로 속성 변화 자체도 직접 본다(예전 initResponsiveScale 이\n    // data-focus-mode 를 직접 읽던 것과 같은 이유).\n    var mo = new MutationObserver(onLayoutChange)\n    mo.observe(document.documentElement, { attributes: true, attributeFilter: [\"data-focus-mode\"] })\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        mo.disconnect()\n      })\n    }\n  }\n\n  track.style.setProperty(\"--total-months\", String(timelineEnd - timelineStart))\n  applyPx(autoBasePx())\n  section.classList.add(\"is-enhanced\")\n  renderNow()\n  scheduleUpdate()\n\n  return { zoomBy: zoomBy, reset: reset, fitRange: fitRange }\n}\n\n\n  function initTimeline(section) {\n    if (!section || section.dataset.tlInit === \"true\") return\n    section.dataset.tlInit = \"true\"\n\n    var filters = Array.prototype.slice.call(section.querySelectorAll(\".tl-filter\"))\n    var events = Array.prototype.slice.call(section.querySelectorAll(\".tl-event\"))\n    var modal = section.querySelector(\".tl-modal\")\n    var dataEl = section.querySelector(\".tl-detail-data\")\n    if (events.length === 0) return\n\n    // ---------- 필터 ----------\n    function applyFilter(key) {\n      events.forEach(function (el) {\n        el.hidden = key !== \"all\" && el.dataset.category !== key\n      })\n      filters.forEach(function (btn) {\n        btn.setAttribute(\"aria-checked\", btn.dataset.filter === key ? \"true\" : \"false\")\n      })\n    }\n    filters.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        applyFilter(btn.dataset.filter)\n      })\n    })\n\n    if (typeof tlCreateView === \"function\") tlCreateView(section)\n\n    // ---------- 상세 모달 ----------\n    if (!modal || !dataEl) return\n    var detailById = {}\n    try {\n      detailById = JSON.parse(dataEl.textContent || \"{}\")\n    } catch {\n      detailById = {}\n    }\n\n    var img = modal.querySelector(\".tl-modal-image\")\n    var meta = modal.querySelector(\".tl-modal-meta\")\n    var title = modal.querySelector(\".tl-modal-title\")\n    var locationEl = modal.querySelector(\".tl-modal-location\")\n    var desc = modal.querySelector(\".tl-modal-desc\")\n    var sourcesWrap = modal.querySelector(\".tl-modal-sources\")\n    var sourcesList = modal.querySelector(\".tl-modal-sources-list\")\n    var tagsEl = modal.querySelector(\".tl-modal-tags\")\n    var status = modal.querySelector(\".tl-modal-status\")\n    var prevBtn = modal.querySelector(\".tl-modal-prev\")\n    var nextBtn = modal.querySelector(\".tl-modal-next\")\n    var panel = modal.querySelector(\".tl-modal-panel\")\n    var closeEls = Array.prototype.slice.call(modal.querySelectorAll(\"[data-tl-close]\"))\n    var lastFocused = null\n    var currentId = null\n    var closeTimer = null\n\n    // 존재하지 않는 필드는 빈 칸으로 안 남기고 그 요소 자체를 hidden 처리한다(요구사항).\n    // 지금 데이터에는 location/tags 가 없어 항상 hidden 이지만, 나중에 이벤트에 추가되면\n    // 이 함수는 고칠 필요 없이 그대로 표시한다.\n    function fillOrHide(el, text) {\n      if (text) {\n        el.textContent = text\n        el.hidden = false\n      } else {\n        el.textContent = \"\"\n        el.hidden = true\n      }\n    }\n\n    // 출처 목록 렌더링을 카드 본문 렌더링(render)과 분리해 둔다 — source type 배지, 인용\n    // 횟수, 1차 자료 표시, 외부 링크 아이콘 같은 걸 나중에 추가할 때 이 함수만 고치면 되고,\n    // render() 나 다른 필드 처리 로직을 건드릴 필요가 없다. sources 는 timeline-render.js 의\n    // normalizeSources() 가 이미 title/url/type/typeLabel/publisher/date 로 통일해 둔 배열이라\n    // (옛 links 스키마여도 여기 도착할 땐 같은 모양) 여기서 스키마 분기를 할 필요가 없다.\n    function renderSources(sources) {\n      sourcesList.innerHTML = \"\"\n      sourcesWrap.hidden = sources.length === 0\n      sources.forEach(function (source) {\n        var li = document.createElement(\"li\")\n        li.className = \"tl-source\"\n\n        var a = document.createElement(\"a\")\n        a.className = \"tl-source-link\"\n        a.href = source.url\n        a.target = \"_blank\"\n        a.rel = \"noopener noreferrer\"\n\n        var icon = document.createElement(\"span\")\n        icon.className = \"tl-source-icon\"\n        icon.setAttribute(\"aria-hidden\", \"true\")\n        icon.textContent = \"↗\"\n\n        var name = document.createElement(\"span\")\n        name.className = \"tl-source-name\"\n        name.textContent = source.title\n\n        a.appendChild(icon)\n        a.appendChild(name)\n        li.appendChild(a)\n\n        // type/publisher/date 는 실제 데이터에 있을 때만 만든다 — 없는 값을 빈 칸으로\n        // 남기지 않는다(요구사항).\n        if (source.typeLabel) {\n          var badge = document.createElement(\"span\")\n          badge.className = \"tl-source-type\"\n          badge.textContent = source.typeLabel\n          li.appendChild(badge)\n        }\n\n        var metaParts = []\n        if (source.publisher) metaParts.push(source.publisher)\n        if (source.date) metaParts.push(source.date)\n        if (metaParts.length > 0) {\n          var metaEl = document.createElement(\"span\")\n          metaEl.className = \"tl-source-meta\"\n          metaEl.textContent = metaParts.join(\" · \")\n          li.appendChild(metaEl)\n        }\n\n        sourcesList.appendChild(li)\n      })\n    }\n\n    function render(d) {\n      meta.textContent = d.category + \" · \" + d.date\n      title.textContent = d.title\n      fillOrHide(locationEl, d.location)\n      desc.textContent = d.description || \"\"\n\n      if (d.image) {\n        img.src = d.image\n        img.alt = d.imageAlt || d.title\n        img.hidden = false\n      } else {\n        img.removeAttribute(\"src\")\n        img.hidden = true\n      }\n\n      renderSources(d.sources || [])\n\n      tagsEl.innerHTML = \"\"\n      var tags = d.tags || []\n      tagsEl.hidden = tags.length === 0\n      tags.forEach(function (tag) {\n        var li = document.createElement(\"li\")\n        li.textContent = tag\n        tagsEl.appendChild(li)\n      })\n\n      prevBtn.hidden = !d.prevId\n      nextBtn.hidden = !d.nextId\n    }\n\n    function open(id) {\n      var d = detailById[id]\n      if (!d) return\n      lastFocused = document.activeElement\n      currentId = id\n      render(d)\n\n      if (closeTimer) {\n        clearTimeout(closeTimer)\n        closeTimer = null\n      }\n      modal.hidden = false\n      // hidden 을 떼자마자 클래스를 붙이면 브라우저가 시작 상태를 못 그리고 바로 최종\n      // 상태로 뛰어버려 슬라이드 트랜지션이 재생되지 않는다 — 한 프레임 쉬고 붙인다.\n      requestAnimationFrame(function () {\n        modal.classList.add(\"is-open\")\n      })\n      var closeBtn = modal.querySelector(\".tl-modal-close\")\n      if (closeBtn) closeBtn.focus()\n      document.addEventListener(\"keydown\", onKeydown)\n    }\n\n    function navigate(dir) {\n      var d = detailById[currentId]\n      if (!d) return\n      var targetId = dir === \"prev\" ? d.prevId : d.nextId\n      if (!targetId) return\n      var target = detailById[targetId]\n      if (!target) return\n      currentId = targetId\n      render(target)\n      // 화면이 갑자기 안 바뀐 것처럼 보이지 않도록, 이전/다음 사건으로 넘어가면 초점을\n      // 제목으로 옮긴다(스크린리더가 새 사건 제목을 바로 읽는다) — 처음 열 때는 그대로\n      // 닫기 버튼에 초점을 준다(위 open() 참고, 서로 다른 상황이라 다르게 처리한다).\n      title.focus()\n      status.textContent = target.date + \" · \" + target.title\n    }\n\n    function close() {\n      modal.classList.remove(\"is-open\")\n      document.removeEventListener(\"keydown\", onKeydown)\n      var reduced =\n        typeof window.matchMedia === \"function\" &&\n        window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches\n      var finished = false\n      function finish() {\n        if (finished) return // 트랜지션 종료(transitionend)와 안전장치 타이머가 둘 다\n        finished = true // 걸려 있어, 먼저 끝나는 쪽이 실행된 뒤 나머지는 조용히 무시한다.\n        closeTimer = null\n        modal.hidden = true\n        currentId = null\n        if (lastFocused && typeof lastFocused.focus === \"function\") lastFocused.focus()\n      }\n      if (reduced) {\n        finish()\n        return\n      }\n      closeTimer = setTimeout(finish, 250)\n      if (panel) {\n        panel.addEventListener(\n          \"transitionend\",\n          function once() {\n            panel.removeEventListener(\"transitionend\", once)\n            if (closeTimer) clearTimeout(closeTimer)\n            finish()\n          },\n          { once: true },\n        )\n      }\n    }\n\n    function onKeydown(e) {\n      if (e.key === \"Escape\") close()\n      else if (e.key === \"ArrowLeft\") navigate(\"prev\")\n      else if (e.key === \"ArrowRight\") navigate(\"next\")\n    }\n\n    events.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        open(btn.dataset.id)\n      })\n    })\n    closeEls.forEach(function (el) {\n      el.addEventListener(\"click\", close)\n    })\n    prevBtn.addEventListener(\"click\", function () {\n      navigate(\"prev\")\n    })\n    nextBtn.addEventListener(\"click\", function () {\n      navigate(\"next\")\n    })\n  }\n\n  function init() {\n    var sections = document.querySelectorAll(\".climate-timeline\")\n    for (var i = 0; i < sections.length; i++) initTimeline(sections[i])\n  }\n\n  document.addEventListener(\"nav\", init)\n})()\n"
  return Component
}
