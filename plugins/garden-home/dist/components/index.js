// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
// ② 정원 — scribbled notes 의 노트 하나가 식물 하나. 빌드할 때 SVG 문자열로 만든다(움직임 없음).
//
// - 종류는 수집기(quartz/garden/collect.ts)가 판정한 plant 를 따른다: grass 풀, flower 꽃,
//   vine 덩굴(끝이 물음표처럼 말림), tree 나무. 모르는 종류는 풀로 그린다.
// - 흙 단면 아래, 아직 없는 노트를 가리키는 [[링크]](missingLinks)는 흙 속의 작은 씨앗.
// - wilted(시듦 기준을 넘김)는 회색(.is-wilted, CSS 에서 색을 바꾼다).
// - 이랑 하나에 최대 12개. 넘치면 아래에 새 이랑.
// - 자리: 노트를 생성일(같으면 경로) 순으로 하나씩 심는다. 칸(열)은 경로 해시로 고르고, 이미
//   차 있으면 오른쪽 빈칸으로. 이랑이 다 차면 다음 이랑. 새 노트는 항상 나중에 심기므로
//   기존 식물은 자리를 옮기지 않는다(노트를 지우면 그 뒤 식물 몇 개가 빈자리로 옮길 수는 있다).
// - 좌표는 레이아웃마다(모바일 좁은 이랑 / 데스크톱 넓은 이랑) 칸 너비만 다르고 식물 크기는 같다.
//
// 색은 전부 CSS 클래스로 주고, CSS 에서 테마 변수로 칠한다(SVG 속성에 색을 쓰지 않는다).

const GARDEN_COLS = 12
const GROUND_Y = 86 // 이랑 가운데 흙 표면 높이
const ROW_H = 120
const PAD_X = 8
const MAX_SEEDS_PER_PLANT = 4

/** 모바일(좁은) / 데스크톱(넓은) 이랑. 칸 너비만 다르다. */
const LAYOUTS = {
  narrow: { slot: 30 },
  wide: { slot: 58 },
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** 같은 노트에서 여러 개의 0~1 값이 필요할 때 n 을 바꿔 가며 쓴다. 항상 같은 값이 나온다. */
function rnd(seed, n) {
  return fnv1a(`${seed}#${n}`) / 0xffffffff
}

const f = (n) => (Math.round(n * 10) / 10).toString()

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 노트를 이랑·칸에 배치한다. 반환: [[note|null × 12], …] */
function placePlants(notes) {
  const ordered = [...notes].sort(
    (a, b) => String(a.created ?? "").localeCompare(String(b.created ?? "")) || a.path.localeCompare(b.path),
  )
  const rows = []
  let fill = 0
  for (const n of ordered) {
    while (rows[fill] && rows[fill].every(Boolean)) fill++
    if (!rows[fill]) rows[fill] = new Array(GARDEN_COLS).fill(null)
    const row = rows[fill]
    let c = fnv1a(n.path) % GARDEN_COLS
    while (row[c]) c = (c + 1) % GARDEN_COLS
    row[c] = n
  }
  return rows
}

// ---------- 식물 모양 (밑동이 0,0, 위쪽이 -y) ----------

function grass(seed, s) {
  const n = 3 + Math.floor(rnd(seed, 1) * 3)
  let d = ""
  for (let i = 0; i < n; i++) {
    const x0 = (i - (n - 1) / 2) * 2.2
    const h = (12 + rnd(seed, 10 + i) * 9) * s
    const lean = (rnd(seed, 20 + i) - 0.5) * 9 + x0 * 1.4
    d += `M${f(x0)} 0Q${f(x0 + lean * 0.25)} ${f(-h * 0.6)} ${f(x0 + lean)} ${f(-h)}`
  }
  return `<path class="gp-stroke gp-grass" d="${d}"/>`
}

function flower(seed, s) {
  const h = (28 + rnd(seed, 1) * 12) * s
  const bend = (rnd(seed, 2) - 0.5) * 8
  const petal = ["gp-petal-a", "gp-petal-b", "gp-petal-c"][fnv1a(seed) % 3]
  const cx = bend * 0.3
  const cy = -h
  const pr = 3.1 * s
  let petals = ""
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rnd(seed, 3)
    petals += `<circle class="${petal}" cx="${f(cx + Math.cos(a) * pr * 1.15)}" cy="${f(cy + Math.sin(a) * pr * 1.15)}" r="${f(pr)}"/>`
  }
  const ly = -h * 0.38
  return (
    `<path class="gp-stroke gp-stem" d="M0 0Q${f(bend)} ${f(-h / 2)} ${f(cx)} ${f(cy)}"/>` +
    `<ellipse class="gp-leaf" cx="${f(-3.6 * s)}" cy="${f(ly)}" rx="${f(3.6 * s)}" ry="${f(1.6 * s)}" transform="rotate(-30 ${f(-3.6 * s)} ${f(ly)})"/>` +
    `<ellipse class="gp-leaf" cx="${f(3.6 * s)}" cy="${f(ly - 5 * s)}" rx="${f(3.6 * s)}" ry="${f(1.6 * s)}" transform="rotate(30 ${f(3.6 * s)} ${f(ly - 5 * s)})"/>` +
    petals +
    `<circle class="gp-flower-heart" cx="${f(cx)}" cy="${f(cy)}" r="${f(2.1 * s)}"/>`
  )
}

