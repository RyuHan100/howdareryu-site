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
