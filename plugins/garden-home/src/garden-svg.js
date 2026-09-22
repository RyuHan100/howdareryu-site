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