/** 덩굴: 구불구불 올라가다 끝이 물음표(?)처럼 말린다. 해시로 좌우를 뒤집는다. */
function vine(seed, s) {
  const flip = fnv1a(seed) % 2 ? -1 : 1
  const k = s * (0.95 + rnd(seed, 1) * 0.15)
  const P = (x, y) => `${f(x * k * flip)} ${f(y * k)}`
  const d =
    `M${P(0, 0)}` +
    `C${P(5, -12)} ${P(-5, -24)} ${P(0, -34)}` +
    `C${P(3, -40)} ${P(11, -42)} ${P(11, -50)}` +
    `C${P(11, -58)} ${P(2, -60)} ${P(-2, -56)}` +
    `C${P(-5, -53)} ${P(-4, -49)} ${P(-1, -48)}`
  const leaf = (x, y, rot) =>
    `<ellipse class="gp-leaf" cx="${f(x * k * flip)}" cy="${f(y * k)}" rx="${f(3.2 * k)}" ry="${f(1.5 * k)}" transform="rotate(${rot * flip} ${f(x * k * flip)} ${f(y * k)})"/>`
  return `<path class="gp-stroke gp-vine" d="${d}"/>` + leaf(4, -10, -25) + leaf(-4, -22, 25) + leaf(5, -38, -35)
}

function tree(seed, s) {
  const th = (26 + rnd(seed, 1) * 8) * s
  const r = s * (0.95 + rnd(seed, 2) * 0.15)
  return (
    `<path class="gp-trunk" d="M${f(-2.8 * s)} 0L${f(-1.7 * s)} ${f(-th)}L${f(1.7 * s)} ${f(-th)}L${f(2.8 * s)} 0Z"/>` +
    `<circle class="gp-canopy" cx="${f(-8 * r)}" cy="${f(-th - 3 * r)}" r="${f(9 * r)}"/>` +
    `<circle class="gp-canopy" cx="${f(8 * r)}" cy="${f(-th - 4 * r)}" r="${f(9.5 * r)}"/>` +
    `<circle class="gp-canopy" cx="0" cy="${f(-th - 11 * r)}" r="${f(12.5 * r)}"/>` +
    `<circle class="gp-canopy gp-canopy-top" cx="${f(2 * r)}" cy="${f(-th - 20 * r)}" r="${f(8 * r)}"/>`
  )
}

const SHAPES = { grass, flower, vine, tree }

/** 글자 수가 많을수록 조금 크게(0.85 ~ 1.2배). */
function sizeOf(note) {
  const c = Math.max(0, Number(note.chars) || 0)
  return 0.85 + 0.35 * Math.min(1, Math.log(c + 1) / Math.log(3000))
}

// ---------- 흙 ----------

/** 이랑 윗면(가운데가 볼록한 곡선)의 x 위치 높이. */
function groundAt(x, width) {
  const t = x / width
  return GROUND_Y + 4 - 20 * t * (1 - t)
}

