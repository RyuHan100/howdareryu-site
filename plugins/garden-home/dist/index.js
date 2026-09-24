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

// ③ radar — content/radar/ 하위 폴더 수만큼 부채꼴 구역을 나누고, 각 기록(radar.notes)을
// 점으로 찍는다. 중심 = 오늘, 가장자리(RADAR_R) = 30일 전. 30일보다 오래된 기록은 아예 안 그린다.
// 회전하는 빛줄기(잔상 몇 겹)와 "빛줄기가 지나가면 점이 밝아졌다가 흐려짐"은 CSS 애니메이션으로
// 하고(garden-home.css 의 --radar-sweep-duration 과 반드시 같은 값을 SWEEP_DURATION 에 써야
// 싱크가 맞다), 이 파일은 그 타이밍(각 점의 animation-delay)만 미리 계산해 심어 둔다. 화면
// 밖일 때 멈추는 것·점 클릭 패널은 radar-interactive.js(클라이언트)가 한다.
//
// 각도 규칙: 0°=12시 방향, 시계방향으로 증가(CSS `rotate(deg)`와 같은 방향) — 빛줄기 회전과
// 점의 위치가 같은 좌표계를 써야 "지나갈 때" 계산이 맞는다.

// f/esc/fnv1a/rnd 는 garden-svg.js 에 이미 있다(build.mjs 가 그 파일을 이 파일보다 먼저
// 이어 붙인다 — 같은 스코프에 두 번 선언하면 안 되므로 여기서 다시 만들지 않는다).

const RADAR_SIZE = 320
const RADAR_CENTER = RADAR_SIZE / 2
const RADAR_R = 118
const RADAR_MAX_AGE_DAYS = 30
const RING_STEPS = [10, 20, 30]
// garden-home.css 의 .radar-sweep 애니메이션 duration 과 반드시 같아야 한다(점 반짝임 동기화).
const SWEEP_DURATION_S = 10
const DAY_MS = 24 * 60 * 60 * 1000

/** 컴퍼스 각도(0=12시, 시계방향) → SVG 좌표. */
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

/** 중심에서 뻗어나가는 부채꼴(원점~반지름 r, deg0~deg1, <180°) 경로. */
function wedgePath(cx, cy, r, deg0, deg1) {
  const p0 = polar(cx, cy, r, deg0)
  const p1 = polar(cx, cy, r, deg1)
  return `M${f(cx)} ${f(cy)}L${f(p0.x)} ${f(p0.y)}A${f(r)} ${f(r)} 0 0 1 ${f(p1.x)} ${f(p1.y)}Z`
}

function ageDays(dateStr, now) {
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return (now.getTime() - t) / DAY_MS
}

/** 기록 하나가 이 정원(radar)의 다른 구역과 구분 없이 항상 같은 자리에 찍히도록 해시로 고정. */
function jitterWithinSector(seed, width) {
  return width * (0.15 + rnd(seed, 1) * 0.7)
}

function renderBeam() {
  // "잔상은 몇 겹의 반투명 부채꼴" — 그라디언트가 아니라 진짜 여러 겹을 겹쳐서 만든다.
  const layers = [
    { width: 24, opacity: 0.34, offset: 0 },
    { width: 24, opacity: 0.2, offset: -20 },
    { width: 24, opacity: 0.11, offset: -38 },
    { width: 24, opacity: 0.05, offset: -55 },
  ]
  const wedges = layers
    .map(
      (l) =>
        `<path class="radar-beam-wedge" style="opacity:${l.opacity}" d="${wedgePath(RADAR_CENTER, RADAR_CENTER, RADAR_R, l.offset, l.offset + l.width)}"/>`,
    )
    .join("")
  return `<g class="radar-beam">${wedges}</g>`
}

function renderGrid(sectorCount) {
  const rings = RING_STEPS.map((day) => {
    const r = RADAR_R * (day / RADAR_MAX_AGE_DAYS)
    return `<circle class="radar-ring" cx="${f(RADAR_CENTER)}" cy="${f(RADAR_CENTER)}" r="${f(r)}"/>`
  }).join("")
  const ringLabels = RING_STEPS.map((day) => {
    const r = RADAR_R * (day / RADAR_MAX_AGE_DAYS)
    return `<text class="radar-ring-label" x="${f(RADAR_CENTER + 3)}" y="${f(RADAR_CENTER - r + 9)}">${day}일</text>`
  }).join("")
  const dividers =
    sectorCount > 1
      ? Array.from({ length: sectorCount }, (_, i) => {
          const deg = (i * 360) / sectorCount
          const p = polar(RADAR_CENTER, RADAR_CENTER, RADAR_R, deg)
          return `<line class="radar-divider" x1="${f(RADAR_CENTER)}" y1="${f(RADAR_CENTER)}" x2="${f(p.x)}" y2="${f(p.y)}"/>`
        }).join("")
      : ""
  return (
    `<circle class="radar-face" cx="${f(RADAR_CENTER)}" cy="${f(RADAR_CENTER)}" r="${f(RADAR_R)}"/>` +
    rings +
    dividers +
    ringLabels
  )
}

function renderSectorLabels(subfolders) {
  const n = subfolders.length
  return subfolders
    .map((s, i) => {
      const mid = ((i + 0.5) * 360) / n
      const p = polar(RADAR_CENTER, RADAR_CENTER, RADAR_R + 14, mid)
      const rad = (mid * Math.PI) / 180
      const sin = Math.sin(rad)
      const anchor = sin > 0.2 ? "start" : sin < -0.2 ? "end" : "middle"
      return (
        `<text class="radar-sector-label" style="--sector-color:${esc(s.color)}" x="${f(p.x)}" y="${f(p.y)}" text-anchor="${anchor}">` +
        `${esc(s.label)}</text>`
      )
    })
    .join("")
}

function renderDots(notes, subfolders, now) {
  const n = subfolders.length
  const indexOf = new Map(subfolders.map((s, i) => [s.name, i]))
  const dots = []
  for (const note of notes) {
    // isIndex(폴더 자기 자신의 index.md)는 보통 기록이 아니라 안내 페이지라 빼지만, revision
    // 단위(§8.2, 예: PACM)는 노트 하나가 index.md 라도 이력 자체가 진짜 기록이라 남긴다.
    if (note.isIndex && !note.revision) continue
    const age = ageDays(note.date, now)
    if (age === null || age < 0 || age > RADAR_MAX_AGE_DAYS) continue
    const i = indexOf.get(note.subfolder) ?? 0
    const sector = subfolders[i] ?? { color: "var(--secondary)" }
    const sectorStart = (i * 360) / n
    const sectorWidth = 360 / n
    const seed = `${note.subfolder}|${note.slug}|${note.date}`
    const deg = sectorStart + jitterWithinSector(seed, sectorWidth)
    const r = RADAR_R * (age / RADAR_MAX_AGE_DAYS)
    const p = polar(RADAR_CENTER, RADAR_CENTER, r, deg)
    // 빛줄기가 이 각도를 지날 때(전체 회전 중 deg/360 지점) 점이 반짝이도록, 같은 주기(SWEEP_DURATION_S)
    // 안에서 그 시점에 맞춰 딜레이를 준다 — 회전(garden-home.css)과 반드시 같은 duration 을 써야 맞는다.
    const delay = f((deg / 360) * SWEEP_DURATION_S)
    const label = note.revision ? note.revision.summary || note.title : note.title
    dots.push(
      `<circle class="radar-dot" style="--sector-color:${esc(sector.color)};animation-delay:${delay}s"` +
        ` cx="${f(p.x)}" cy="${f(p.y)}" r="3.2"` +
        ` data-subfolder="${esc(sector.label)}" data-date="${esc(note.date)}" data-title="${esc(label)}"` +
        ` data-slug="${esc(note.slug)}" tabindex="0" role="button"` +
        ` aria-label="${esc(`${sector.label} · ${note.date} · ${label}`)}"><title>${esc(label)}</title></circle>`,
    )
  }
  return dots.join("")
}

/**
 * radar 전체 SVG 문자열과 요약. subfolders/notes 는 garden-data.json 의 radar.subfolders/notes.
 * now 는 collectGardenData 가 쓴 시각이 아니라 렌더링 시점(빌드 시점) — 클라이언트 빛줄기와
 * 점의 상대적 배치만 미리 계산해 두는 것이라, 실제 "오늘"은 어차피 매 빌드마다 다시 계산된다.
 */
function renderRadar(subfolders, notes, now) {
  const list = subfolders.length > 0 ? subfolders : [{ name: "", label: "radar", color: "var(--secondary)" }]
  const dotsSvg = renderDots(notes, list, now)
  const dotCount = (dotsSvg.match(/<circle class="radar-dot"/g) ?? []).length
  const svg =
    `<svg class="radar-dial" viewBox="0 0 ${RADAR_SIZE} ${RADAR_SIZE}" role="group" aria-label="radar — 최근 30일 기록 ${dotCount}개" xmlns="http://www.w3.org/2000/svg">` +
    renderGrid(list.length) +
    renderSectorLabels(list) +
    renderBeam() +
    dotsSvg +
    `</svg>`
  return { html: svg, count: dotCount }
}

// ④ 아빠의 화단 — 홈 슬라이드쇼의 진행 표시(꽃봉오리 화단)만 SVG로 만든다. 슬라이드 자체는
// <img>(썸네일)이라 여기서 그릴 게 없다. f/esc 는 garden-svg.js 에 이미 있어서 다시 안 만든다
// (build.mjs 가 garden-svg.js 를 먼저 붙인다).

/** 닫힌 꽃봉오리 — 진행 표시에서 "아직 안 본 그림". */
function bud() {
  return (
    `<path class="gb-stem" d="M10 20L10 11"/>` +
    `<path class="gb-bud" d="M10 3C6.5 3 5 6 5 9C5 11.8 7.2 13.5 10 13.5C12.8 13.5 15 11.8 15 9C15 6 13.5 3 10 3Z"/>`
  )
}

/** 활짝 핀 꽃 — 진행 표시에서 "지금 보는 그림". garden-svg.js 의 flower() 와 같은 얼굴이지만
 * 슬라이드 진행 표시용으로 흔들림 시드 없이 고정된 모양 하나만 쓴다. */
