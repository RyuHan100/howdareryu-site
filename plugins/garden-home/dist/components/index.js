// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.
// ② 정원 — scribbled notes 의 노트 하나가 식물 하나. 빌드할 때 SVG 문자열로 만든다.
// 상호작용·움직임(선택 패널, 뿌리, 흔들림, 타임랩스)은 이 파일이 만든 data-* 속성을
// garden-interactive.js(afterDOMLoaded)가 읽어서 한다 — 이 파일은 순수 서버 렌더링만.
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

/** note 의 링크·백링크 중 "이 정원(scribbled notes)의 다른 식물"만 남긴다 — 뿌리는 정원
 * 안에서만 그린다(정원 밖 노트로 가는 화살은 이미 씨앗/일반 링크로 따로 있다). */
function relatedGardenSlugs(note, slugSet) {
  const set = new Set()
  for (const l of note.links ?? []) {
    if (l.slug !== note.slug && slugSet.has(l.slug)) set.add(l.slug)
  }
  for (const s of note.backlinkFrom ?? []) {
    if (s !== note.slug && slugSet.has(s)) set.add(s)
  }
  return [...set]
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

function renderRow(row, rowIndex, layout, labels, slugSet) {
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
    // 바람에 흔들리는 정도(각도·주기)는 위치 배치와 같은 방식(해시 시드)으로 정해서, 다시
    // 빌드해도 같은 식물이 같은 흔들림을 갖는다. 흔들림은 내부 <g>(gp-sway)에서만 CSS
    // transform 으로 하고, 바깥 <g> 의 translate(위치)는 SVG 속성 그대로 둔다 — 같은 요소에
    // CSS transform 을 쓰면 이 속성이 무시돼 자리가 흐트러진다.
    const swayDelay = f(rnd(seed, 300) * 4)
    const swayDur = f(3.2 + rnd(seed, 301) * 1.6)
    const related = relatedGardenSlugs(note, slugSet)
    plants.push({
      kind,
      svg:
        `<a href="./${esc(note.slug)}" data-router-ignore class="gp-plant gp-kind-${kind}${wilted ? " is-wilted" : ""}"` +
        ` aria-label="${esc(name)}" aria-expanded="false"` +
        ` data-slug="${esc(note.slug)}" data-title="${esc(note.title)}" data-kind="${esc(label)}"` +
        ` data-wilted="${wilted ? "true" : "false"}" data-modified="${esc(note.modified ?? "")}"` +
        ` data-created="${esc(note.created ?? "")}" data-links="${esc(related.join(","))}">` +
        `<title>${esc(name)}</title>` +
        `<g transform="translate(${f(x)} ${f(y)})">` +
        `<g class="gp-sway" style="animation-delay:${swayDelay}s;animation-duration:${swayDur}s">${SHAPES[kind](seed, sizeOf(note))}</g>` +
        `</g></a>`,
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
  const slugSet = new Set(notes.map((n) => n.slug))
  // 둘 중 하나는 CSS 에서 display:none 이라 화면·스크린리더·탭 순서에서 모두 빠진다.
  // gp-roots 는 처음엔 빈 SVG — 식물을 고르면 클라이언트 스크립트가 뿌리 곡선을 채운다.
  const beds = (name) =>
    `<div class="gp-beds gp-beds-${name}">` +
    rows.map((row, i) => renderRow(row, i, LAYOUTS[name], labels, slugSet)).join("") +
    `<svg class="gp-roots" aria-hidden="true"></svg>` +
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
// (Quartz 는 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). 맨 아래
// Component.css/afterDOMLoaded 의 자리표시자는 build.mjs 가 채우고(문자열 그대로 두 번 나오면
// build.mjs 의 string.replace 가 첫 번째 것만 바꾸므로, 이 이름을 다른 주석에 다시 적지 않는다),
// garden-svg.js 는 build.mjs 가 이 파일 앞에 붙인다. 정원의 상호작용·움직임(garden-interactive.js)
// 은 prefers-reduced-motion 을 지킨다(CLAUDE.md §9). 이 컴포넌트는 quartz.config.yaml 에서
// layout.condition: "index" 로 등록해 홈에서만 나오게 한다.
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

// ② 정원 — garden-svg.js 의 renderGarden 이 만든 SVG 를 그대로 넣는다. 클릭/키보드로 식물을
// 고르는 패널과 타임랩스 재생 버튼은 마크업만 여기서 만들고(빈 자리), 실제 동작은
// garden-interactive.js(afterDOMLoaded, §8)가 한다.
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
      h("div", {
        class: "gp-controls",
        children: [
          h("button", { type: "button", class: "gp-play", children: "▶ 타임랩스로 보기" }),
          h("span", { class: "gp-timelapse-date", "aria-live": "polite" }),
        ],
      }),
      h("div", { class: "gp-garden", dangerouslySetInnerHTML: { __html: g.html } }),
      h("p", { class: "gp-legend", children: parts.join(" · ") }),
      h("div", {
        class: "gp-panel",
        role: "status",
        children: [
          h("button", { type: "button", class: "gp-panel-close", "aria-label": "닫기", children: "✕" }),
          h("p", { class: "gp-panel-title" }),
          h("p", { class: "gp-panel-meta" }),
          h("a", { class: "gp-panel-link", children: "노트로 가기 →" }),
        ],
      }),
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

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). 라이트/다크 모드 자동 대응.\n   --color-* 는 hackthebox 테마가 주는 변수라, 없을 때를 대비해 Quartz 기본 변수를 대체값으로 둔다. */\n.garden-home {\n  display: flex;\n  flex-direction: column;\n  gap: 1.5rem;\n  margin-top: 1.5rem;\n}\n\n.garden-home-section h3 {\n  margin-bottom: 0.5rem;\n}\n\n.garden-home-placeholder .garden-home-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n.garden-home-contact ul {\n  margin: 0;\n  padding-left: 1.2rem;\n}\n\n/* ---------- ② 정원 ---------- */\n\n/* 모바일(≤800px, Quartz 의 mobile 기준)은 좁은 이랑, 그보다 넓으면 넓은 이랑. 식물 크기는 같고\n   칸 간격만 넓어진다. 보이지 않는 쪽은 display:none 이라 스크린리더·탭 순서에서도 빠진다. */\n.gp-beds {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n}\n.gp-beds-wide {\n  display: none;\n}\n@media (min-width: 801px) {\n  .gp-beds-narrow {\n    display: none;\n  }\n  .gp-beds-wide {\n    display: flex;\n  }\n}\n\n.gp-row {\n  display: block;\n  width: 100%;\n  height: auto;\n  overflow: visible;\n}\n\n.gp-legend {\n  margin: 0.5rem 0 0;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n\n/* 흙 단면 */\n.gp-soil {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 32%, var(--light));\n}\n.gp-soil-deep {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 20%, var(--light));\n}\n.gp-soil-line {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 60%, var(--light));\n  stroke-width: 1.2;\n}\n.gp-pebble {\n  fill: color-mix(in srgb, var(--gray) 70%, var(--light));\n}\n\n/* 씨앗: 아직 없는 노트를 가리키는 링크 */\n.gp-seed ellipse {\n  fill: color-mix(in srgb, var(--color-yellow, var(--tertiary)) 75%, var(--light));\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 70%, var(--light));\n  stroke-width: 0.6;\n}\n\n/* 식물 */\n.gp-stroke {\n  fill: none;\n  stroke: var(--color-green, var(--secondary));\n  stroke-width: 1.6;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n.gp-vine {\n  stroke-width: 1.8;\n}\n.gp-leaf {\n  fill: var(--color-green, var(--secondary));\n}\n.gp-petal-a {\n  fill: var(--color-pink, var(--tertiary));\n}\n.gp-petal-b {\n  fill: var(--color-yellow, var(--tertiary));\n}\n.gp-petal-c {\n  fill: var(--color-purple, var(--secondary));\n}\n.gp-flower-heart {\n  fill: var(--color-orange, var(--secondary));\n}\n.gp-trunk {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 60%, var(--light));\n}\n.gp-canopy {\n  fill: color-mix(in srgb, var(--color-green, var(--secondary)) 72%, var(--light));\n}\n.gp-canopy-top {\n  fill: var(--color-green, var(--secondary));\n}\n\n/* 시든 식물(마지막 수정 후 wither_after_days 가 지남)은 회색 */\n.gp-plant.is-wilted .gp-stroke {\n  stroke: var(--gray);\n}\n.gp-plant.is-wilted :is(.gp-leaf, .gp-petal-a, .gp-petal-b, .gp-petal-c, .gp-flower-heart, .gp-canopy) {\n  fill: var(--gray);\n}\n.gp-plant.is-wilted .gp-trunk {\n  fill: color-mix(in srgb, var(--gray) 70%, var(--light));\n}\n\n/* 가리키거나 키보드로 고르면 조금 밝게(움직임 없음) */\n.gp-plant {\n  cursor: pointer;\n}\n.gp-plant:hover > g,\n.gp-plant:focus-visible > g,\n.gp-plant[aria-expanded=\"true\"] > g {\n  filter: brightness(1.25);\n}\n.gp-plant:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n\n/* 바람에 흔들림: 화면에 보이는 이랑(.gp-row.is-visible)만, 모션 최소화 선호 시 완전히 끔\n   (관찰기 자체를 안 붙이지만, CSS 로도 한 번 더 막아 둔다 — CLAUDE.md §9). */\n@media (prefers-reduced-motion: no-preference) {\n  .gp-row.is-visible .gp-sway {\n    animation-name: gp-sway;\n    animation-timing-function: ease-in-out;\n    animation-iteration-count: infinite;\n  }\n}\n@keyframes gp-sway {\n  0%,\n  100% {\n    transform: rotate(0deg);\n  }\n  50% {\n    transform: rotate(0.8deg);\n  }\n}\n.gp-sway {\n  transform-box: fill-box;\n  transform-origin: bottom center;\n}\n\n/* 뿌리: 고른 식물의 링크·백링크만, 평소엔 비어 있다(garden-interactive.js 가 채운다) */\n.gp-beds {\n  position: relative;\n}\n.gp-roots {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  overflow: visible;\n  pointer-events: none;\n}\n.gp-root-line {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 65%, var(--light));\n  stroke-width: 1.5;\n  stroke-dasharray: 2 3;\n  stroke-linecap: round;\n  opacity: 0.9;\n}\n\n/* 타임랩스: 아직 심기지 않은 식물 */\n.gp-plant.gp-future {\n  opacity: 0;\n  pointer-events: none;\n}\n@media (prefers-reduced-motion: no-preference) {\n  .gp-plant {\n    transition: opacity 0.3s ease;\n  }\n}\n\n.gp-controls {\n  display: flex;\n  align-items: center;\n  gap: 0.6rem;\n  flex-wrap: wrap;\n  margin-bottom: 0.4rem;\n}\n.gp-play {\n  font: inherit;\n  cursor: pointer;\n  color: inherit;\n  background: color-mix(in srgb, var(--color-green, var(--secondary)) 16%, transparent);\n  border: 1px solid var(--color-green, var(--secondary));\n  border-radius: 999px;\n  padding: 0.2rem 0.85rem;\n}\n.gp-play:hover {\n  background: color-mix(in srgb, var(--color-green, var(--secondary)) 28%, transparent);\n}\n.gp-timelapse-date {\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n\n/* 고른 식물 정보 패널 */\n.gp-panel {\n  display: none;\n  position: relative;\n  margin-top: 0.6rem;\n  padding: 0.6rem 2rem 0.6rem 0.9rem;\n  border: 1px solid var(--lightgray);\n  border-radius: 0.5rem;\n  background: color-mix(in srgb, var(--color-green, var(--secondary)) 8%, var(--light));\n}\n.gp-panel.is-open {\n  display: block;\n}\n.gp-panel-title {\n  margin: 0 0 0.15rem;\n  font-weight: 600;\n}\n.gp-panel-meta {\n  margin: 0 0 0.35rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.gp-panel-link {\n  font-size: 0.9rem;\n}\n.gp-panel-close {\n  position: absolute;\n  top: 0.4rem;\n  right: 0.5rem;\n  cursor: pointer;\n  background: none;\n  border: none;\n  color: var(--gray);\n  font-size: 0.9rem;\n  line-height: 1;\n}\n"
  Component.afterDOMLoaded = "// 정원의 상호작용·움직임. component.js 가 Component.afterDOMLoaded 로 붙인다(build.mjs 가\n// 이 파일을 문자열로 넣는다). 홈(index)에서만 존재하는 .garden-home-garden 섹션을 다룬다.\n// SPA 라 nav 이벤트마다 다시 찾아서 건다(quartz/components/scripts/spa.inline.ts 패턴).\n//\n// - 식물을 클릭/키보드로 고르면: 패널에 제목·종류·물 준 날 + 노트로 가는 링크, 그 식물의\n//   뿌리(이 정원 안의 다른 식물로 가는 링크·백링크)만 곡선으로 표시.\n// - 화면에 보이는 이랑(.gp-row)만 살짝 흔들리게(prefers-reduced-motion 이면 아예 안 붙인다).\n// - 재생 버튼: 가장 오래된 식물의 심은 날부터 오늘까지 1주 단위로 식물이 하나씩 나타난다.\n;(function () {\n  function cssEscape(s) {\n    return String(s).replace(/[\"\\\\]/g, \"\\\\$&\")\n  }\n\n  function initGarden(section) {\n    if (!section || section.dataset.gpInit === \"true\") return\n    section.dataset.gpInit = \"true\"\n\n    var plants = Array.prototype.slice.call(section.querySelectorAll(\".gp-plant\"))\n    var panel = section.querySelector(\".gp-panel\")\n    var panelTitle = panel && panel.querySelector(\".gp-panel-title\")\n    var panelMeta = panel && panel.querySelector(\".gp-panel-meta\")\n    var panelLink = panel && panel.querySelector(\".gp-panel-link\")\n    var panelClose = panel && panel.querySelector(\".gp-panel-close\")\n\n    function overlaysOf() {\n      return Array.prototype.slice.call(section.querySelectorAll(\".gp-roots\"))\n    }\n\n    function clearRoots() {\n      overlaysOf().forEach(function (svg) {\n        svg.textContent = \"\"\n      })\n    }\n\n    function drawRoots(plant) {\n      clearRoots()\n      var links = (plant.dataset.links || \"\").split(\",\").filter(Boolean)\n      if (!links.length) return\n      var bed = plant.closest(\".gp-beds\")\n      var overlay = bed && bed.querySelector(\".gp-roots\")\n      if (!bed || !overlay) return\n      var bedRect = bed.getBoundingClientRect()\n      var fromRect = plant.getBoundingClientRect()\n      var fromX = fromRect.left + fromRect.width / 2 - bedRect.left\n      var fromY = fromRect.bottom - bedRect.top - 2\n      var d = \"\"\n      links.forEach(function (slug) {\n        var target = bed.querySelector('.gp-plant[data-slug=\"' + cssEscape(slug) + '\"]')\n        if (!target) return\n        var r = target.getBoundingClientRect()\n        var toX = r.left + r.width / 2 - bedRect.left\n        var toY = r.bottom - bedRect.top - 2\n        var dipY = Math.max(fromY, toY) + 18\n        d += \"M\" + fromX + \" \" + fromY + \"Q\" + (fromX + toX) / 2 + \" \" + dipY + \" \" + toX + \" \" + toY + \" \"\n      })\n      if (d) overlay.innerHTML = '<path class=\"gp-root-line\" d=\"' + d + '\"></path>'\n    }\n\n    function showPanel(plant) {\n      if (!panel) return\n      if (panelTitle) panelTitle.textContent = plant.dataset.title || \"\"\n      var kind = plant.dataset.kind || \"\"\n      var modified = plant.dataset.modified || \"\"\n      if (panelMeta) panelMeta.textContent = [kind, modified ? \"물 준 날 \" + modified : \"\"].filter(Boolean).join(\" · \")\n      if (panelLink) panelLink.setAttribute(\"href\", \"./\" + (plant.dataset.slug || \"\"))\n      panel.classList.add(\"is-open\")\n    }\n\n    function hidePanel() {\n      if (panel) panel.classList.remove(\"is-open\")\n    }\n\n    var selected = null\n\n    function deselect() {\n      selected = null\n      plants.forEach(function (p) {\n        p.setAttribute(\"aria-expanded\", \"false\")\n      })\n      hidePanel()\n      clearRoots()\n    }\n\n    function select(plant) {\n      if (selected === plant) {\n        deselect()\n        return\n      }\n      selected = plant\n      plants.forEach(function (p) {\n        p.setAttribute(\"aria-expanded\", p === plant ? \"true\" : \"false\")\n      })\n      showPanel(plant)\n      drawRoots(plant)\n    }\n\n    plants.forEach(function (p) {\n      p.addEventListener(\"click\", function (e) {\n        e.preventDefault()\n        select(p)\n      })\n      p.addEventListener(\"keydown\", function (e) {\n        if (e.key === \"Enter\" || e.key === \" \" || e.key === \"Spacebar\") {\n          e.preventDefault()\n          select(p)\n        } else if (e.key === \"Escape\") {\n          deselect()\n        }\n      })\n    })\n    if (panelClose) panelClose.addEventListener(\"click\", deselect)\n\n    // 화면에 보이는 이랑만 흔들리게. 모션 최소화를 선호하면 관찰기 자체를 안 붙인다\n    // (CSS 도 같은 media query 로 한 번 더 막아 둔다 — CLAUDE.md §9).\n    if (window.IntersectionObserver && !window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches) {\n      var io = new IntersectionObserver(\n        function (entries) {\n          entries.forEach(function (entry) {\n            entry.target.classList.toggle(\"is-visible\", entry.isIntersecting)\n          })\n        },\n        { rootMargin: \"80px\" },\n      )\n      section.querySelectorAll(\".gp-row\").forEach(function (row) {\n        io.observe(row)\n      })\n      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))\n    }\n\n    // 타임랩스\n    var playBtn = section.querySelector(\".gp-play\")\n    var dateLabel = section.querySelector(\".gp-timelapse-date\")\n    var timer = null\n\n    function stopTimelapse(reveal) {\n      if (timer) {\n        clearInterval(timer)\n        timer = null\n      }\n      if (playBtn) playBtn.textContent = \"▶ 타임랩스로 보기\"\n      if (reveal) {\n        plants.forEach(function (p) {\n          p.classList.remove(\"gp-future\")\n        })\n        if (dateLabel) dateLabel.textContent = \"\"\n      }\n    }\n\n    function weeklySteps(startMs, todayMs) {\n      var steps = []\n      var t = startMs\n      var week = 7 * 24 * 60 * 60 * 1000\n      while (t < todayMs) {\n        steps.push(t)\n        t += week\n      }\n      steps.push(todayMs)\n      return steps\n    }\n\n    function startTimelapse() {\n      var created = plants\n        .map(function (p) {\n          var t = p.dataset.created ? new Date(p.dataset.created).getTime() : NaN\n          return isNaN(t) ? null : t\n        })\n        .filter(function (t) {\n          return t !== null\n        })\n      if (!created.length) return\n      var steps = weeklySteps(Math.min.apply(null, created), Date.now())\n\n      if (playBtn) playBtn.textContent = \"■ 멈추기\"\n      var i = 0\n\n      function frame() {\n        var cur = steps[i]\n        plants.forEach(function (p) {\n          var t = p.dataset.created ? new Date(p.dataset.created).getTime() : NaN\n          var show = isNaN(t) || t <= cur\n          p.classList.toggle(\"gp-future\", !show)\n        })\n        if (dateLabel) dateLabel.textContent = new Date(cur).toISOString().slice(0, 10)\n        i++\n        if (i >= steps.length) stopTimelapse(false)\n      }\n\n      frame()\n      timer = setInterval(frame, 260)\n      if (window.addCleanup) window.addCleanup(function () { stopTimelapse(true) })\n    }\n\n    if (playBtn) {\n      playBtn.addEventListener(\"click\", function () {\n        if (timer) {\n          stopTimelapse(true)\n        } else {\n          startTimelapse()\n        }\n      })\n    }\n\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        section.dataset.gpInit = \"false\"\n      })\n    }\n  }\n\n  function init() {\n    initGarden(document.querySelector(\".garden-home-garden\"))\n  }\n\n  document.addEventListener(\"nav\", init)\n  init()\n})()\n"
  return Component
}
