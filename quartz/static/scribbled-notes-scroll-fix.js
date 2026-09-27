// scribbled notes 배너 (2026-09-27) — .quartz/plugins/explorer 의 nav 리스너가
// scrollIntoView({behavior:"smooth"})로 활성 사이드바 항목을 보여주면서, SPA 라우터가
// 이미 맞춰둔 window 스크롤(맨 위)을 나중에 덮어써 배너가 화면 밖으로 밀린다.
// explorer 플러그인(설치본, 커밋 대상 아님)은 건드리지 않고, 그 스크롤이 끝난 뒤
// 한 번만 재보정한다. #해시 링크 이동은 의도된 스크롤이므로 건드리지 않는다.
//
// 첫 진입(풀 페이지 로드)에서는 spa.inline.ts 가 스크립트 실행 시점에 이미 동기적으로
// 첫 "nav" 이벤트를 쏴버려서, 이 스크립트가 defer 로 그보다 늦게 실행되면 그 이벤트를
// 놓친다(explorer 스크립트는 더 먼저 실행돼서 놓치지 않는 것과 대조적). 그래서 "nav"
// 이벤트를 기다리기만 하지 않고, 스크립트가 로드되는 즉시 현재 페이지 기준으로도 한 번
// 돌리고, 이후의 SPA 내비게이션을 위해 "nav" 리스너도 같이 둔다.
;(function () {
  function runCorrectionForCurrentPage() {
    if (location.hash) return

    const slug = document.body.dataset.slug || ""
    if (!slug.startsWith("scribbled-notes/") || slug === "scribbled-notes/index") return

    let corrected = false
    const correct = () => {
      if (corrected) return
      corrected = true
      window.removeEventListener("scrollend", correct)
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: "instant" })
      }
    }

    if ("onscrollend" in window) {
      window.addEventListener("scrollend", correct, { once: true })
      setTimeout(correct, 1200) // scrollend가 안 오는 경우(스크롤이 애초에 없었던 경우)를 위한 폴백
    } else {
      setTimeout(correct, 700)
    }
  }

  runCorrectionForCurrentPage() // 첫 진입(풀 페이지 로드)
  document.addEventListener("nav", runCorrectionForCurrentPage) // 이후 SPA 내비게이션
})()
