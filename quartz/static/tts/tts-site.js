/*! howdareryu.com 빌트인 텍스트 읽어주기 — tts-core.js 다음에 로드한다.
 *
 * 버튼 두 곳: 제목(h1.article-title) 바로 아래, 화면 하단 고정 플로팅 버튼(코어의 fab).
 * Quartz SPA 는 페이지를 옮길 때 body 를 통째로 갈아 끼우므로 "nav" 이벤트마다 버튼을 다시 단다.
 */
;(function () {
  "use strict"
  if (window.__ryuTTSSite || !window.RyuTTS) return
  window.__ryuTTSSite = true

  const MIN_CHARS = 100 // 이보다 짧은 페이지(폴더 목록, 태그 페이지 등)에는 버튼을 달지 않는다

  let inlineBtn = null
  let minutes = 0

  const reader = window.RyuTTS.create({
    fab: true,
    lang: "ko-KR",
    getRoots: () => [document.querySelector("h1.article-title"), document.querySelector(".center article")],
    skipSelector:
      ".page-listing,.callout-icon,.fold-callout-icon,.clipboard-button,.mermaid,.excalidraw," +
      "[data-footnote-ref],[data-footnote-backref],.tikz,.expand-button",
    // 테마(hackthebox)가 --highlight/--textHighlight 를 불투명한 형광색으로 덮어써서 글자가 안 보인다.
    // 그래서 강조색은 --secondary 를 옅게 섞어 직접 만든다.
    highlight: "color-mix(in srgb, var(--secondary, #6d28d9) 22%, transparent)",
    themeCss:
      ":host{--bg:var(--light,#fff);--fg:var(--dark,#222);--mut:var(--gray,#888);--bd:var(--lightgray,#ddd);" +
      "--ac:var(--secondary,#6d28d9);--hl:color-mix(in srgb,var(--secondary,#6d28d9) 18%,transparent)}",
    onState: renderInline,
  })
  if (!reader) return // 음성 합성을 지원하지 않는 브라우저

  const style = document.createElement("style")
  style.setAttribute("data-persist", "")
  style.textContent = `
    .ryu-tts-inline{margin:.5rem 0 .9rem}
    .ryu-tts-inline button{font:inherit;font-size:.9rem;line-height:1;display:inline-flex;align-items:center;gap:.45rem;
      padding:.35rem .85rem .35rem .6rem;border-radius:999px;border:1px solid var(--gray);
      background:color-mix(in srgb,var(--secondary,#6d28d9) 12%,transparent);color:var(--dark);cursor:pointer}
    .ryu-tts-inline button:hover{border-color:var(--secondary)}
    .ryu-tts-inline .emoji{font-size:1.2rem}
    @media print{.ryu-tts-inline{display:none}}`
  document.head.appendChild(style)

  function renderInline(state) {
    if (!inlineBtn) return
    const s = state || reader.state
    const emoji = s === "playing" ? "⏸️" : s === "paused" ? "▶️" : "🔊"
    const text =
      s === "playing" ? "일시정지" : s === "paused" ? "이어 듣기" : `듣기 · 약 ${Math.max(1, Math.round(minutes))}분`
    inlineBtn.querySelector(".emoji").textContent = emoji
    inlineBtn.querySelector(".text").textContent = text
    inlineBtn.setAttribute("aria-label", s === "idle" ? "이 글 읽어주기" : text)
  }

  function mount() {
    document.querySelectorAll(".ryu-tts-inline").forEach((el) => el.remove())
    inlineBtn = null
    reader.attach()

    const title = document.querySelector("h1.article-title")
    const est = reader.estimate()
    const titleLen = title ? title.textContent.trim().length : 0
    const ok = est.chars - titleLen >= MIN_CHARS
    reader.setAvailable(ok)
    if (!ok || !title) return

    minutes = est.minutes
    const wrap = document.createElement("div")
    wrap.className = "ryu-tts-inline"
    wrap.setAttribute("data-ryu-tts", "")
    inlineBtn = document.createElement("button")
    inlineBtn.type = "button"
    inlineBtn.innerHTML = '<span class="emoji"></span><span class="text"></span>'
    inlineBtn.addEventListener("click", () => reader.toggle())
    wrap.appendChild(inlineBtn)
    title.insertAdjacentElement("afterend", wrap)
    renderInline()
  }

  // 암호화된 글은 비밀번호를 넣은 뒤에야 본문이 생긴다. 본문이 바뀌면 버튼을 다시 계산한다.
  let timer = 0
  const observer = new MutationObserver(() => {
    if (reader.state !== "idle") return
    clearTimeout(timer)
    timer = setTimeout(mount, 600)
  })
  function watch() {
    observer.disconnect()
    const article = document.querySelector(".center article")
    if (article) observer.observe(article, { childList: true, subtree: true })
  }

  function init() {
    mount()
    watch()
  }

  document.addEventListener("prenav", () => reader.stop())
  document.addEventListener("nav", init)
  // defer 로 불리지만, 혹시 본문보다 먼저 실행되더라도 버튼을 놓치지 않게 한다.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init)
  else init()
})()