function soil(width, rowIndex) {
  const g = GROUND_Y
  const seed = `row-${rowIndex}`
  let pebbles = ""
  const count = 5 + Math.floor(rnd(seed, 0) * 5) + Math.round(width / 120)
  for (let i = 0; i < count; i++) {
    const x = 6 + rnd(seed, 10 + i) * (width - 12)
    const y = g + 20 + rnd(seed, 30 + i) * (ROW_H - g - 26)
    pebbles += `<ellipse class="gp-pebble" cx="${f(x)}" cy="${f(y)}" rx="${f(1.2 + rnd(seed, 50 + i) * 1.6)}" ry="${f(0.9 + rnd(seed, 70 + i))}"/>`
  }
  return (
    `<path class="gp-soil" d="M0 ${g + 4}Q${f(width / 2)} ${g - 6} ${width} ${g + 4}L${width} ${ROW_H}L0 ${ROW_H}Z"/>` +
    `<path class="gp-soil-deep" d="M0 ${g + 19}Q${f(width / 4)} ${g + 15} ${f(width / 2)} ${g + 20}T${width} ${g + 18}L${width} ${ROW_H}L0 ${ROW_H}Z"/>` +
    pebbles +
    `<path class="gp-soil-line" d="M0 ${g + 4}Q${f(width / 2)} ${g - 6} ${width} ${g + 4}"/>`
  )
}

// ---------- 이랑 하나 ----------

function renderRow(row, rowIndex, layout, labels) {
  const width = PAD_X * 2 + GARDEN_COLS * layout.slot
  const plants = []
  const seeds = []
  row.forEach((note, col) => {
    if (!note) return
    const seed = note.path
    const x = PAD_X + (col + 0.5) * layout.slot + (rnd(seed, 90) - 0.5) * layout.slot * 0.35
    const y = groundAt(x, width) + 1
    const kind = SHAPES[note.plant] ? note.plant : "grass"
    const label = labels[note.plant] ?? note.label ?? note.plant
    const wilted = note.wilted === true
    const name = `${note.title} · ${label}${wilted ? " · 시듦" : ""}`
    plants.push({
      kind,
      svg:
        `<a href="./${esc(note.slug)}" data-router-ignore class="gp-plant gp-kind-${kind}${wilted ? " is-wilted" : ""}" aria-label="${esc(name)}">` +
        `<title>${esc(name)}</title>` +
        `<g transform="translate(${f(x)} ${f(y)})">${SHAPES[kind](seed, sizeOf(note))}</g></a>`,
    })
    const missing = [...new Set(note.missingLinks ?? [])].slice(0, MAX_SEEDS_PER_PLANT)
    missing.forEach((target, i) => {
      const sx = Math.min(width - 4, Math.max(4, x + (rnd(`${seed}>${target}`, 1) - 0.5) * layout.slot * 0.8))
      const sy = GROUND_Y + 14 + (i % 2) * 7 + rnd(`${seed}>${target}`, 2) * 8
      const rot = Math.round(rnd(`${seed}>${target}`, 3) * 180)
      seeds.push(
        `<g class="gp-seed"><title>${esc(`씨앗 — 아직 없는 노트: ${target}`)}</title>` +
          `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="3" ry="2" transform="rotate(${rot} ${f(sx)} ${f(sy)})"/></g>`,
      )
    })
  })
  // 나무를 먼저(뒤에) 그리고 작은 식물을 앞에.
  const order = { tree: 0, vine: 1, flower: 2, grass: 3 }
  plants.sort((a, b) => order[a.kind] - order[b.kind])
  const count = row.filter(Boolean).length
  return (
    `<svg class="gp-row" viewBox="0 0 ${width} ${ROW_H}" role="group" aria-label="이랑 ${rowIndex + 1} — 식물 ${count}개" xmlns="http://www.w3.org/2000/svg">` +
    soil(width, rowIndex) +
    seeds.join("") +
    plants.map((p) => p.svg).join("") +
    `</svg>`
  )
}

/**
 * 정원 전체 HTML(좁은 이랑 묶음 + 넓은 이랑 묶음, CSS 가 화면 폭에 따라 하나만 보여 준다)과 요약.
 * notes: garden-data.json 의 garden.notes, labels: config.plants.kinds
 */
