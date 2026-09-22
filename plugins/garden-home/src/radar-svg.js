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
