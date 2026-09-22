// 전체 그림 페이지 맨 아래에 까는 장식용 화단 가장자리(작은 꽃이 핀 흙 띠). 실제 데이터와
// 무관한 순수 장식이라 고정된 모양 하나만 만든다. 상호작용 없음.

function miniFlower(x, hue) {
  const petalClass = ["gg-petal-0", "gg-petal-1", "gg-petal-2"][hue % 3]
  let petals = ""
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2
    const px = x + Math.cos(a) * 3.2
    const py = 14 + Math.sin(a) * 3.2
    petals += `<circle class="${petalClass}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/>`
  }
  return (
    `<path class="gg-stem" d="M${x} 24L${x} 17"/>` + petals + `<circle class="gg-heart" cx="${x}" cy="14" r="1.8"/>`
  )
}

/** width 는 viewBox 기준(뷰포트 폭과 같게 잡으면 이랑처럼 늘어난다). */
function renderFlowerBedFooter(width) {
  const n = Math.max(4, Math.round(width / 90))
  let flowers = ""
  for (let i = 0; i < n; i++) {
    const x = (width / n) * (i + 0.5)
    flowers += miniFlower(x, i)
  }
  return (
    `<svg class="gg-footer-bed" viewBox="0 0 ${width} 30" preserveAspectRatio="none" aria-hidden="true">` +
    `<rect class="gg-footer-soil" x="0" y="20" width="${width}" height="10"/>` +
    `<line class="gg-footer-soil-line" x1="0" y1="20" x2="${width}" y2="20"/>` +
    flowers +
    `</svg>`
  )
}