function renderGarden(notes, labels) {
  const rows = placePlants(notes)
  // 둘 중 하나는 CSS 에서 display:none 이라 화면·스크린리더·탭 순서에서 모두 빠진다.
  const beds = (name) =>
    `<div class="gp-beds gp-beds-${name}">` +
    rows.map((row, i) => renderRow(row, i, LAYOUTS[name], labels)).join("") +
    `</div>`

  const counts = {}
  let wilted = 0
  let seeds = 0
  for (const n of notes) {
    const k = SHAPES[n.plant] ? n.plant : "grass"
    counts[k] = (counts[k] ?? 0) + 1
    if (n.wilted) wilted++
    seeds += Math.min(MAX_SEEDS_PER_PLANT, new Set(n.missingLinks ?? []).size)
  }
  return { html: beds("narrow") + beds("wide"), rows: rows.length, counts, wilted, seeds }
}

// 서버(빌드) 쪽 컴포넌트. hdr-comments 와 같은 방식으로 preact vnode 를 직접 만든다
// (Quartz 는 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). 아래 CSS
// 자리표시자는 build.mjs 가 채우고, garden-svg.js 는 build.mjs 가 이 파일 앞에 붙인다.
// 클라이언트 스크립트는 아직 없다(정원은 움직임 없는 SVG). radar/슬라이드쇼처럼 움직이는 걸
// 채울 때는 prefers-reduced-motion 을 지켜야 한다(CLAUDE.md §9). 이 컴포넌트는
// quartz.config.yaml 에서 layout.condition: "index" 로 등록해 홈에서만 나오게 한다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

// quartz/garden/collect.ts 의 GARDEN_DATA_PATH 와 같은 곳. quartz.ts 가 빌드 시작 때 만든다.
const GARDEN_DATA_PATH = join(process.cwd(), ".garden-cache", "garden-data.json")

