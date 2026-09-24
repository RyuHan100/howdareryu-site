// beforeDOMLoaded — prescript.js 에 실려 <head> 파싱 중(첫 페인트 전)에 동기 실행된다.
// darkmode 플러그인이 :root[saved-theme] 를 똑같은 타이밍에 심는 것과 같은 이유: 여기서
// 미리 속성을 심어 둬야 CSS 가 이미 로드된 상태로 첫 페인트부터 집중 모드가 적용되고,
// "3-column 으로 잠깐 보였다가 넓어지는" 깜빡임이 없다.
;(function () {
  try {
    if (localStorage.getItem("focus-mode") === "on") {
      document.documentElement.setAttribute("data-focus-mode", "on")
      // 첫 로드는 "전환"이 아니라 이미 그 상태로 시작하는 것이므로, 레이아웃 스냅을
      // 지연시키는 fm-layout-collapsed 클래스(focus-mode-interactive.js/focus-mode.css)도
      // 곧바로 같이 붙여야 한다 — 안 그러면 페이지가 3-column 으로 그려졌다가 나중에
      // 집중 모드로 바뀌는 깜빡임이 생긴다.
      document.documentElement.classList.add("fm-layout-collapsed")
    }
  } catch (e) {
    // localStorage 를 못 쓰는 환경(프라이빗 모드 등) — 기본 3-column 레이아웃으로 정상 동작
  }
})()
