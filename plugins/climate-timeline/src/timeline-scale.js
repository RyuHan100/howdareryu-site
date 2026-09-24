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