function readGardenData() {
  try {
    return JSON.parse(readFileSync(GARDEN_DATA_PATH, "utf-8"))
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

function text(s) {
  return s
}

// 자리 표시 섹션(②③④). 다음 단계에서 실제 내용으로 바뀐다.
function placeholder(title, note) {
  return h("section", {
    class: "garden-home-section garden-home-placeholder",
    children: [
      h("h3", { children: title }),
      h("p", { class: "garden-home-note", children: note }),
    ],
  })
}

// ② 정원 — garden-svg.js 의 renderGarden 이 만든 SVG 를 그대로 넣는다.
function gardenSection() {
  const data = readGardenData()
  const notes = data?.garden?.notes ?? []
  const labels = data?.config?.plants?.kinds ?? { grass: "풀", flower: "꽃", vine: "덩굴", tree: "나무" }
  if (notes.length === 0) {
    return placeholder("정원", "아직 심은 글이 없어요.")
  }
  const g = renderGarden(notes, labels)
  const parts = ["grass", "flower", "vine", "tree"]
    .filter((k) => g.counts[k])
    .map((k) => `${labels[k] ?? k} ${g.counts[k]}`)
  if (g.wilted) parts.push(`시든 식물 ${g.wilted}`)
  if (g.seeds) parts.push(`씨앗 ${g.seeds}`)
  return h("section", {
    class: "garden-home-section garden-home-garden",
    children: [
      h("h3", { children: "정원" }),
      h("div", { class: "gp-garden", dangerouslySetInnerHTML: { __html: g.html } }),
      h("p", { class: "gp-legend", children: parts.join(" · ") }),
    ],
  })
}

function link(href, children, opts) {
  return h("a", { href, target: opts?.external ? "_blank" : undefined, rel: opts?.external ? "noopener noreferrer" : undefined, children })
}

// ⑤ 정원사에게 연락하기. garden.yaml 의 on/off 와 무관하게 항상 나온다.
function contactSection() {
  const item = (label, node) =>
    h("li", { children: [text(`${label} | `), node] })

  return h("section", {
    class: "garden-home-section garden-home-contact",
    children: [
      h("h3", { children: "정원사에게 연락하기" }),
      h("ul", {
        children: [
          item("Instagram", link("https://www.instagram.com/howdareryu", "@howdareryu", { external: true })),
          item("Email", link("mailto:dare2do.everything@gmail.com", "dare2do.everything@gmail.com")),
          item("GitHub", link("https://github.com/RyuHan100/howdareryu-site", "howdareryu-site", { external: true })),
        ],
      }),
    ],
  })
}

export const GardenHome = (opts) => {
  const show = {
    garden: opts?.garden === true,
    radar: opts?.radar === true,
    gallery: opts?.gallery === true,
  }

  const Component = ({ displayClass }) => {
    const sections = []
    if (show.garden) sections.push(gardenSection())
    if (show.radar) sections.push(placeholder("radar", "radar 폴더의 최근 기록이 레이더 화면에 점으로 뜨는 그림 — 다음 단계에서 채울 예정."))
    if (show.gallery) sections.push(placeholder("아빠의 화단", "content/img/inspiration 의 그림 슬라이드쇼 — 다음 단계에서 채울 예정."))
    sections.push(contactSection())

    return h("div", {
      class: [displayClass, "garden-home"].filter(Boolean).join(" "),
      children: sections,
    })
  }

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). 라이트/다크 모드 자동 대응.\n   --color-* 는 hackthebox 테마가 주는 변수라, 없을 때를 대비해 Quartz 기본 변수를 대체값으로 둔다. */\n.garden-home {\n  display: flex;\n  flex-direction: column;\n  gap: 1.5rem;\n  margin-top: 1.5rem;\n}\n\n.garden-home-section h3 {\n  margin-bottom: 0.5rem;\n}\n\n.garden-home-placeholder .garden-home-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n.garden-home-contact ul {\n  margin: 0;\n  padding-left: 1.2rem;\n}\n\n/* ---------- ② 정원 ---------- */\n\n/* 모바일(≤800px, Quartz 의 mobile 기준)은 좁은 이랑, 그보다 넓으면 넓은 이랑. 식물 크기는 같고\n   칸 간격만 넓어진다. 보이지 않는 쪽은 display:none 이라 스크린리더·탭 순서에서도 빠진다. */\n.gp-beds {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n}\n.gp-beds-wide {\n  display: none;\n}\n@media (min-width: 801px) {\n  .gp-beds-narrow {\n    display: none;\n  }\n  .gp-beds-wide {\n    display: flex;\n  }\n}\n\n.gp-row {\n  display: block;\n  width: 100%;\n  height: auto;\n  overflow: visible;\n}\n\n.gp-legend {\n  margin: 0.5rem 0 0;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n\n/* 흙 단면 */\n.gp-soil {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 32%, var(--light));\n}\n.gp-soil-deep {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 20%, var(--light));\n}\n.gp-soil-line {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 60%, var(--light));\n  stroke-width: 1.2;\n}\n.gp-pebble {\n  fill: color-mix(in srgb, var(--gray) 70%, var(--light));\n}\n\n/* 씨앗: 아직 없는 노트를 가리키는 링크 */\n.gp-seed ellipse {\n  fill: color-mix(in srgb, var(--color-yellow, var(--tertiary)) 75%, var(--light));\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 70%, var(--light));\n  stroke-width: 0.6;\n}\n\n/* 식물 */\n.gp-stroke {\n  fill: none;\n  stroke: var(--color-green, var(--secondary));\n  stroke-width: 1.6;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n.gp-vine {\n  stroke-width: 1.8;\n}\n.gp-leaf {\n  fill: var(--color-green, var(--secondary));\n}\n.gp-petal-a {\n  fill: var(--color-pink, var(--tertiary));\n}\n.gp-petal-b {\n  fill: var(--color-yellow, var(--tertiary));\n}\n.gp-petal-c {\n  fill: var(--color-purple, var(--secondary));\n}\n.gp-flower-heart {\n  fill: var(--color-orange, var(--secondary));\n}\n.gp-trunk {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 60%, var(--light));\n}\n.gp-canopy {\n  fill: color-mix(in srgb, var(--color-green, var(--secondary)) 72%, var(--light));\n}\n.gp-canopy-top {\n  fill: var(--color-green, var(--secondary));\n}\n\n/* 시든 식물(마지막 수정 후 wither_after_days 가 지남)은 회색 */\n.gp-plant.is-wilted .gp-stroke {\n  stroke: var(--gray);\n}\n.gp-plant.is-wilted :is(.gp-leaf, .gp-petal-a, .gp-petal-b, .gp-petal-c, .gp-flower-heart, .gp-canopy) {\n  fill: var(--gray);\n}\n.gp-plant.is-wilted .gp-trunk {\n  fill: color-mix(in srgb, var(--gray) 70%, var(--light));\n}\n\n/* 가리키거나 키보드로 고르면 조금 밝게(움직임 없음) */\n.gp-plant {\n  cursor: pointer;\n}\n.gp-plant:hover > g,\n.gp-plant:focus-visible > g {\n  filter: brightness(1.25);\n}\n.gp-plant:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n"
  return Component
}
