// 기온 편차 레이어(산업화 이전 1850-1900 대비, 2026-09-27)의 세로 스케일 순수 함수.
// timeline-render.js(서버) 하나에서만 쓰인다 — 축 눈금과 SVG 위 온도선·기준선이 전부 이
// tlTempFrac() 하나로만 세로 위치를 계산하므로, 같은 렌더 호출 안에서 절대 어긋나지 않는다
// (요구사항: 세로축과 그래프가 1px도 안 어긋나야 한다). 클라이언트(timeline-view.js/
// timeline-interactive.js)는 이 파일이 없어도 된다 — 호버 툴팁은 값 조회만 하지 세로 좌표
// 계산이 필요 없다(연도 → px 변환은 이미 있는 timeline-scale.js 의 tlPxToT 로 충분하다).
// build.mjs 가 timeline-scale.js 바로 뒤, timeline-render.js 바로 앞에 이 파일을 이어붙인다.

// 도메인(°C). 실제 데이터 범위(대략 -0.24 ~ +1.53, HadCRUT5 1850-1900 재기준)보다 위아래로
// 살짝 여유를 둬서 선이 축 끝에 바짝 붙지 않게 한다.
const TL_TEMP_MIN = -0.5
const TL_TEMP_MAX = 2.2

// 1.5°C(파리협정 목표)가 가장 강조되는 기준선, 2.0°C는 보조 기준선(요구사항).
const TL_TEMP_THRESHOLDS = [
  { value: 1.5, key: "15" },
  { value: 2.0, key: "20" },
]

// 세로축에 그릴 눈금 값(°C). 0.5°C 간격 — 축 폭을 작게 유지하라는 요구사항이라 촘촘히 안 찍는다.
const TL_TEMP_TICK_VALUES = [0, 0.5, 1, 1.5, 2]

/** 값(°C) → 0(도메인 아래끝)~1(도메인 위끝) 분수. 축 눈금·기준선·온도선이 전부 이 함수 하나만
 * 거치므로, 서로 다른 계산식 때문에 어긋나는 일이 생기지 않는다. */
function tlTempFrac(value) {
  return (value - TL_TEMP_MIN) / (TL_TEMP_MAX - TL_TEMP_MIN)
}