function bloom() {
  const cx = 10
  const cy = 7
  const pr = 3.4
  let petals = ""
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(a) * pr * 1.15
    const y = cy + Math.sin(a) * pr * 1.15
    petals += `<circle class="gb-petal-${k % 3}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${pr}"/>`
  }
  return (
    `<path class="gb-stem" d="M10 20L10 11"/>` +
    petals +
    `<circle class="gb-heart" cx="${cx}" cy="${cy}" r="2.1"/>`
  )
}

/** 진행 표시 화단: 그림 수만큼 봉오리, activeIndex 만 꽃. 각 버튼에 data-index 를 심어 둔다. */
function renderGalleryBuds(count, activeIndex) {
  let out = ""
  for (let i = 0; i < count; i++) {
    const active = i === activeIndex
    out +=
      `<button type="button" class="gallery-bud${active ? " is-active" : ""}" data-index="${i}"` +
      ` aria-label="${i + 1}번째 그림" aria-selected="${active}" role="tab">` +
      `<svg viewBox="0 0 20 22" class="gallery-bud-svg" aria-hidden="true">${active ? bloom() : bud()}</svg>` +
      `</button>`
  }
  return out
}

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

// climate histography 를 홈에도 통째로 넣는다(radar 아래, 아빠의 화단 위 — 사용자 지시,
// 2026-09-23). 렌더 함수(renderTimeline)는 plugins/climate-timeline/src/timeline-render.js
// 그 파일 그대로다 — build.mjs 가 이 파일 바로 앞에 이어 붙인다(아래 참고). 그래서 이벤트를
// climate-timeline.json 에 추가하면 /timeline/ 페이지와 홈이 같은 함수·같은 데이터를 쓰므로
// 둘 다 같이 바뀐다(따로 맞춰줄 필요 없음). 데이터 파일 경로만 여기서 다시 적는다(다른 plugin
// 소스라 import 는 안 되지만, node:fs 로 읽는 경로 상수는 새로 선언해야 한다).
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
      h("p", {
        class: "sr-only",
        children:
          "최근 쓴 글을 식물로 표현합니다. 식물 하나가 노트 하나이고 모양은 풀·꽃·덩굴·나무 중 그 글의 성격을 나타내며, 시든(흙빛) 식물은 오래 손보지 않은 글입니다. 식물을 선택하면 제목·물 준 날·노트로 가는 링크가 나옵니다.",
      }),
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

// ③ radar — radar-svg.js 의 renderRadar 가 만든 SVG 를 그대로 넣는다. 점 클릭 패널·화면 밖
// 정지는 radar-interactive.js(afterDOMLoaded)가 한다.
function radarSection() {
  const data = readGardenData()
  const subfolders = data?.radar?.subfolders ?? []
  const notes = data?.radar?.notes ?? []
  if (subfolders.length === 0) {
    return placeholder("radar", "radar 폴더가 아직 없어요.")
  }
  const r = renderRadar(subfolders, notes, new Date())
  const legend = subfolders
    .map((s) => `${s.label} ${s.count}`)
    .join(" · ")
  return h("section", {
    class: "garden-home-section garden-home-radar",
    children: [
      h("h3", { children: "radar" }),
      h("p", {
        class: "sr-only",
        children:
          "감시 중인 폴더별로 부채꼴 구역을 나누고, 최근 30일 안의 기록을 점으로 표시합니다. 중심에 가까울수록 최근 기록이고 가장자리는 30일 전입니다. 점을 선택하면 구역·날짜·제목과 노트로 가는 링크가 나옵니다.",
      }),
      h("div", { class: "radar-face-wrap", dangerouslySetInnerHTML: { __html: r.html } }),
      h("p", { class: "gp-legend", children: `최근 30일 ${r.count}건 · ${legend}` }),
      h("div", {
        class: "gp-panel radar-panel",
        role: "status",
        children: [
          h("button", { type: "button", class: "gp-panel-close", "aria-label": "닫기", children: "✕" }),
          h("p", {
            class: "gp-panel-meta",
            children: [
              h("span", { class: "radar-panel-subfolder" }),
              text(" · "),
              h("span", { class: "radar-panel-date" }),
            ],
          }),
          h("p", { class: "gp-panel-title radar-panel-title" }),
          h("a", { class: "gp-panel-link radar-panel-link", children: "노트로 가기 →" }),
        ],
      }),
    ],
  })
}

