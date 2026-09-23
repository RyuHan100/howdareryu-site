// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
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
            "1824년부터 지금까지 기후 관련 사건을 월 단위로 배치한 가로 타임라인입니다. 위 카테고리 버튼으로 필터링할 수 있고, 타임라인 영역만 가로로 스크롤됩니다. 각 점에는 사건 제목·분류·날짜가 붙어 있습니다.",
        }),
        h("div", { dangerouslySetInnerHTML: { __html: html } }),
      ],
    })
  }

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). --lightgray 는 이 다크 테마에서\n   배경과 거의 같은 색이라 선·테두리에 쓰지 않는다(§4 함정 2). ryu 카테고리만 전용 변수\n   --timeline-ryu 를 새로 둔다(기존 --color-purple 은 이미 정원 줄기/덩굴에 쓰이는 중이라,\n   나중에 이 타임라인만 색을 바꾸고 싶을 때 정원 쪽과 얽히지 않도록 분리했다).\n   요구사항: 색상만으로 카테고리를 구분하지 않는다 — 범례 버튼에 항상 이름 텍스트가 같이\n   나오고, 각 점의 aria-label/title(네이티브 툴팁)에도 분류 이름이 같이 들어간다. */\n:root {\n  --timeline-ryu: var(--color-purple, #a882ff);\n}\n\n.climate-timeline {\n  margin-top: 1.5rem;\n  /* PC — 요구사항: 타임라인 영역(특히 축 위/아래)을 훨씬 넉넉하게. */\n  --month-width: 8px;\n  --stack-gap: 100px;\n  --edge-pad: 64px;\n  --dot-size: 7px;\n}\n@media (max-width: 800px) {\n  .climate-timeline {\n    --month-width: 4px;\n    --stack-gap: 70px;\n    --edge-pad: 44px;\n    --dot-size: 6px;\n  }\n}\n\n.climate-timeline-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n/* ---------- 카테고리 색(범례 버튼 + 이벤트 점이 같은 규칙을 쓴다) ---------- */\n.tl-filter[data-category=\"science\"],\n.tl-event[data-category=\"science\"] {\n  --cat-color: var(--color-blue, var(--secondary));\n}\n.tl-filter[data-category=\"international\"],\n.tl-event[data-category=\"international\"] {\n  --cat-color: var(--color-cyan, var(--tertiary));\n}\n.tl-filter[data-category=\"korea\"],\n.tl-event[data-category=\"korea\"] {\n  --cat-color: var(--color-green, var(--secondary));\n}\n.tl-filter[data-category=\"disaster\"],\n.tl-event[data-category=\"disaster\"] {\n  --cat-color: var(--color-orange, var(--darkgray));\n}\n.tl-filter[data-category=\"ryu\"],\n.tl-event[data-category=\"ryu\"] {\n  --cat-color: var(--timeline-ryu);\n}\n\n/* ---------- 범례 · 필터 ---------- */\n.tl-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.4rem;\n  margin-bottom: 0.75rem;\n}\n.tl-filter {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.35rem;\n  font: inherit;\n  font-size: 0.85rem;\n  color: var(--dark);\n  background: color-mix(in srgb, var(--gray) 14%, var(--light));\n  border: 1px solid color-mix(in srgb, var(--gray) 40%, var(--light));\n  border-radius: 999px;\n  padding: 0.25rem 0.7rem;\n  cursor: pointer;\n}\n.tl-filter:hover {\n  border-color: var(--gray);\n}\n.tl-filter:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.tl-filter[aria-checked=\"true\"] {\n  color: var(--light);\n  background: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n  border-color: color-mix(in srgb, var(--cat-color, var(--secondary)) 75%, var(--dark));\n}\n.tl-legend-swatch {\n  width: 0.6rem;\n  height: 0.6rem;\n  border-radius: 999px;\n  background: var(--cat-color, var(--gray));\n  flex: none;\n}\n.tl-legend-all {\n  background: var(--gray);\n}\n.tl-filter[aria-checked=\"true\"] .tl-legend-swatch {\n  background: var(--light);\n}\n\n/* ---------- 가로 스크롤 영역 ----------\n   요구사항: 모바일에서 가로 스크롤이 페이지 전체로 새지 않게, timeline 내부 overflow 와\n   body overflow 를 분리한다. overflow-x:auto 인 이 래퍼 하나만 가로로 넓어지고(.tl-track 이\n   수천 px 폭이어도), overscroll-behavior-x:contain 이 스크롤이 끝에 닿았을 때 상위(body/뒤로\n   가기 제스처)로 새는 것을 막는다. 세로는 clip 하지 않는다(.tl-track 자체 높이가 콘텐츠에\n   맞게 계산되고, 상세 모달은 position:fixed 라 어차피 이 overflow 와 무관하다). */\n.tl-scroll {\n  overflow-x: auto;\n  overflow-y: visible;\n  overscroll-behavior-x: contain;\n  -webkit-overflow-scrolling: touch;\n  max-width: 100%;\n  padding-bottom: 0.5rem;\n}\n\n.tl-track {\n  position: relative;\n  width: calc(var(--month-width) * var(--total-months));\n  height: calc(var(--stack-gap) * (var(--stack-up) + var(--stack-down)) + var(--edge-pad) * 2);\n  min-width: 100%;\n  /* 축의 세로 위치(위쪽에서부터). 이벤트/연도 눈금이 전부 이 값을 기준으로 배치된다. */\n  --axis-top: calc(var(--stack-gap) * var(--stack-up) + var(--edge-pad));\n}\n\n.tl-axis {\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: var(--axis-top);\n  height: 2px;\n  background: color-mix(in srgb, var(--gray) 55%, var(--light));\n}\n\n/* ---------- 연도 눈금 — 요구사항: 매년 표시 ---------- */\n.tl-year {\n  position: absolute;\n  left: calc(var(--month-width) * var(--x));\n  top: var(--axis-top);\n  transform: translate(-50%, -50%);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n}\n.tl-year-tick {\n  width: 1px;\n  height: 12px;\n  background: color-mix(in srgb, var(--gray) 55%, var(--light));\n}\n.tl-year-label {\n  margin-top: 2px;\n  font-size: 0.72rem;\n  color: var(--gray);\n  white-space: nowrap;\n}\n\n/* ---------- 이벤트 점 ----------\n   축에서 위/아래로 번갈아 쌓는다(timeline-render.js 의 data-dir/--depth). 이벤트 박스는\n   항상 축(--axis-top)에 한쪽 끝이 붙고, 반대쪽으로 stem 길이(--stack-gap * --depth)만큼\n   뻗어나간 끝에 점이 있다 — 그래서 이벤트 자체의 top 은 위/아래 공통으로 축 위치 하나뿐이고\n   방향은 flex-direction 과 transform 만으로 결정된다. */\n.tl-event {\n  position: absolute;\n  left: calc(var(--month-width) * var(--x));\n  top: var(--axis-top);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  transform: translate(-50%, 0);\n  padding: 0;\n  border: none;\n  background: none;\n  cursor: pointer;\n  font: inherit;\n  z-index: 1;\n}\n.tl-event[data-dir=\"up\"] {\n  flex-direction: column-reverse;\n  transform: translate(-50%, -100%);\n}\n.tl-event .tl-stem {\n  width: 1px;\n  height: calc(var(--stack-gap) * var(--depth) - var(--dot-size));\n  background: color-mix(in srgb, var(--cat-color, var(--gray)) 45%, var(--light));\n}\n.tl-event .tl-dot {\n  width: var(--dot-size);\n  height: var(--dot-size);\n  border-radius: 999px;\n  background: var(--cat-color, var(--secondary));\n  border: 2px solid var(--light);\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--cat-color, var(--secondary)) 70%, transparent);\n  flex: none;\n}\n.tl-event:hover .tl-dot,\n.tl-event:focus-visible .tl-dot {\n  filter: brightness(1.3);\n}\n@media (prefers-reduced-motion: no-preference) {\n  .tl-event .tl-dot {\n    transition: filter 0.12s;\n  }\n}\n.tl-event:focus-visible {\n  outline: none;\n}\n.tl-event:focus-visible .tl-dot {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n.tl-event[hidden] {\n  display: none;\n}\n\n/* ---------- 상세 모달 ----------\n   요구사항: 창을 키우고, 잘리지 않게. gallery-page 라이트박스와 같은 position:fixed 패턴이라\n   .tl-scroll 의 overflow 와 완전히 무관하다(이전 hover 라벨이 overflow 에 잘리던 문제의\n   근본 해결). 내용이 화면보다 길면 패널 안에서 세로 스크롤(넘치는 걸 숨기지 않고 스크롤로\n   전부 보여준다). PC/모바일 모두 vw/vh 기준이라 별도 미디어쿼리 없이 반응형이다. */\n.tl-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 4vh 4vw;\n}\n.tl-modal[hidden] {\n  display: none;\n}\n.tl-modal-backdrop {\n  position: absolute;\n  inset: 0;\n  background: color-mix(in srgb, var(--dark) 88%, transparent);\n}\n.tl-modal-panel {\n  position: relative;\n  width: min(760px, 100%);\n  max-height: 100%;\n  overflow-y: auto;\n  background: var(--light);\n  border: 1px solid color-mix(in srgb, var(--gray) 45%, var(--light));\n  border-radius: 0.6rem;\n  box-shadow: 0 12px 48px color-mix(in srgb, var(--dark) 55%, transparent);\n}\n.tl-modal-image {\n  display: block;\n  width: 100%;\n  max-height: 46vh;\n  object-fit: cover;\n  border-radius: 0.6rem 0.6rem 0 0;\n}\n.tl-modal-image[hidden] {\n  display: none;\n}\n.tl-modal-body {\n  padding: 1.5rem 1.75rem 1.75rem;\n}\n.tl-modal-meta {\n  margin: 0 0 0.35rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.tl-modal-title {\n  margin: 0 0 0.75rem;\n  font-size: 1.4rem;\n  line-height: 1.3;\n}\n.tl-modal-desc {\n  margin: 0 0 1rem;\n  line-height: 1.6;\n  color: var(--dark);\n}\n.tl-modal-links {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 0.4rem;\n}\n.tl-modal-links:empty {\n  display: none;\n}\n.tl-modal-links a {\n  color: var(--secondary);\n}\n.tl-modal-close {\n  position: absolute;\n  top: 0.75rem;\n  right: 0.75rem;\n  width: 2.2rem;\n  height: 2.2rem;\n  border-radius: 999px;\n  border: none;\n  font: inherit;\n  font-size: 1.1rem;\n  cursor: pointer;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 55%, transparent);\n  z-index: 1;\n}\n.tl-modal-close:hover {\n  background: color-mix(in srgb, var(--dark) 75%, transparent);\n}\n.tl-modal-close:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n"
  Component.afterDOMLoaded = "// 카테고리 필터: 라디오 그룹처럼 한 번에 하나만 선택된다(\"전체\"가 기본). 서버가 이미 모든\n// 이벤트를 그린 정적 HTML 이므로(줌 없는 정적 타임라인), 여기선 보이기/숨기기만 토글한다 —\n// JS 없이도 전체 타임라인이 그대로 보인다(progressive enhancement).\n//\n// 상세 모달: gallery-page 의 라이트박스와 같은 패턴(포커스 이동·Escape·배경 클릭으로 닫기).\n// position:fixed 라 .tl-scroll 의 overflow-x:auto 와 무관하게 항상 화면 안에 꽉 차게 뜬다\n// (이전엔 hover 로만 뜨는 작은 라벨이 .tl-scroll 의 overflow 에 잘리는 문제가 있었다).\n;(function () {\n  function initTimeline(section) {\n    if (!section || section.dataset.tlInit === \"true\") return\n    section.dataset.tlInit = \"true\"\n\n    var filters = Array.prototype.slice.call(section.querySelectorAll(\".tl-filter\"))\n    var events = Array.prototype.slice.call(section.querySelectorAll(\".tl-event\"))\n    var modal = section.querySelector(\".tl-modal\")\n    var dataEl = section.querySelector(\".tl-detail-data\")\n    if (events.length === 0) return\n\n    // ---------- 필터 ----------\n    function applyFilter(key) {\n      events.forEach(function (el) {\n        el.hidden = key !== \"all\" && el.dataset.category !== key\n      })\n      filters.forEach(function (btn) {\n        btn.setAttribute(\"aria-checked\", btn.dataset.filter === key ? \"true\" : \"false\")\n      })\n    }\n    filters.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        applyFilter(btn.dataset.filter)\n      })\n    })\n\n    // ---------- 상세 모달 ----------\n    if (!modal || !dataEl) return\n    var detailById = {}\n    try {\n      detailById = JSON.parse(dataEl.textContent || \"{}\")\n    } catch {\n      detailById = {}\n    }\n\n    var img = modal.querySelector(\".tl-modal-image\")\n    var meta = modal.querySelector(\".tl-modal-meta\")\n    var title = modal.querySelector(\".tl-modal-title\")\n    var desc = modal.querySelector(\".tl-modal-desc\")\n    var links = modal.querySelector(\".tl-modal-links\")\n    var closeEls = Array.prototype.slice.call(modal.querySelectorAll(\"[data-tl-close]\"))\n    var lastFocused = null\n\n    function open(id) {\n      var d = detailById[id]\n      if (!d) return\n      lastFocused = document.activeElement\n\n      meta.textContent = d.category + \" · \" + d.date\n      title.textContent = d.title\n      desc.textContent = d.description || \"\"\n\n      if (d.image) {\n        img.src = d.image\n        img.alt = d.imageAlt || d.title\n        img.hidden = false\n      } else {\n        img.removeAttribute(\"src\")\n        img.hidden = true\n      }\n\n      links.innerHTML = \"\"\n      ;(d.links || []).forEach(function (link) {\n        var li = document.createElement(\"li\")\n        var a = document.createElement(\"a\")\n        a.href = link.url\n        a.target = \"_blank\"\n        a.rel = \"noopener noreferrer\"\n        a.textContent = link.title || link.url\n        li.appendChild(a)\n        links.appendChild(li)\n      })\n\n      modal.hidden = false\n      var closeBtn = modal.querySelector(\".tl-modal-close\")\n      if (closeBtn) closeBtn.focus()\n      document.addEventListener(\"keydown\", onKeydown)\n    }\n\n    function close() {\n      modal.hidden = true\n      document.removeEventListener(\"keydown\", onKeydown)\n      if (lastFocused && typeof lastFocused.focus === \"function\") lastFocused.focus()\n    }\n\n    function onKeydown(e) {\n      if (e.key === \"Escape\") close()\n    }\n\n    events.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        open(btn.dataset.id)\n      })\n    })\n    closeEls.forEach(function (el) {\n      el.addEventListener(\"click\", close)\n    })\n  }\n\n  function init() {\n    var sections = document.querySelectorAll(\".climate-timeline\")\n    for (var i = 0; i < sections.length; i++) initTimeline(sections[i])\n  }\n\n  document.addEventListener(\"nav\", init)\n})()\n"
  return Component
}