/** 캡션: 제목·연도·재료·작가. 있는 것만 이어 붙이고, 하나도 없으면 null(칸 자체를 안 만든다). */
function galleryCaption(img, artist) {
  const parts = [img.title, img.year ? `${img.year}년` : null, img.material, artist].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

// ④ 아빠의 화단 — 최근 그림을 4초마다 겹쳐지며 넘기는 슬라이드쇼. 실제 넘기기·일시정지·재생·
// 화면 밖 정지는 gallery-interactive.js(afterDOMLoaded)가 한다. 그림 정보(썸네일·크기·연도 등)는
// 여기서 data-* 로 각 슬라이드에 미리 심어 둔다.
function gallerySection() {
  const data = readGardenData()
  const images = data?.gallery?.images ?? []
  const cfg = data?.config?.gallery ?? {}
  const artist = cfg.artist || ""
  if (images.length === 0) {
    return placeholder("아빠의 화단", "아직 올린 그림이 없어요.")
  }
  const count = Math.max(1, Number(cfg.home_count) || 10)
  const intervalMs = Math.max(1, Number(cfg.interval_seconds) || 4) * 1000
  const recent = images.slice(0, count)

  // 슬라이드 상자 비율: 첫 그림 기준(없으면 4:3) — 그림마다 비율이 달라도 object-fit:contain 이라
  // 안 잘리고, 상자 크기는 고정이라 로딩 중에도 안 흔들린다.
  const first = recent.find((img) => img.width && img.height)
  const ratio = first ? `${first.width} / ${first.height}` : "4 / 3"

  const slides = recent.map((img, i) => {
    const alt = galleryCaption(img, artist) ?? "작품 이미지"
    const caption = galleryCaption(img, artist)
    return h("figure", {
      class: `gallery-slide${i === 0 ? " is-active" : ""}`,
      "data-index": String(i),
      children: [
        h("img", {
          src: img.thumb,
          alt,
          width: img.width || undefined,
          height: img.height || undefined,
          loading: i === 0 ? "eager" : "lazy",
        }),
        caption ? h("figcaption", { class: "gallery-caption", children: caption }) : null,
      ].filter(Boolean),
    })
  })

  return h("section", {
    class: "garden-home-section garden-home-gallery",
    "data-interval-ms": String(intervalMs),
    children: [
      h("h3", { children: "아빠의 화단" }),
      h("p", {
        class: "sr-only",
        children:
          "아버지의 그림을 최근 순서로 보여주는 슬라이드쇼입니다. 자동으로 넘어가며, 좌우 버튼이나 아래 꽃봉오리 목록으로 그림을 고를 수 있습니다.",
      }),
      cfg.intro ? h("p", { class: "gp-legend gallery-intro", children: cfg.intro }) : null,
      h("div", {
        class: "gallery-slideshow",
        children: [
          h("div", {
            class: "gallery-slide-track",
            style: `aspect-ratio:${ratio}`,
            children: slides,
          }),
          h("button", { type: "button", class: "gallery-nav gallery-prev", "aria-label": "이전 그림", children: "‹" }),
          h("button", { type: "button", class: "gallery-nav gallery-next", "aria-label": "다음 그림", children: "›" }),
          h("button", { type: "button", class: "gallery-play", "aria-label": "일시정지", children: "❙❙" }),
        ],
      }),
      h("div", {
        class: "gallery-buds",
        role: "tablist",
        "aria-label": "그림 목록",
        dangerouslySetInnerHTML: { __html: renderGalleryBuds(recent.length, 0) },
      }),
      h("a", { class: "gallery-view-all", href: "./gallery", children: "전체 보기 →" }),
    ].filter(Boolean),
  })
}

// ③.5 climate histography — radar 아래, 아빠의 화단 위(사용자 지시, 2026-09-23). 미리보기가
// 아니라 /timeline/ 과 똑같은 전체 타임라인을 그대로 넣는다 — renderTimeline() 은
// climate-timeline 플러그인의 timeline-render.js 그 함수이고(build.mjs 가 이어 붙임), CSS도
// climate-timeline 플러그인이 전역 번들에 실어 두므로(모든 페이지가 모든 컴포넌트 CSS 청크를
// 불러온다) 여기서 따로 만들 필요가 없다. 상호작용(필터·클릭 상세 모달)도 timeline-interactive.js
// 가 ".climate-timeline" 클래스를 그대로 찾으므로 클래스 이름을 /timeline/ 페이지와 동일하게 둔다.
function timelineFullSection() {
  const data = readTimelineData()
  const events = data?.events ?? []
  const categories = data?.categories ?? []
  const html = events.length > 0 ? renderTimeline(events, categories) : null

  if (!html) {
    return placeholder("climate histography", "아직 연표에 채운 사건이 없어요.")
  }

  return h("section", {
    class: "garden-home-section climate-timeline",
    children: [
      h("h3", { children: "climate histography" }),
      h("p", {
        class: "sr-only",
        children:
          "1824년부터 지금까지 기후 관련 사건을 월 단위로 배치한 가로 타임라인입니다. 위 카테고리 버튼으로 필터링할 수 있고, 타임라인 영역만 가로로 스크롤됩니다.",
      }),
      h("div", { dangerouslySetInnerHTML: { __html: html } }),
      h("a", { class: "garden-home-timeline-link", href: "./timeline", children: "전체 화면으로 보기 →" }),
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
    if (show.radar) sections.push(radarSection())
    sections.push(timelineFullSection())
    if (show.gallery) sections.push(gallerySection())
    sections.push(contactSection())

    return h("div", {
      class: [displayClass, "garden-home"].filter(Boolean).join(" "),
      children: sections,
    })
  }

  Component.css = "/* 색은 전부 테마 CSS 변수를 쓴다(하드코딩 금지 — CLAUDE.md §9). 라이트/다크 모드 자동 대응.\n   --color-* 는 hackthebox 테마가 주는 변수라, 없을 때를 대비해 Quartz 기본 변수를 대체값으로 둔다. */\n.garden-home {\n  display: flex;\n  flex-direction: column;\n  gap: 1.5rem;\n  margin-top: 1.5rem;\n}\n\n/* 화면에는 안 보이고 스크린리더에만 읽히는 설명(정원/radar/아빠의 화단이 무엇을 보여주는지). */\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n.garden-home-section h3 {\n  margin-bottom: 0.5rem;\n}\n\n.garden-home-placeholder .garden-home-note {\n  color: var(--gray);\n  font-style: italic;\n}\n\n.garden-home-contact ul {\n  margin: 0;\n  padding-left: 1.2rem;\n}\n\n/* ---------- ② 정원 ---------- */\n\n/* 모바일(≤800px, Quartz 의 mobile 기준)은 좁은 이랑, 그보다 넓으면 넓은 이랑. 식물 크기는 같고\n   칸 간격만 넓어진다. 보이지 않는 쪽은 display:none 이라 스크린리더·탭 순서에서도 빠진다. */\n.gp-beds {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n}\n.gp-beds-wide {\n  display: none;\n}\n@media (min-width: 801px) {\n  .gp-beds-narrow {\n    display: none;\n  }\n  .gp-beds-wide {\n    display: flex;\n  }\n}\n\n.gp-row {\n  display: block;\n  width: 100%;\n  height: auto;\n  overflow: visible;\n}\n\n.gp-legend {\n  margin: 0.5rem 0 0;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n\n/* 흙 단면 */\n.gp-soil {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 32%, var(--light));\n}\n.gp-soil-deep {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 20%, var(--light));\n}\n.gp-soil-line {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 60%, var(--light));\n  stroke-width: 1.2;\n}\n.gp-pebble {\n  fill: color-mix(in srgb, var(--gray) 70%, var(--light));\n}\n\n/* 씨앗: 아직 없는 노트를 가리키는 링크 */\n.gp-seed ellipse {\n  fill: color-mix(in srgb, var(--color-yellow, var(--tertiary)) 75%, var(--light));\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 70%, var(--light));\n  stroke-width: 0.6;\n}\n\n/* 식물 */\n.gp-stroke {\n  fill: none;\n  stroke: var(--color-green, var(--secondary));\n  stroke-width: 1.6;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n.gp-vine {\n  stroke-width: 1.8;\n}\n.gp-leaf {\n  fill: var(--color-green, var(--secondary));\n}\n.gp-petal-a {\n  fill: var(--color-pink, var(--tertiary));\n}\n.gp-petal-b {\n  fill: var(--color-yellow, var(--tertiary));\n}\n.gp-petal-c {\n  fill: var(--color-purple, var(--secondary));\n}\n.gp-flower-heart {\n  fill: var(--color-orange, var(--secondary));\n}\n.gp-trunk {\n  fill: color-mix(in srgb, var(--color-orange, var(--darkgray)) 60%, var(--light));\n}\n.gp-canopy {\n  fill: color-mix(in srgb, var(--color-green, var(--secondary)) 72%, var(--light));\n}\n.gp-canopy-top {\n  fill: var(--color-green, var(--secondary));\n}\n\n/* 시든 식물(마지막 수정 후 wither_after_days 가 지남)은 회색 */\n.gp-plant.is-wilted .gp-stroke {\n  stroke: var(--gray);\n}\n.gp-plant.is-wilted :is(.gp-leaf, .gp-petal-a, .gp-petal-b, .gp-petal-c, .gp-flower-heart, .gp-canopy) {\n  fill: var(--gray);\n}\n.gp-plant.is-wilted .gp-trunk {\n  fill: color-mix(in srgb, var(--gray) 70%, var(--light));\n}\n\n/* 가리키거나 키보드로 고르면 조금 밝게(움직임 없음) */\n.gp-plant {\n  cursor: pointer;\n}\n.gp-plant:hover > g,\n.gp-plant:focus-visible > g,\n.gp-plant[aria-expanded=\"true\"] > g {\n  filter: brightness(1.25);\n}\n.gp-plant:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 2px;\n}\n\n/* 바람에 흔들림: 화면에 보이는 이랑(.gp-row.is-visible)만, 모션 최소화 선호 시 완전히 끔\n   (관찰기 자체를 안 붙이지만, CSS 로도 한 번 더 막아 둔다 — CLAUDE.md §9). */\n@media (prefers-reduced-motion: no-preference) {\n  .gp-row.is-visible .gp-sway {\n    animation-name: gp-sway;\n    animation-timing-function: ease-in-out;\n    animation-iteration-count: infinite;\n  }\n}\n@keyframes gp-sway {\n  0%,\n  100% {\n    transform: rotate(0deg);\n  }\n  50% {\n    transform: rotate(0.8deg);\n  }\n}\n.gp-sway {\n  transform-box: fill-box;\n  transform-origin: bottom center;\n}\n\n/* 뿌리: 고른 식물의 링크·백링크만, 평소엔 비어 있다(garden-interactive.js 가 채운다) */\n.gp-beds {\n  position: relative;\n}\n.gp-roots {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  overflow: visible;\n  pointer-events: none;\n}\n.gp-root-line {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-orange, var(--darkgray)) 65%, var(--light));\n  stroke-width: 1.5;\n  stroke-dasharray: 2 3;\n  stroke-linecap: round;\n  opacity: 0.9;\n}\n\n/* 타임랩스: 아직 심기지 않은 식물 */\n.gp-plant.gp-future {\n  opacity: 0;\n  pointer-events: none;\n}\n@media (prefers-reduced-motion: no-preference) {\n  .gp-plant {\n    transition: opacity 0.3s ease;\n  }\n}\n\n.gp-controls {\n  display: flex;\n  align-items: center;\n  gap: 0.6rem;\n  flex-wrap: wrap;\n  margin-bottom: 0.4rem;\n}\n.gp-play {\n  font: inherit;\n  cursor: pointer;\n  color: inherit;\n  background: color-mix(in srgb, var(--color-green, var(--secondary)) 16%, transparent);\n  border: 1px solid var(--color-green, var(--secondary));\n  border-radius: 999px;\n  padding: 0.2rem 0.85rem;\n}\n.gp-play:hover {\n  background: color-mix(in srgb, var(--color-green, var(--secondary)) 28%, transparent);\n}\n.gp-timelapse-date {\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n\n/* 고른 식물 정보 패널 */\n.gp-panel {\n  display: none;\n  position: relative;\n  margin-top: 0.6rem;\n  padding: 0.6rem 2rem 0.6rem 0.9rem;\n  /* --lightgray 는 이 다크 테마에서 배경과 거의 같은 색이라 안 보인다(위 .radar-face 주석과 같은\n     함정) — --gray 를 옅게 섞어 실제로 보이는 경계선을 만든다. */\n  border: 1px solid color-mix(in srgb, var(--gray) 40%, var(--light));\n  border-radius: 0.5rem;\n  background: color-mix(in srgb, var(--color-green, var(--secondary)) 8%, var(--light));\n}\n.gp-panel.is-open {\n  display: block;\n}\n.gp-panel-title {\n  margin: 0 0 0.15rem;\n  font-weight: 600;\n}\n.gp-panel-meta {\n  margin: 0 0 0.35rem;\n  font-size: 0.85rem;\n  color: var(--gray);\n}\n.gp-panel-link {\n  font-size: 0.9rem;\n}\n.gp-panel-close {\n  position: absolute;\n  top: 0.4rem;\n  right: 0.5rem;\n  cursor: pointer;\n  background: none;\n  border: none;\n  color: var(--gray);\n  font-size: 0.9rem;\n  line-height: 1;\n}\n\n/* ---------- ③ radar ---------- */\n\n.radar-face-wrap {\n  display: flex;\n  justify-content: center;\n}\n.radar-dial {\n  width: 100%;\n  max-width: 320px;\n  height: auto;\n  overflow: visible;\n}\n\n.radar-face {\n  fill: color-mix(in srgb, var(--color-green, var(--secondary)) 5%, var(--light));\n  /* hackthebox 테마에서 --lightgray 는 배경(--light)과 거의 같은 어두운 남색이라 안 보인다\n     (다크 테마라 밝은/어두운 회색의 이름과 실제 밝기가 뒤집혀 있음 — CLAUDE.md §4 함정).\n     --gray 가 실제로 밝은, 눈에 보이는 회색이라 격자선은 전부 이걸로 옅게 섞어 쓴다. */\n  stroke: color-mix(in srgb, var(--gray) 55%, var(--light));\n  stroke-width: 1;\n}\n.radar-ring {\n  fill: none;\n  stroke: color-mix(in srgb, var(--gray) 45%, var(--light));\n  stroke-width: 0.75;\n  stroke-dasharray: 2 3;\n}\n.radar-ring-label {\n  fill: var(--gray);\n  font-size: 7px;\n}\n.radar-divider {\n  stroke: color-mix(in srgb, var(--gray) 45%, var(--light));\n  stroke-width: 0.75;\n}\n.radar-sector-label {\n  fill: var(--sector-color, var(--gray));\n  font-size: 9px;\n}\n\n/* 빛줄기: 몇 겹의 반투명 부채꼴이 같은 <g> 안에서 함께 돈다. 기본은 정지(멈춰 있는 부채꼴) —\n   화면 안에 있고(.radar-is-visible) 모션 최소화를 선호하지 않을 때만 돈다. */\n.radar-beam-wedge {\n  fill: var(--color-green, var(--secondary));\n}\n.radar-beam {\n  /* fill-box 를 쓰면 부채꼴(자기 자신)의 바운딩 박스 중심을 기준으로 돌아서, 부채꼴이 원 중앙이\n     아닌 자기 박스 중심을 축으로 삥 돈다(실제로 그렇게 어긋나는 걸 확인함) — view-box 로 SVG\n     좌표계 자체의 (160,160)을 기준으로 삼아야 원 중앙과 정확히 맞는다. 160 은 radar-svg.js 의\n     RADAR_CENTER(=RADAR_SIZE/2)와 반드시 같아야 한다. */\n  transform-box: view-box;\n  transform-origin: 160px 160px;\n}\n@media (prefers-reduced-motion: no-preference) {\n  .radar-beam {\n    /* garden-svg.js 의 SWEEP_DURATION_S 와 반드시 같은 값(점 반짝임 딜레이가 이 값으로 계산됨) */\n    animation: radar-sweep 10s linear infinite;\n    animation-play-state: paused;\n  }\n  .garden-home-radar.radar-is-visible .radar-beam {\n    animation-play-state: running;\n  }\n}\n@keyframes radar-sweep {\n  from {\n    transform: rotate(0deg);\n  }\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n/* 점: 평소엔 옅게, 빛줄기가 지나가는 순간(딜레이로 미리 맞춰 둠) 밝아졌다가 서서히 흐려진다. */\n.radar-dot {\n  fill: var(--sector-color, var(--secondary));\n  opacity: 0.3;\n  cursor: pointer;\n}\n.radar-dot:focus-visible {\n  outline: 2px solid var(--tertiary);\n  outline-offset: 1px;\n}\n.radar-dot[aria-pressed=\"true\"] {\n  opacity: 1;\n  filter: brightness(1.3);\n}\n@media (prefers-reduced-motion: no-preference) {\n  .radar-dot {\n    animation: radar-ping 10s linear infinite;\n    animation-play-state: paused;\n  }\n  .garden-home-radar.radar-is-visible .radar-dot {\n    animation-play-state: running;\n  }\n}\n@keyframes radar-ping {\n  0% {\n    opacity: 1;\n  }\n  8% {\n    opacity: 0.85;\n  }\n  35% {\n    opacity: 0.5;\n  }\n  70%,\n  100% {\n    opacity: 0.3;\n  }\n}\n\n.radar-panel-title {\n  margin-top: 0.1rem;\n}\n\n/* ---------- ④ 아빠의 화단 ---------- */\n\n.gallery-intro {\n  margin-top: 0;\n}\n\n.gallery-slideshow {\n  position: relative;\n}\n\n.gallery-slide-track {\n  position: relative;\n  width: 100%;\n  overflow: hidden;\n  border-radius: 0.5rem;\n  border: 1px solid color-mix(in srgb, var(--gray) 30%, var(--light));\n  background: color-mix(in srgb, var(--color-orange, var(--darkgray)) 6%, var(--light));\n}\n\n.gallery-slide {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  opacity: 0;\n  pointer-events: none;\n  cursor: pointer;\n}\n.gallery-slide.is-active {\n  opacity: 1;\n  pointer-events: auto;\n  z-index: 1;\n}\n@media (prefers-reduced-motion: no-preference) {\n  .gallery-slide {\n    transition: opacity 0.9s ease;\n  }\n}\n.gallery-slide img {\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n  margin: 0;\n}\n.gallery-caption {\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  margin: 0;\n  padding: 0.4rem 0.7rem;\n  font-size: 0.85rem;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 55%, transparent);\n}\n\n.gallery-nav {\n  position: absolute;\n  top: 50%;\n  transform: translateY(-50%);\n  z-index: 2;\n  font: inherit;\n  font-size: 1.4rem;\n  line-height: 1;\n  width: 2rem;\n  height: 2rem;\n  border-radius: 999px;\n  border: none;\n  cursor: pointer;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 45%, transparent);\n}\n.gallery-nav:hover {\n  background: color-mix(in srgb, var(--dark) 65%, transparent);\n}\n.gallery-prev {\n  left: 0.5rem;\n}\n.gallery-next {\n  right: 0.5rem;\n}\n\n.gallery-play {\n  position: absolute;\n  top: 0.5rem;\n  right: 0.5rem;\n  z-index: 2;\n  font: inherit;\n  font-size: 0.75rem;\n  cursor: pointer;\n  color: var(--light);\n  background: color-mix(in srgb, var(--dark) 45%, transparent);\n  border: none;\n  border-radius: 999px;\n  padding: 0.25rem 0.55rem;\n}\n.gallery-play:hover {\n  background: color-mix(in srgb, var(--dark) 65%, transparent);\n}\n\n.gallery-buds {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.15rem;\n  margin-top: 0.5rem;\n}\n.gallery-bud {\n  background: none;\n  border: none;\n  cursor: pointer;\n  padding: 0.1rem;\n  line-height: 0;\n}\n.gallery-bud-svg {\n  width: 20px;\n  height: 22px;\n  display: block;\n}\n.gb-stem {\n  fill: none;\n  stroke: color-mix(in srgb, var(--color-green, var(--secondary)) 70%, var(--light));\n  stroke-width: 1.4;\n}\n.gb-bud {\n  fill: color-mix(in srgb, var(--color-green, var(--secondary)) 60%, var(--light));\n}\n.gallery-bud.is-active .gb-bud {\n  fill: var(--color-green, var(--secondary));\n}\n.gb-petal-0 {\n  fill: var(--color-pink, var(--tertiary));\n}\n.gb-petal-1 {\n  fill: var(--color-yellow, var(--tertiary));\n}\n.gb-petal-2 {\n  fill: var(--color-purple, var(--secondary));\n}\n.gb-heart {\n  fill: var(--color-orange, var(--secondary));\n}\n\n.gallery-view-all {\n  display: inline-block;\n  margin-top: 0.6rem;\n  font-size: 0.9rem;\n}\n\n/* ---------- ③.5 climate histography — 타임라인 자체 스타일(.tl-*, .climate-timeline)은\n   climate-timeline 플러그인의 timeline.css 가 전역 번들로 이미 실어 둔다(모든 페이지가 모든\n   컴포넌트 CSS 청크를 불러오므로 여기서 다시 만들 필요가 없다). 여기는 홈 전용 \"전체 화면으로\n   보기\" 링크만. ---------- */\n.garden-home-timeline-link {\n  display: inline-block;\n  margin-top: 0.6rem;\n  font-size: 0.9rem;\n}\n"
  Component.afterDOMLoaded = "// 정원의 상호작용·움직임. component.js 가 Component.afterDOMLoaded 로 붙인다(build.mjs 가\n// 이 파일을 문자열로 넣는다). 홈(index)에서만 존재하는 .garden-home-garden 섹션을 다룬다.\n// SPA 라 nav 이벤트마다 다시 찾아서 건다(quartz/components/scripts/spa.inline.ts 패턴).\n//\n// - 식물을 클릭/키보드로 고르면: 패널에 제목·종류·물 준 날 + 노트로 가는 링크, 그 식물의\n//   뿌리(이 정원 안의 다른 식물로 가는 링크·백링크)만 곡선으로 표시.\n// - 화면에 보이는 이랑(.gp-row)만 살짝 흔들리게(prefers-reduced-motion 이면 아예 안 붙인다).\n// - 재생 버튼: 가장 오래된 식물의 심은 날부터 오늘까지 1주 단위로 식물이 하나씩 나타난다.\n;(function () {\n  function cssEscape(s) {\n    return String(s).replace(/[\"\\\\]/g, \"\\\\$&\")\n  }\n\n  function initGarden(section) {\n    if (!section || section.dataset.gpInit === \"true\") return\n    section.dataset.gpInit = \"true\"\n\n    var plants = Array.prototype.slice.call(section.querySelectorAll(\".gp-plant\"))\n    var panel = section.querySelector(\".gp-panel\")\n    var panelTitle = panel && panel.querySelector(\".gp-panel-title\")\n    var panelMeta = panel && panel.querySelector(\".gp-panel-meta\")\n    var panelLink = panel && panel.querySelector(\".gp-panel-link\")\n    var panelClose = panel && panel.querySelector(\".gp-panel-close\")\n\n    function overlaysOf() {\n      return Array.prototype.slice.call(section.querySelectorAll(\".gp-roots\"))\n    }\n\n    function clearRoots() {\n      overlaysOf().forEach(function (svg) {\n        svg.textContent = \"\"\n      })\n    }\n\n    function drawRoots(plant) {\n      clearRoots()\n      var links = (plant.dataset.links || \"\").split(\",\").filter(Boolean)\n      if (!links.length) return\n      var bed = plant.closest(\".gp-beds\")\n      var overlay = bed && bed.querySelector(\".gp-roots\")\n      if (!bed || !overlay) return\n      var bedRect = bed.getBoundingClientRect()\n      var fromRect = plant.getBoundingClientRect()\n      var fromX = fromRect.left + fromRect.width / 2 - bedRect.left\n      var fromY = fromRect.bottom - bedRect.top - 2\n      var d = \"\"\n      links.forEach(function (slug) {\n        var target = bed.querySelector('.gp-plant[data-slug=\"' + cssEscape(slug) + '\"]')\n        if (!target) return\n        var r = target.getBoundingClientRect()\n        var toX = r.left + r.width / 2 - bedRect.left\n        var toY = r.bottom - bedRect.top - 2\n        var dipY = Math.max(fromY, toY) + 18\n        d += \"M\" + fromX + \" \" + fromY + \"Q\" + (fromX + toX) / 2 + \" \" + dipY + \" \" + toX + \" \" + toY + \" \"\n      })\n      if (d) overlay.innerHTML = '<path class=\"gp-root-line\" d=\"' + d + '\"></path>'\n    }\n\n    function showPanel(plant) {\n      if (!panel) return\n      if (panelTitle) panelTitle.textContent = plant.dataset.title || \"\"\n      var kind = plant.dataset.kind || \"\"\n      var modified = plant.dataset.modified || \"\"\n      if (panelMeta) panelMeta.textContent = [kind, modified ? \"물 준 날 \" + modified : \"\"].filter(Boolean).join(\" · \")\n      if (panelLink) panelLink.setAttribute(\"href\", \"./\" + (plant.dataset.slug || \"\"))\n      panel.classList.add(\"is-open\")\n    }\n\n    function hidePanel() {\n      if (panel) panel.classList.remove(\"is-open\")\n    }\n\n    var selected = null\n\n    function deselect() {\n      selected = null\n      plants.forEach(function (p) {\n        p.setAttribute(\"aria-expanded\", \"false\")\n      })\n      hidePanel()\n      clearRoots()\n    }\n\n    function select(plant) {\n      if (selected === plant) {\n        deselect()\n        return\n      }\n      selected = plant\n      plants.forEach(function (p) {\n        p.setAttribute(\"aria-expanded\", p === plant ? \"true\" : \"false\")\n      })\n      showPanel(plant)\n      drawRoots(plant)\n    }\n\n    plants.forEach(function (p) {\n      p.addEventListener(\"click\", function (e) {\n        e.preventDefault()\n        select(p)\n      })\n      p.addEventListener(\"keydown\", function (e) {\n        if (e.key === \"Enter\" || e.key === \" \" || e.key === \"Spacebar\") {\n          e.preventDefault()\n          select(p)\n        } else if (e.key === \"Escape\") {\n          deselect()\n        }\n      })\n    })\n    if (panelClose) panelClose.addEventListener(\"click\", deselect)\n\n    // 화면에 보이는 이랑만 흔들리게. 모션 최소화를 선호하면 관찰기 자체를 안 붙인다\n    // (CSS 도 같은 media query 로 한 번 더 막아 둔다 — CLAUDE.md §9).\n    if (window.IntersectionObserver && !window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches) {\n      var io = new IntersectionObserver(\n        function (entries) {\n          entries.forEach(function (entry) {\n            entry.target.classList.toggle(\"is-visible\", entry.isIntersecting)\n          })\n        },\n        { rootMargin: \"80px\" },\n      )\n      section.querySelectorAll(\".gp-row\").forEach(function (row) {\n        io.observe(row)\n      })\n      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))\n    }\n\n    // 타임랩스\n    var playBtn = section.querySelector(\".gp-play\")\n    var dateLabel = section.querySelector(\".gp-timelapse-date\")\n    var timer = null\n\n    function stopTimelapse(reveal) {\n      if (timer) {\n        clearInterval(timer)\n        timer = null\n      }\n      if (playBtn) playBtn.textContent = \"▶ 타임랩스로 보기\"\n      if (reveal) {\n        plants.forEach(function (p) {\n          p.classList.remove(\"gp-future\")\n        })\n        if (dateLabel) dateLabel.textContent = \"\"\n      }\n    }\n\n    function weeklySteps(startMs, todayMs) {\n      var steps = []\n      var t = startMs\n      var week = 7 * 24 * 60 * 60 * 1000\n      while (t < todayMs) {\n        steps.push(t)\n        t += week\n      }\n      steps.push(todayMs)\n      return steps\n    }\n\n    function startTimelapse() {\n      var created = plants\n        .map(function (p) {\n          var t = p.dataset.created ? new Date(p.dataset.created).getTime() : NaN\n          return isNaN(t) ? null : t\n        })\n        .filter(function (t) {\n          return t !== null\n        })\n      if (!created.length) return\n      var steps = weeklySteps(Math.min.apply(null, created), Date.now())\n\n      if (playBtn) playBtn.textContent = \"■ 멈추기\"\n      var i = 0\n\n      function frame() {\n        var cur = steps[i]\n        plants.forEach(function (p) {\n          var t = p.dataset.created ? new Date(p.dataset.created).getTime() : NaN\n          var show = isNaN(t) || t <= cur\n          p.classList.toggle(\"gp-future\", !show)\n        })\n        if (dateLabel) dateLabel.textContent = new Date(cur).toISOString().slice(0, 10)\n        i++\n        if (i >= steps.length) stopTimelapse(false)\n      }\n\n      frame()\n      timer = setInterval(frame, 260)\n      if (window.addCleanup) window.addCleanup(function () { stopTimelapse(true) })\n    }\n\n    if (playBtn) {\n      playBtn.addEventListener(\"click\", function () {\n        if (timer) {\n          stopTimelapse(true)\n        } else {\n          startTimelapse()\n        }\n      })\n    }\n\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        section.dataset.gpInit = \"false\"\n      })\n    }\n  }\n\n  function init() {\n    initGarden(document.querySelector(\".garden-home-garden\"))\n  }\n\n  document.addEventListener(\"nav\", init)\n  init()\n})()\n\n// radar 구역의 상호작용·움직임. 회전·반짝임 자체는 CSS 애니메이션(garden-home.css)이 하고,\n// 이 스크립트는: 점을 클릭/키보드로 고르면 패널에 정보 채우기, 화면 밖이면 애니메이션 멈추기만\n// 한다. component.js 가 Component.afterDOMLoaded 로 garden-interactive.js 뒤에 붙인다(build.mjs).\n;(function () {\n  function initRadar(section) {\n    if (!section || section.dataset.radarInit === \"true\") return\n    section.dataset.radarInit = \"true\"\n\n    var dots = Array.prototype.slice.call(section.querySelectorAll(\".radar-dot\"))\n    var panel = section.querySelector(\".radar-panel\")\n    var panelSub = panel && panel.querySelector(\".radar-panel-subfolder\")\n    var panelDate = panel && panel.querySelector(\".radar-panel-date\")\n    var panelTitle = panel && panel.querySelector(\".radar-panel-title\")\n    var panelLink = panel && panel.querySelector(\".radar-panel-link\")\n    var panelClose = panel && panel.querySelector(\".gp-panel-close\")\n    var selected = null\n\n    function hidePanel() {\n      if (panel) panel.classList.remove(\"is-open\")\n    }\n\n    function select(dot) {\n      if (selected === dot) {\n        deselect()\n        return\n      }\n      selected = dot\n      dots.forEach(function (d) {\n        d.setAttribute(\"aria-pressed\", d === dot ? \"true\" : \"false\")\n        d.style.animationPlayState = d === dot ? \"paused\" : \"\"\n      })\n      if (panel) {\n        if (panelSub) panelSub.textContent = dot.dataset.subfolder || \"\"\n        if (panelDate) panelDate.textContent = dot.dataset.date || \"\"\n        if (panelTitle) panelTitle.textContent = dot.dataset.title || \"\"\n        if (panelLink) panelLink.setAttribute(\"href\", \"./\" + (dot.dataset.slug || \"\"))\n        panel.classList.add(\"is-open\")\n      }\n    }\n\n    function deselect() {\n      selected = null\n      dots.forEach(function (d) {\n        d.setAttribute(\"aria-pressed\", \"false\")\n        d.style.animationPlayState = \"\"\n      })\n      hidePanel()\n    }\n\n    dots.forEach(function (d) {\n      d.setAttribute(\"aria-pressed\", \"false\")\n      d.addEventListener(\"click\", function () {\n        select(d)\n      })\n      d.addEventListener(\"keydown\", function (e) {\n        if (e.key === \"Enter\" || e.key === \" \" || e.key === \"Spacebar\") {\n          e.preventDefault()\n          select(d)\n        } else if (e.key === \"Escape\") {\n          deselect()\n        }\n      })\n    })\n    if (panelClose) panelClose.addEventListener(\"click\", deselect)\n\n    // 화면 밖이면 회전·반짝임 멈춤(움직이는 게 안 보이는데 계속 도는 건 낭비고, 다시 보일 때\n    // 느닷없이 위상이 튀는 것도 자연스럽다 — CSS 애니메이션은 멈췄다 다시 켜면 그 지점부터 이어진다).\n    if (window.IntersectionObserver) {\n      var io = new IntersectionObserver(\n        function (entries) {\n          entries.forEach(function (entry) {\n            section.classList.toggle(\"radar-is-visible\", entry.isIntersecting)\n          })\n        },\n        { rootMargin: \"60px\" },\n      )\n      var dial = section.querySelector(\".radar-dial\")\n      if (dial) io.observe(dial)\n      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))\n    } else {\n      section.classList.add(\"radar-is-visible\")\n    }\n\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        section.dataset.radarInit = \"false\"\n      })\n    }\n  }\n\n  function init() {\n    initRadar(document.querySelector(\".garden-home-radar\"))\n  }\n\n  document.addEventListener(\"nav\", init)\n  init()\n})()\n\n// ④ 아빠의 화단 홈 슬라이드쇼 동작. 자동 전환(겹쳐지며), 그림/버튼 클릭으로 일시정지·재생,\n// 좌우 버튼, 꽃봉오리 클릭으로 이동, 화면 밖이면 자동 전환 멈춤. component.js 가 만든\n// data-index 슬라이드/봉오리를 그대로 쓴다.\n;(function () {\n  function initGallerySlideshow(section) {\n    if (!section || section.dataset.gsInit === \"true\") return\n    section.dataset.gsInit = \"true\"\n\n    var slides = Array.prototype.slice.call(section.querySelectorAll(\".gallery-slide\"))\n    var buds = Array.prototype.slice.call(section.querySelectorAll(\".gallery-bud\"))\n    var playBtn = section.querySelector(\".gallery-play\")\n    var prevBtn = section.querySelector(\".gallery-prev\")\n    var nextBtn = section.querySelector(\".gallery-next\")\n    var track = section.querySelector(\".gallery-slide-track\")\n    var intervalMs = parseInt(section.dataset.intervalMs, 10) || 4000\n    if (!slides.length) return\n\n    var current = 0\n    var playing = true\n    var timer = null\n    var visible = true\n\n    function budSvg(active) {\n      if (active) {\n        return (\n          '<path class=\"gb-stem\" d=\"M10 20L10 11\"/>' +\n          '<circle class=\"gb-petal-0\" cx=\"10\" cy=\"3.1\" r=\"3.4\"/>' +\n          '<circle class=\"gb-petal-1\" cx=\"13.2\" cy=\"5.2\" r=\"3.4\"/>' +\n          '<circle class=\"gb-petal-2\" cx=\"11.8\" cy=\"9.4\" r=\"3.4\"/>' +\n          '<circle class=\"gb-petal-0\" cx=\"8.2\" cy=\"9.4\" r=\"3.4\"/>' +\n          '<circle class=\"gb-petal-1\" cx=\"6.8\" cy=\"5.2\" r=\"3.4\"/>' +\n          '<circle class=\"gb-heart\" cx=\"10\" cy=\"7\" r=\"2.1\"/>'\n        )\n      }\n      return (\n        '<path class=\"gb-stem\" d=\"M10 20L10 11\"/>' +\n        '<path class=\"gb-bud\" d=\"M10 3C6.5 3 5 6 5 9C5 11.8 7.2 13.5 10 13.5C12.8 13.5 15 11.8 15 9C15 6 13.5 3 10 3Z\"/>'\n      )\n    }\n\n    function render() {\n      slides.forEach(function (s, i) {\n        s.classList.toggle(\"is-active\", i === current)\n      })\n      buds.forEach(function (b, i) {\n        var active = i === current\n        b.classList.toggle(\"is-active\", active)\n        b.setAttribute(\"aria-selected\", String(active))\n        var svg = b.querySelector(\".gallery-bud-svg\")\n        if (svg) svg.innerHTML = budSvg(active)\n      })\n    }\n\n    function goTo(i) {\n      current = ((i % slides.length) + slides.length) % slides.length\n      render()\n    }\n\n    function next() {\n      goTo(current + 1)\n    }\n    function prev() {\n      goTo(current - 1)\n    }\n\n    function stopTimer() {\n      if (timer) {\n        clearInterval(timer)\n        timer = null\n      }\n    }\n    function startTimer() {\n      stopTimer()\n      if (playing && visible && slides.length > 1) {\n        timer = setInterval(next, intervalMs)\n      }\n    }\n\n    function setPlaying(next) {\n      playing = next\n      if (playBtn) {\n        playBtn.textContent = playing ? \"❙❙\" : \"▶\"\n        playBtn.setAttribute(\"aria-label\", playing ? \"일시정지\" : \"재생\")\n      }\n      startTimer()\n    }\n\n    if (playBtn) playBtn.addEventListener(\"click\", function () { setPlaying(!playing) })\n    if (track) {\n      track.addEventListener(\"click\", function (e) {\n        if (e.target.closest(\".gallery-nav\")) return\n        setPlaying(!playing)\n      })\n    }\n    if (prevBtn) prevBtn.addEventListener(\"click\", prev)\n    if (nextBtn) nextBtn.addEventListener(\"click\", next)\n    buds.forEach(function (b) {\n      b.addEventListener(\"click\", function () {\n        goTo(parseInt(b.dataset.index, 10) || 0)\n      })\n    })\n\n    if (window.IntersectionObserver) {\n      var io = new IntersectionObserver(\n        function (entries) {\n          entries.forEach(function (entry) {\n            visible = entry.isIntersecting\n            startTimer()\n          })\n        },\n        { rootMargin: \"60px\" },\n      )\n      io.observe(section)\n      if (window.addCleanup) window.addCleanup(io.disconnect.bind(io))\n    }\n\n    render()\n    startTimer()\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        stopTimer()\n        section.dataset.gsInit = \"false\"\n      })\n    }\n  }\n\n  function init() {\n    initGallerySlideshow(document.querySelector(\".garden-home-gallery\"))\n  }\n\n  document.addEventListener(\"nav\", init)\n  init()\n})()\n\n// 카테고리 필터: 라디오 그룹처럼 한 번에 하나만 선택된다(\"전체\"가 기본). 서버가 이미 모든\n// 이벤트를 그린 정적 HTML 이므로, 필터는 보이기/숨기기만 토글한다 — JS 없이도 전체 타임라인이\n// 그대로 보인다(progressive enhancement). 필터는 줌(tlCreateView, timeline-view.js)과 무관하게\n// 동작한다 — 위치는 항상 CSS calc(var(--month-width)*var(--x)) 라 줌 배율이 바뀌어도 숨김\n// 여부와 상관없이 정확하다.\n//\n// 상세 모달: gallery-page 의 라이트박스와 같은 패턴(포커스 이동·Escape·배경 클릭으로 닫기).\n// position:fixed 라 .tl-scroll 의 overflow-x:auto 와 무관하게 항상 화면 안에 꽉 차게 뜬다\n// (이전엔 hover 로만 뜨는 작은 라벨이 .tl-scroll 의 overflow 에 잘리는 문제가 있었다).\n;(function () {\n  // 아래 표시 자리에 build.mjs 가 timeline-scale.js + timeline-view.js(tlCreateView 등)를\n  // 그대로 이어붙인다. 이 IIFE 안에 들어와야(garden-home 처럼 다른 인터랙티브 파일들과 한\n  // 스코프를 공유하는 번들에서도) 이름이 안 새어나간다. 집중 모드(Focus Mode)의 폭 자동 확장은\n  // 이제 tlCreateView 안의 autoBasePx() 가 맡는다 — 예전엔 여기 별도 initResponsiveScale\n  // 함수가 .tl-track 에 직접 --month-width 를 심었는데, 줌 컨트롤러도 같은 변수를 다루게\n  // 되면서 하나로 합쳤다(둘이 서로 다른 요소에 같은 변수를 심으면 집중 모드가 켜졌을 때 줌이\n  // 풀리거나 반대로 줌이 집중 모드의 폭 확장을 무시하는 문제가 생긴다).\n  // 날짜 <-> 시간값(t, 소수 월 인덱스) <-> px 변환. timeline-render.js(서버)와 timeline-view.js\n// (클라이언트, build.mjs 가 timeline-interactive.js 의 IIFE 안에 이어붙인다 — 그 파일의\n// \"__TL_SCALE_AND_VIEW__\" 표시 참고)가 이 파일을 글자 그대로 공유한다. 위치 계산이 서버와\n// 클라이언트에서 갈라지면 줌했을 때 이벤트가 실제 날짜와 다른 자리에 찍히는 문제가 생기므로,\n// 이 파일 하나만 고치면 둘 다 같이 바뀌게 한다.\n//\n// IIFE 로 감싸지 않는다: 서버에서는 이 파일이 ES 모듈 최상위에 오므로 자기 모듈 스코프라\n// 안전하고, 클라이언트에서는 timeline-interactive.js 자신의 IIFE 안에 스플라이스되어 들어가므로\n// 거기서 스코프가 보장된다(다른 플러그인과 문자열로 이어붙는 garden-home 번들에서도 마찬가지).\n//\n// t 는 정수부가 절대 월 인덱스(연*12+월-1), 소수부가 그 달 안에서의 위치 비율이다. 날짜만\n// 아는 이벤트(\"YYYY-MM\")는 그 달의 가운데(+0.5)에 둔다 — 월 단위까지 확대했을 때 달의 왼쪽\n// 끝에 쏠려 보이지 않게 하려는 것이다(같은 달 이벤트를 위/아래로 번갈아 쌓는 규칙은 정수 월\n// 기준이라 이 소수부와 무관하게 그대로 동작한다).\n\n/**\n * \"YYYY-MM\" 또는 \"YYYY-MM-DD\" → 소수 월 인덱스 t. 형식이 안 맞으면 null. 월/일은 1~2자리\n * 둘 다 받는다(formatDateLabel 과 같은 관용도 — 실제 데이터에 \"2025-1-10\" 처럼 0 없이 적힌\n * exactDate 가 있어서, 2자리로 강제하면 그 이벤트 전체가 조용히 사라진다).\n */\nfunction tlDateToT(dateStr) {\n  var m = /^(\\d{4})-(\\d{1,2})(?:-(\\d{1,2}))?$/.exec(String(dateStr == null ? \"\" : dateStr))\n  if (!m) return null\n  var year = Number(m[1])\n  var month = Number(m[2])\n  var day = m[3] ? Number(m[3]) : null\n  var monthIdx = year * 12 + (month - 1)\n  if (day === null) return monthIdx + 0.5\n  var daysInMonth = new Date(year, month, 0).getDate()\n  return monthIdx + (day - 1) / daysInMonth\n}\n\n/** 이벤트의 exactDate 가 있으면 그걸, 없으면 date 를 써서 t 를 구한다. */\nfunction tlEventT(ev) {\n  return tlDateToT(ev.exactDate || ev.date)\n}\n\n/** 소수 월 인덱스 t → {year, month}(1~12). */\nfunction tlTToYearMonth(t) {\n  var monthIdx = Math.floor(t)\n  var year = Math.floor(monthIdx / 12)\n  var month = monthIdx - year * 12 + 1\n  return { year: year, month: month }\n}\n\n/** t(월 인덱스) → 트랙 기준 px. view = {timelineStart, pxPerMonth}. (dateToPosition) */\nfunction tlTToPx(t, view) {\n  return (t - view.timelineStart) * view.pxPerMonth\n}\n\n/** 트랙 기준 px → t(월 인덱스). (positionToDate) */\nfunction tlPxToT(px, view) {\n  return view.timelineStart + px / view.pxPerMonth\n}\n\n// 눈금 간격 후보(월 단위), 오름차순. tlPickTickStep 이 화면 밀도에 맞는 하나를 고른다.\nvar TL_TICK_STEPS = [1, 3, 6, 12, 24, 60, 120, 240, 600, 1200]\n\n/** 라벨 하나당 minLabelPx 이상 간격이 나오는 가장 촘촘한(=작은) 단계를 고른다. */\nfunction tlPickTickStep(pxPerMonth, minLabelPx) {\n  for (var i = 0; i < TL_TICK_STEPS.length; i++) {\n    var step = TL_TICK_STEPS[i]\n    if (step * pxPerMonth >= minLabelPx) return step\n  }\n  return TL_TICK_STEPS[TL_TICK_STEPS.length - 1]\n}\n\n/**\n * [t0, t1] 구간에 그릴 눈금 목록을 만든다. step 이 12 이상이면 매 step 개월(연 단위 이상)마다\n * 연도를 라벨로 쓰고, step 이 12 미만이면 매달 눈금을 찍어 1월엔 연도를, 나머지 달엔 \"N월\"을\n * 라벨로 쓴다(달력 연도가 자연스럽게 보이도록 절대 월 인덱스를 step 으로 나눈 나머지 기준).\n */\nfunction tlTicks(t0, t1, pxPerMonth, minLabelPx) {\n  var step = tlPickTickStep(pxPerMonth, minLabelPx)\n  var startIdx = Math.floor(t0 / step) * step\n  var endIdx = Math.ceil(t1 / step) * step\n  var ticks = []\n  for (var m = startIdx; m <= endIdx; m += step) {\n    var ym = tlTToYearMonth(m)\n    var major = step >= 12 || ym.month === 1\n    var label = step >= 12 || ym.month === 1 ? String(ym.year) : ym.month + \"월\"\n    ticks.push({ t: m, label: label, major: major })\n  }\n  return ticks\n}\n\n// 줌 컨트롤러 — timeline-interactive.js 의 initTimeline() 안에서 섹션 하나당 한 번\n// tlCreateView(section) 로 호출된다(build.mjs 가 이 파일을 그 IIFE 안에 이어붙인다). 실제\n// 위치 계산은 전부 timeline-scale.js 의 tlTToPx/tlPxToT(서버 timeline-render.js 와 완전히\n// 같은 함수)로 하므로, 줌 때문에 이벤트가 실제 날짜와 다른 자리에 찍히는 일이 없다(요구사항:\n// event positioning 의 날짜 정확성 유지).\n//\n// 상태는 의도적으로 최소화한다: 어떤 날짜가 화면 가운데인지는 저장하지 않고 scroll.scrollLeft\n// 를 원본으로 삼는다(네이티브 가로 스크롤과 절대 어긋나지 않는다, 요구사항 1). 줌 배율은\n// section 의 인라인 CSS 커스텀 프로퍼티 --month-width 하나로 표현된다 — timeline.css 의\n// calc(var(--month-width) * var(--x)) 가 이벤트/연도/눈금 전부의 위치를 이미 계산하고\n// 있으므로, 이 값 하나만 바꾸면 나머지는 브라우저가 다시 그린다(요구사항 9).\n\nvar TL_MIN_LABEL_PX_DESKTOP = 56\nvar TL_MIN_LABEL_PX_MOBILE = 44\nvar TL_MOBILE_BREAKPOINT = 800 // timeline.css 의 @media (max-width: 800px) 와 같은 값\nvar TL_MAX_PX_PER_MONTH = 200 // 1년 ≈ 2400px — 월 라벨이 넉넉히 들어가는 수준을 상한으로 둔다\nvar TL_NOW_PAD_MONTHS = 6\n\nfunction tlTodayISO() {\n  var d = new Date()\n  var mo = d.getMonth() + 1\n  var day = d.getDate()\n  return d.getFullYear() + \"-\" + (mo < 10 ? \"0\" + mo : mo) + \"-\" + (day < 10 ? \"0\" + day : day)\n}\n\nfunction tlTouchDist(touches) {\n  var dx = touches[0].clientX - touches[1].clientX\n  var dy = touches[0].clientY - touches[1].clientY\n  return Math.sqrt(dx * dx + dy * dy) || 1\n}\n\nfunction tlTouchMidX(touches, scrollEl) {\n  var rect = scrollEl.getBoundingClientRect()\n  return (touches[0].clientX + touches[1].clientX) / 2 - rect.left\n}\n\n/**\n * section(.climate-timeline) 안의 .tl-scroll/.tl-track/.tl-ticks/.tl-toolbar 를 찾아 줌\n * 상호작용을 건다. 필요한 요소가 없으면(구버전 마크업 등) 조용히 null 을 반환한다.\n */\nfunction tlCreateView(section) {\n  var scroll = section.querySelector(\".tl-scroll\")\n  var track = section.querySelector(\".tl-track\")\n  var ticksLayer = section.querySelector(\".tl-ticks\")\n  var nowLayer = section.querySelector(\".tl-now-layer\")\n  var toolbar = section.querySelector(\".tl-toolbar\")\n  if (!scroll || !track || !ticksLayer || !toolbar) return null\n\n  var zoomOutBtn = toolbar.querySelector(\".tl-zoom-out\")\n  var zoomInBtn = toolbar.querySelector(\".tl-zoom-in\")\n  var resetBtn = toolbar.querySelector(\".tl-zoom-reset\")\n  var levelEl = toolbar.querySelector(\".tl-zoom-level\")\n\n  var timelineStart = Number(track.dataset.start)\n  var builtEnd = Number(track.dataset.end)\n  var nowT = tlDateToT(tlTodayISO())\n  // 사이트를 한동안 다시 안 만들면 \"오늘\"이 빌드 시점의 끝(builtEnd)보다 나중일 수 있다 —\n  // 하드코딩된 연도가 아니라 클라이언트의 실제 현재 시각을 기준으로 범위를 늘린다.\n  var timelineEnd = Math.max(builtEnd, Math.ceil(nowT) + TL_NOW_PAD_MONTHS)\n\n  // timeline.css 의 미디어쿼리 기본값(PC 8px/모바일 4px)을 매번 다시 읽는다 — 한 번만 읽어\n  // 캐싱하면, 로드된 뒤 뷰포트가 모바일 분기점을 넘나들 때(창 크기 조절, 태블릿 회전) 기본\n  // 배율이 계속 예전 값에 머무른다. 우리가 심어 둔 인라인 값을 잠깐 지우고 캐스케이드(CSS)\n  // 값만 측정한 뒤 되돌린다 — 8/4 라는 숫자를 JS 에 다시 적지 않아도 항상 CSS 와 일치한다.\n  function cssDefaultPx() {\n    var prev = section.style.getPropertyValue(\"--month-width\")\n    section.style.removeProperty(\"--month-width\")\n    var val = parseFloat(getComputedStyle(track).getPropertyValue(\"--month-width\")) || 8\n    if (prev) section.style.setProperty(\"--month-width\", prev)\n    return val\n  }\n\n  var view = { timelineStart: timelineStart, pxPerMonth: cssDefaultPx() }\n  var userZoomed = false // Reset 전까지는 \"자동 기준폭\"을 계속 따라간다(아래 autoBasePx 참고)\n\n  function containerWidth() {\n    return scroll.clientWidth || 1\n  }\n  function fitAllPxPerMonth() {\n    return containerWidth() / (timelineEnd - timelineStart)\n  }\n  function minLabelPx() {\n    return window.innerWidth <= TL_MOBILE_BREAKPOINT ? TL_MIN_LABEL_PX_MOBILE : TL_MIN_LABEL_PX_DESKTOP\n  }\n  // 집중 모드(Focus Mode, plugins/focus-mode)에서 좌우 사이드바가 사라져 .tl-scroll 의 실제\n  // 폭이 넓어지면, 고정된 CSS 기본 폭 대신 그 폭에 맞춰 최대 3배까지 넓힌 값을 \"기준폭\"으로\n  // 삼는다(이 파일이 생기기 전부터 있던 동작 — 이전엔 별도 initResponsiveScale 이 .tl-track 에\n  // 직접 --month-width 를 심었는데, 이 컨트롤러도 같은 변수를 다루므로 하나로 합쳤다). 사용자가\n  // 아직 직접 줌하지 않았을 때만(!userZoomed) 이 기준폭을 따라간다 — 한 번 줌한 뒤에는 창\n  // 크기가 바뀌어도 사용자가 고른 배율을 그대로 존중하고 허용 범위만 다시 계산한다.\n  function autoBasePx() {\n    var isMobile = window.innerWidth <= TL_MOBILE_BREAKPOINT\n    var focusModeOn = document.documentElement.getAttribute(\"data-focus-mode\") === \"on\"\n    var base = cssDefaultPx()\n    if (isMobile || !focusModeOn) return base\n    var fitToFull = containerWidth() / (timelineEnd - timelineStart)\n    return Math.max(base, Math.min(fitToFull, base * 3))\n  }\n  function clampPx(px) {\n    var base = cssDefaultPx()\n    var min = Math.min(fitAllPxPerMonth(), base)\n    if (!isFinite(px)) return base\n    return Math.max(min, Math.min(TL_MAX_PX_PER_MONTH, px))\n  }\n\n  function applyPx(px) {\n    view.pxPerMonth = clampPx(px)\n    section.style.setProperty(\"--month-width\", view.pxPerMonth + \"px\")\n  }\n\n  function visibleRange() {\n    var t0 = tlPxToT(scroll.scrollLeft, view)\n    var t1 = tlPxToT(scroll.scrollLeft + containerWidth(), view)\n    return { t0: t0, t1: t1 }\n  }\n\n  function zoomAt(newPx, anchorPx) {\n    userZoomed = true\n    var t = tlPxToT(scroll.scrollLeft + anchorPx, view)\n    applyPx(newPx)\n    scroll.scrollLeft = tlTToPx(t, view) - anchorPx\n    scheduleUpdate()\n  }\n\n  function zoomBy(factor, anchorPx) {\n    if (anchorPx === undefined || anchorPx === null) anchorPx = containerWidth() / 2\n    zoomAt(view.pxPerMonth * factor, anchorPx)\n  }\n\n  function reset() {\n    userZoomed = false\n    applyPx(autoBasePx())\n    scroll.scrollLeft = 0\n    scheduleUpdate()\n  }\n\n  function fitRange(t0, t1) {\n    userZoomed = true\n    var span = Math.max(t1 - t0, 1)\n    var px = clampPx(containerWidth() / span)\n    applyPx(px)\n    var center = (t0 + t1) / 2\n    scroll.scrollLeft = tlTToPx(center, view) - containerWidth() / 2\n    scheduleUpdate()\n  }\n\n  // ---------- 눈금(보이는 구간 + 여유분만 그린다 — 요구사항: 성능) ----------\n  function renderTicks() {\n    var range = visibleRange()\n    var margin = (range.t1 - range.t0) * 0.5\n    var ticks = tlTicks(range.t0 - margin, range.t1 + margin, view.pxPerMonth, minLabelPx())\n    var html = \"\"\n    for (var i = 0; i < ticks.length; i++) {\n      var tk = ticks[i]\n      html +=\n        '<button type=\"button\" class=\"tl-tick\" data-major=\"' +\n        (tk.major ? \"true\" : \"false\") +\n        '\" data-t=\"' +\n        tk.t +\n        '\" style=\"--x:' +\n        (tk.t - timelineStart) +\n        '\" aria-label=\"' +\n        tk.label +\n        (tk.major ? \"년\" : \"\") +\n        '으로 확대·이동\">' +\n        '<span class=\"tl-tick-mark\" aria-hidden=\"true\"></span>' +\n        '<span class=\"tl-tick-label\">' +\n        tk.label +\n        \"</span></button>\"\n    }\n    ticksLayer.innerHTML = html\n    var buttons = ticksLayer.querySelectorAll(\".tl-tick\")\n    for (var j = 0; j < buttons.length; j++) {\n      buttons[j].addEventListener(\"click\", onTickClick)\n    }\n  }\n\n  function onTickClick(e) {\n    var btn = e.currentTarget\n    var t = Number(btn.dataset.t)\n    var step = tlPickTickStep(view.pxPerMonth, minLabelPx())\n    fitRange(t, t + step)\n  }\n\n  // ---------- \"오늘\" 표시선(요구사항: 2026년을 쉽게 찾을 수 있어야 한다) ----------\n  function renderNow() {\n    if (!nowLayer || nowLayer.dataset.tlDone === \"true\") return\n    nowLayer.dataset.tlDone = \"true\"\n    var x = nowT - timelineStart\n    nowLayer.innerHTML =\n      '<div class=\"tl-now\" style=\"--x:' +\n      x +\n      '\" aria-hidden=\"true\"></div>' +\n      '<div class=\"tl-now-label\" style=\"--x:' +\n      x +\n      '\">오늘</div>'\n  }\n\n  function updateToolbar() {\n    var step = tlPickTickStep(view.pxPerMonth, minLabelPx())\n    var label = step >= 600 ? \"전체\" : step >= 120 ? \"수십 년\" : step >= 12 ? \"연도\" : \"월\"\n    if (levelEl) levelEl.textContent = label\n    if (zoomOutBtn) zoomOutBtn.disabled = view.pxPerMonth <= clampPx(0) + 0.01\n    if (zoomInBtn) zoomInBtn.disabled = view.pxPerMonth >= TL_MAX_PX_PER_MONTH - 0.01\n  }\n\n  var rafPending = false\n  function scheduleUpdate() {\n    if (rafPending) return\n    rafPending = true\n    requestAnimationFrame(function () {\n      rafPending = false\n      renderTicks()\n      updateToolbar()\n    })\n  }\n\n  // ---------- 입력: 데스크톱 휠(수식키 필수 — 요구사항: 일반 스크롤 방해 금지) ----------\n  scroll.addEventListener(\n    \"wheel\",\n    function (e) {\n      if (!e.ctrlKey && !e.metaKey) return\n      e.preventDefault()\n      var rect = scroll.getBoundingClientRect()\n      var anchorPx = e.clientX - rect.left\n      var factor = Math.exp(-e.deltaY * 0.003)\n      zoomBy(factor, anchorPx)\n    },\n    { passive: false },\n  )\n\n  // Safari 데스크톱 트랙패드 핀치(비표준 gesture 이벤트 — ctrlKey 휠로는 안 들어온다)\n  var gestureStartPx = null\n  scroll.addEventListener(\"gesturestart\", function (e) {\n    e.preventDefault()\n    gestureStartPx = view.pxPerMonth\n  })\n  scroll.addEventListener(\"gesturechange\", function (e) {\n    if (gestureStartPx === null) return\n    e.preventDefault()\n    var rect = scroll.getBoundingClientRect()\n    zoomAt(gestureStartPx * e.scale, e.clientX - rect.left)\n  })\n  scroll.addEventListener(\"gestureend\", function () {\n    gestureStartPx = null\n  })\n\n  // ---------- 입력: 모바일 두 손가락 핀치 ----------\n  var touchState = null\n  scroll.addEventListener(\n    \"touchstart\",\n    function (e) {\n      if (e.touches.length !== 2) {\n        touchState = null\n        return\n      }\n      e.preventDefault()\n      var mid = tlTouchMidX(e.touches, scroll)\n      touchState = {\n        dist: tlTouchDist(e.touches),\n        px: view.pxPerMonth,\n        t: tlPxToT(scroll.scrollLeft + mid, view),\n      }\n    },\n    { passive: false },\n  )\n  scroll.addEventListener(\n    \"touchmove\",\n    function (e) {\n      if (!touchState || e.touches.length !== 2) return\n      e.preventDefault()\n      var dist = tlTouchDist(e.touches)\n      var mid = tlTouchMidX(e.touches, scroll)\n      applyPx((touchState.px * dist) / touchState.dist)\n      scroll.scrollLeft = tlTToPx(touchState.t, view) - mid\n      scheduleUpdate()\n    },\n    { passive: false },\n  )\n  scroll.addEventListener(\"touchend\", function (e) {\n    if (e.touches.length < 2) touchState = null\n  })\n\n  // ---------- 입력: 버튼 · 키보드 ----------\n  if (zoomOutBtn) {\n    zoomOutBtn.addEventListener(\"click\", function () {\n      zoomBy(1 / 1.6)\n    })\n  }\n  if (zoomInBtn) {\n    zoomInBtn.addEventListener(\"click\", function () {\n      zoomBy(1.6)\n    })\n  }\n  if (resetBtn) resetBtn.addEventListener(\"click\", reset)\n\n  section.addEventListener(\"keydown\", function (e) {\n    if (e.target.closest(\".tl-modal\")) return\n    if (e.ctrlKey || e.metaKey || e.altKey) return\n    if (e.key === \"+\" || e.key === \"=\") {\n      e.preventDefault()\n      zoomBy(1.6)\n    } else if (e.key === \"-\") {\n      e.preventDefault()\n      zoomBy(1 / 1.6)\n    } else if (e.key === \"0\") {\n      e.preventDefault()\n      reset()\n    }\n  })\n\n  var scrollRafPending = false\n  scroll.addEventListener(\"scroll\", function () {\n    if (scrollRafPending) return\n    scrollRafPending = true\n    requestAnimationFrame(function () {\n      scrollRafPending = false\n      renderTicks()\n    })\n  })\n\n  function onLayoutChange() {\n    // 아직 직접 줌하지 않았으면(userZoomed === false) 집중 모드/창 크기에 맞춘 자동 기준폭을\n    // 계속 따라간다. 이미 줌했다면 그 배율은 그대로 두고 허용 범위(clampPx)만 다시 맞춘다.\n    applyPx(userZoomed ? view.pxPerMonth : autoBasePx())\n    scheduleUpdate()\n  }\n\n  if (typeof ResizeObserver !== \"undefined\") {\n    var ro = new ResizeObserver(onLayoutChange)\n    ro.observe(scroll)\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        ro.disconnect()\n      })\n    }\n  }\n  if (typeof MutationObserver !== \"undefined\") {\n    // 집중 모드 토글이 사이드바 레이아웃을 바꾸는 시점과 --month-width 재계산 시점이 어긋나지\n    // 않도록, ResizeObserver 와 별개로 속성 변화 자체도 직접 본다(예전 initResponsiveScale 이\n    // data-focus-mode 를 직접 읽던 것과 같은 이유).\n    var mo = new MutationObserver(onLayoutChange)\n    mo.observe(document.documentElement, { attributes: true, attributeFilter: [\"data-focus-mode\"] })\n    if (window.addCleanup) {\n      window.addCleanup(function () {\n        mo.disconnect()\n      })\n    }\n  }\n\n  track.style.setProperty(\"--total-months\", String(timelineEnd - timelineStart))\n  applyPx(autoBasePx())\n  section.classList.add(\"is-enhanced\")\n  renderNow()\n  scheduleUpdate()\n\n  return { zoomBy: zoomBy, reset: reset, fitRange: fitRange }\n}\n\n\n  function initTimeline(section) {\n    if (!section || section.dataset.tlInit === \"true\") return\n    section.dataset.tlInit = \"true\"\n\n    var filters = Array.prototype.slice.call(section.querySelectorAll(\".tl-filter\"))\n    var events = Array.prototype.slice.call(section.querySelectorAll(\".tl-event\"))\n    var modal = section.querySelector(\".tl-modal\")\n    var dataEl = section.querySelector(\".tl-detail-data\")\n    if (events.length === 0) return\n\n    // ---------- 필터 ----------\n    function applyFilter(key) {\n      events.forEach(function (el) {\n        el.hidden = key !== \"all\" && el.dataset.category !== key\n      })\n      filters.forEach(function (btn) {\n        btn.setAttribute(\"aria-checked\", btn.dataset.filter === key ? \"true\" : \"false\")\n      })\n    }\n    filters.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        applyFilter(btn.dataset.filter)\n      })\n    })\n\n    if (typeof tlCreateView === \"function\") tlCreateView(section)\n\n    // ---------- 상세 모달 ----------\n    if (!modal || !dataEl) return\n    var detailById = {}\n    try {\n      detailById = JSON.parse(dataEl.textContent || \"{}\")\n    } catch {\n      detailById = {}\n    }\n\n    var img = modal.querySelector(\".tl-modal-image\")\n    var meta = modal.querySelector(\".tl-modal-meta\")\n    var title = modal.querySelector(\".tl-modal-title\")\n    var desc = modal.querySelector(\".tl-modal-desc\")\n    var links = modal.querySelector(\".tl-modal-links\")\n    var closeEls = Array.prototype.slice.call(modal.querySelectorAll(\"[data-tl-close]\"))\n    var lastFocused = null\n\n    function open(id) {\n      var d = detailById[id]\n      if (!d) return\n      lastFocused = document.activeElement\n\n      meta.textContent = d.category + \" · \" + d.date\n      title.textContent = d.title\n      desc.textContent = d.description || \"\"\n\n      if (d.image) {\n        img.src = d.image\n        img.alt = d.imageAlt || d.title\n        img.hidden = false\n      } else {\n        img.removeAttribute(\"src\")\n        img.hidden = true\n      }\n\n      links.innerHTML = \"\"\n      ;(d.links || []).forEach(function (link) {\n        var li = document.createElement(\"li\")\n        var a = document.createElement(\"a\")\n        a.href = link.url\n        a.target = \"_blank\"\n        a.rel = \"noopener noreferrer\"\n        a.textContent = link.title || link.url\n        li.appendChild(a)\n        links.appendChild(li)\n      })\n\n      modal.hidden = false\n      var closeBtn = modal.querySelector(\".tl-modal-close\")\n      if (closeBtn) closeBtn.focus()\n      document.addEventListener(\"keydown\", onKeydown)\n    }\n\n    function close() {\n      modal.hidden = true\n      document.removeEventListener(\"keydown\", onKeydown)\n      if (lastFocused && typeof lastFocused.focus === \"function\") lastFocused.focus()\n    }\n\n    function onKeydown(e) {\n      if (e.key === \"Escape\") close()\n    }\n\n    events.forEach(function (btn) {\n      btn.addEventListener(\"click\", function () {\n        open(btn.dataset.id)\n      })\n    })\n    closeEls.forEach(function (el) {\n      el.addEventListener(\"click\", close)\n    })\n  }\n\n  function init() {\n    var sections = document.querySelectorAll(\".climate-timeline\")\n    for (var i = 0; i < sections.length; i++) initTimeline(sections[i])\n  }\n\n  document.addEventListener(\"nav\", init)\n})()\n"
  return Component
}
