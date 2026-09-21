/*! Ryu TTS core — 텍스트 읽어주기 엔진 + 플로팅 플레이어
 *
 * "chrome extention" 과 "howdareryu built in" 두 폴더가 같은 파일을 쓴다.
 * 원본은 "howdareryu built in/tts-core.js" 이고, sync-core.sh 가 확장 폴더로 복사한다.
 *
 * 구조
 *   본문 DOM → 블록(문단) → 청크(문장) → 음성 엔진으로 한 청크씩 재생
 *   - 일시정지는 cancel 후 현재 청크를 다시 읽는 방식이다. speechSynthesis.pause() 는
 *     Chrome 원격 음성과 Android 에서 제대로 동작하지 않는다.
 *   - 청크를 짧게 자르는 이유: Chrome 원격 음성은 한 발화가 15초쯤 넘으면 중간에 멈춘다.
 */
;(function () {
  "use strict"
  if (window.RyuTTS) return

  const SKIP_SEL =
    "script,style,noscript,template,pre,svg,math,canvas,iframe,video,audio,button,select," +
    "textarea,input,nav,[aria-hidden='true'],[hidden],.katex,.sr-only,[data-ryu-tts]"
  const RATES = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2]
  const LANG_LABEL = { ko: "한국어", en: "English", ja: "日本語", zh: "中文" }

  // ---------------------------------------------------------------- 텍스트 추출

  function collectBlocks(roots, skipSelector, range) {
    const skipSel = skipSelector ? SKIP_SEL + "," + skipSelector : SKIP_SEL
    const visible = new Map()
    const blockOf = new Map()
    const blocks = []

    const isVisible = (el) => {
      if (!visible.has(el)) visible.set(el, el.getClientRects().length > 0)
      return visible.get(el)
    }
    // 가장 가까운 "인라인이 아닌" 조상을 블록으로 본다. p/li 뿐 아니라 div 로 문단을 짠 사이트도 잡힌다.
    const findBlock = (el, root) => {
      if (blockOf.has(el)) return blockOf.get(el)
      let cur = el
      while (cur && cur !== root) {
        const d = getComputedStyle(cur).display
        if (!d.startsWith("inline") && d !== "contents") break
        cur = cur.parentElement
      }
      blockOf.set(el, cur || root)
      return cur || root
    }

    for (const root of roots) {
      if (!root) continue
      if (root.matches && root.matches(skipSel)) continue
      let curEl = null
      let buf = ""
      const flush = () => {
        const text = cleanText(buf)
        if (text && /[\p{L}\p{N}]/u.test(text)) blocks.push({ el: curEl === root ? null : curEl, text })
        buf = ""
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT
          if (n.matches(skipSel)) return NodeFilter.FILTER_REJECT
          return n.tagName === "BR" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        },
      })
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (range && !range.intersectsNode(n)) continue
        if (n.nodeType === 1) {
          buf += "\n" // <br>
          continue
        }
        const parent = n.parentElement
        if (!parent || !isVisible(parent)) continue
        let data = n.data
        if (range) {
          if (n === range.endContainer) data = data.slice(0, range.endOffset)
          if (n === range.startContainer) data = data.slice(range.startOffset)
        }
        const el = findBlock(parent, root)
        if (el !== curEl) {
          flush()
          curEl = el
        }
        buf += data.replace(/\s+/g, " ")
      }
      flush()
    }
    return blocks
  }

  function cleanText(s) {
    return s
      .replace(/https?:\/\/(?:www\.)?([^\s/?#]+)\S*/g, "$1") // URL 은 도메인만 읽는다
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .trim()
  }

  function detectLang(text, pageLang) {
    const count = (re) => (text.match(re) || []).length
    if (count(/[\uac00-\ud7a3]/g) > 0) return "ko-KR"
    const kana = count(/[\u3040-\u30ff]/g)
    const han = count(/[\u4e00-\u9fff]/g)
    const latin = count(/[A-Za-z]/g)
    if (kana > 0) return "ja-JP"
    if (han > latin) return /^(zh|ja)/i.test(pageLang) ? pageLang : "zh-CN"
    if (latin) return pageLang && !/^(ko|ja|zh)/i.test(pageLang) ? pageLang : "en-US"
    return pageLang || "ko-KR"
  }

  const ABBREV = /(?:\b[A-Z]|\b(?:Mr|Mrs|Ms|Dr|Prof|No|vs|etc|e\.g|i\.e|St|Jr|Sr|Inc|Ltd|Co|Fig|Art))\.\s+$/

  function splitSentences(text, maxLen) {
    const raw = []
    const re = /[.!?。！？…]+["'”’)\]]*\s+|\n+/g
    let last = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const end = m.index + m[0].length
      const piece = text.slice(last, end)
      if (m[0][0] === "." && ABBREV.test(piece)) continue
      raw.push(piece.trim())
      last = end
    }
    if (last < text.length) raw.push(text.slice(last).trim())

    const out = []
    for (let s of raw) {
      while (s.length > maxLen) {
        const head = s.slice(0, maxLen)
        let cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "))
        if (cut < maxLen * 0.4) cut = head.lastIndexOf(" ")
        if (cut < maxLen * 0.4) cut = maxLen - 1
        out.push(s.slice(0, cut + 1).trim())
        s = s.slice(cut + 1).trim()
      }
      if (!s) continue
      const prev = out[out.length - 1]
      // 너무 짧은 조각은 앞 문장에 붙인다(음성 엔진 호출 사이의 끊김을 줄인다).
      if (prev && s.length < 12 && prev.length + s.length + 1 <= maxLen) out[out.length - 1] = prev + " " + s
      else out.push(s)
    }
    return out
  }

  function buildChunks(blocks, pageLang) {
    const chunks = []
    blocks.forEach((b, bi) => {
      const hangul = /[\uac00-\ud7a3]/.test(b.text)
      for (const text of splitSentences(b.text, hangul ? 80 : 200)) {
        if (/[\p{L}\p{N}]/u.test(text)) chunks.push({ block: bi, el: b.el, text, lang: detectLang(text, pageLang) })
      }
    })
    return chunks
  }

  // ---------------------------------------------------------------- 음성 엔진 (Web Speech API)

  function webEngine() {
    const synth = window.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return null
    let list = synth.getVoices()
    const reload = () => (list = synth.getVoices())
    if (synth.addEventListener) synth.addEventListener("voiceschanged", reload)
    else synth.onvoiceschanged = reload
    let keep = null // GC 되면 onend 가 안 오는 Chrome 버그 때문에 참조를 잡아 둔다

    return {
      voices() {
        if (!list.length) reload()
        return list.map((v) => ({ name: v.name, lang: (v.lang || "").replace("_", "-"), isDefault: v.default }))
      },
      speak(text, o, done) {
        const u = new SpeechSynthesisUtterance(text)
        const v = o.voice && list.find((x) => x.name === o.voice)
        if (v) u.voice = v
        u.lang = o.lang
        u.rate = o.rate
        u.onend = () => done(null)
        u.onerror = (e) =>
          done(e.error === "interrupted" || e.error === "canceled" ? "interrupted" : e.error || "error")
        keep = u
        const go = () => {
          if (keep !== u) return
          synth.resume()
          synth.speak(u)
        }
        // cancel 직후 곧바로 speak 하면 Chrome 이 발화를 삼키는 경우가 있다.
        if (synth.speaking || synth.pending) {
          synth.cancel()
          setTimeout(go, 80)
        } else go()
      },
      cancel() {
        keep = null
        synth.cancel()
      },
    }
  }

  function scoreVoice(v, lang) {
    let s = 0
    if (v.lang.toLowerCase() === lang.toLowerCase()) s += 4
    if (/natural|premium|enhanced|neural|siri/i.test(v.name)) s += 3
    else if (/google/i.test(v.name)) s += 2
    else if (/yuna|sora|samantha|alex|ava|allison|daniel|karen|kyoko/i.test(v.name)) s += 2
    if (v.isDefault) s += 1
    if (/compact|eloquence/i.test(v.name)) s -= 2
    return s
  }

  const localStore = {
    key: "ryu-tts",
    async load() {
      try {
        return JSON.parse(localStorage.getItem(this.key) || "{}")
      } catch {
        return {}
      }
    },
    save(v) {
      try {
        localStorage.setItem(this.key, JSON.stringify(v))
      } catch {}
    },
  }

  // ---------------------------------------------------------------- UI

  const DEFAULT_THEME = `
    :host{--bg:#fff;--fg:#1f2328;--mut:#6b7280;--bd:#d9dbe1;--ac:#6d28d9;--hl:rgba(109,40,217,.1)}
    @media (prefers-color-scheme:dark){:host{--bg:#1c1b22;--fg:#ececf1;--mut:#9ca3af;--bd:#3a3844;--ac:#a78bfa;--hl:rgba(167,139,250,.16)}}`

  const UI_CSS = `
    .wrap{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));
      display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;
      font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1}
    .wrap>*{pointer-events:auto}
    [hidden]{display:none!important}
    button{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}
    button:focus-visible{outline:2px solid var(--ac);outline-offset:1px}
    .fab{width:52px;height:52px;border-radius:50%;font-size:24px;background:var(--bg);border:2px solid var(--ac);
      box-shadow:0 4px 16px rgba(0,0,0,.22);transition:transform .15s}
    .fab:hover{transform:scale(1.07)}
    .msg{background:var(--fg);color:var(--bg);font-size:12px;line-height:1.4;padding:7px 11px;border-radius:10px;max-width:260px}
    .bar{background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:16px;overflow:hidden;
      box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:calc(100vw - 24px)}
    .prog{height:3px;background:var(--bd)}
    .prog i{display:block;height:100%;width:0;background:var(--ac);transition:width .3s}
    .row{display:flex;align-items:center;gap:2px;padding:6px 8px}
    .row button{width:38px;height:38px;font-size:20px;border-radius:10px}
    .row button:hover{background:var(--hl)}
    .row button.main{font-size:24px}
    .rate{min-width:38px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}
    .sep{width:1px;height:22px;background:var(--bd);margin:0 3px}
    .panel{border-top:1px solid var(--bd);padding:8px 10px;display:grid;gap:6px;font-size:12px}
    .panel label{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .panel select{max-width:200px;font-size:12px}
    .panel .count{color:var(--mut)}
    @media (max-width:600px){.wrap{left:12px;right:12px}.bar{align-self:center}}
    @media print{.wrap{display:none}}`

  const UI_HTML = `
    <div class="wrap">
      <div class="msg" role="status" hidden></div>
      <div class="bar" role="toolbar" aria-label="텍스트 읽어주기" hidden>
        <div class="prog"><i></i></div>
        <div class="row">
          <button data-act="prev" title="이전 문단" aria-label="이전 문단">⏮️</button>
          <button data-act="toggle" class="main" title="일시정지" aria-label="일시정지">⏸️</button>
          <button data-act="next" title="다음 문단" aria-label="다음 문단">⏭️</button>
          <button data-act="stop" title="정지하고 닫기" aria-label="정지하고 닫기">⏹️</button>
          <span class="sep"></span>
          <button data-act="slower" title="느리게" aria-label="느리게">🐢</button>
          <span class="rate">1.0×</span>
          <button data-act="faster" title="빠르게" aria-label="빠르게">🐇</button>
          <span class="sep"></span>
          <button data-act="voices" title="목소리 선택" aria-label="목소리 선택" aria-expanded="false">🗣️</button>
        </div>
        <div class="panel" hidden></div>
      </div>
      <button class="fab" title="이 글 읽어주기" aria-label="이 글 읽어주기" hidden>🔊</button>
    </div>`

  // ---------------------------------------------------------------- 리더

  function create(opts) {
    opts = Object.assign({ fab: false, skipSelector: "", highlight: "rgba(255,213,79,.4)" }, opts)
    const engine = opts.engine || webEngine()
    if (!engine) return null
    const storage = opts.storage || localStore
    const settings = { rate: 1, voices: {} }
    storage.load().then((s) => {
      if (s && typeof s.rate === "number") settings.rate = s.rate
      if (s && s.voices) settings.voices = s.voices
      renderRate()
    })

    let state = "idle"
    let chunks = []
    let idx = 0
    let token = 0
    let watchdog = 0
    let errors = 0
    let activeEl = null
    let available = false
    let msgTimer = 0

    // --- DOM
    const host = document.createElement("div")
    host.setAttribute("data-ryu-tts", "")
    host.style.cssText = "all:initial"
    const shadow = host.attachShadow({ mode: "open" })
    shadow.innerHTML = `<style>${DEFAULT_THEME}${opts.themeCss || ""}${UI_CSS}</style>${UI_HTML}`
    const $ = (s) => shadow.querySelector(s)
    const bar = $(".bar"), fab = $(".fab"), msg = $(".msg"), panel = $(".panel")
    const toggleBtn = $("[data-act=toggle]"), voicesBtn = $("[data-act=voices]")

    const pageStyle = document.createElement("style")
    pageStyle.setAttribute("data-persist", "") // Quartz SPA 가 head 를 갈아 끼울 때 살아남도록
    pageStyle.setAttribute("data-ryu-tts", "")
    pageStyle.textContent =
      `.ryu-tts-active{background-color:${opts.highlight}!important;box-shadow:0 0 0 .25em ${opts.highlight};` +
      `border-radius:.2em;transition:background-color .2s}`

    function attach() {
      if (!host.isConnected) (document.body || document.documentElement).appendChild(host)
      if (!pageStyle.isConnected) (document.head || document.documentElement).appendChild(pageStyle)
    }
    attach()

    fab.addEventListener("click", () => start())
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]")
      if (!b) return
      const act = b.dataset.act
      if (act === "toggle") toggle()
      else if (act === "prev") jump(-1)
      else if (act === "next") jump(1)
      else if (act === "stop") stop()
      else if (act === "slower") stepRate(-1)
      else if (act === "faster") stepRate(1)
      else if (act === "voices") togglePanel()
    })
    panel.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-lang]")
      if (!sel) return
      settings.voices[sel.dataset.lang] = sel.value
      storage.save(settings)
      if (state === "playing") speak()
    })
    window.addEventListener("pagehide", () => stop())

    // --- 표시
    function flash(text) {
      attach()
      msg.textContent = text
      msg.hidden = false
      clearTimeout(msgTimer)
      msgTimer = setTimeout(() => (msg.hidden = true), 4000)
    }

    function setState(next) {
      state = next
      bar.hidden = state === "idle"
      fab.hidden = !(opts.fab && available && state === "idle")
      const playing = state === "playing"
      toggleBtn.textContent = playing ? "⏸️" : "▶️"
      toggleBtn.title = playing ? "일시정지" : "이어 듣기"
      toggleBtn.setAttribute("aria-label", toggleBtn.title)
      if (state === "idle") {
        panel.hidden = true
        voicesBtn.setAttribute("aria-expanded", "false")
      }
      if (opts.onState) opts.onState(state)
    }

    function renderRate() {
      $(".rate").textContent = settings.rate.toFixed(Math.round(settings.rate * 100) % 10 ? 2 : 1) + "×"
    }

    function renderProgress() {
      $(".prog i").style.width = (chunks.length ? (idx / chunks.length) * 100 : 0) + "%"
      const c = panel.querySelector(".count")
      if (c) c.textContent = `${Math.min(idx + 1, chunks.length)} / ${chunks.length} 문장`
    }

    function mark(el) {
      if (el === activeEl) return
      if (activeEl) activeEl.classList.remove("ryu-tts-active")
      activeEl = el
      if (!el) return
      el.classList.add("ryu-tts-active")
      const r = el.getBoundingClientRect()
      if (r.top < 70 || r.bottom > innerHeight - 130) el.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    // --- 목소리
    function voicesFor(lang) {
      const prefix = lang.slice(0, 2).toLowerCase()
      return engine
        .voices()
        .filter((v) => v.lang.toLowerCase().startsWith(prefix))
        .sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang))
    }

    function pickVoice(lang) {
      const list = voicesFor(lang)
      const saved = settings.voices[lang.slice(0, 2).toLowerCase()]
      return list.find((v) => v.name === saved) || list[0] || null
    }

    function togglePanel() {
      panel.hidden = !panel.hidden
      voicesBtn.setAttribute("aria-expanded", String(!panel.hidden))
      if (panel.hidden) return
      panel.textContent = ""
      const langs = [...new Set(chunks.map((c) => c.lang))].slice(0, 4)
      for (const lang of langs) {
        const prefix = lang.slice(0, 2).toLowerCase()
        const list = voicesFor(lang)
        const label = document.createElement("label")
        label.append(LANG_LABEL[prefix] || lang)
        if (list.length) {
          const sel = document.createElement("select")
          sel.dataset.lang = prefix
          const cur = pickVoice(lang)
          for (const v of list) {
            const o = document.createElement("option")
            o.value = v.name
            o.textContent = `${v.name} (${v.lang})`
            o.selected = !!cur && cur.name === v.name
            sel.append(o)
          }
          label.append(sel)
        } else {
          const none = document.createElement("span")
          none.className = "count"
          none.textContent = "설치된 음성 없음"
          label.append(none)
        }
        panel.append(label)
      }
      const count = document.createElement("div")
      count.className = "count"
      panel.append(count)
      renderProgress()
    }

    // --- 재생
    function halt() {
      token++
      clearTimeout(watchdog)
      engine.cancel()
    }

    function speak() {
      clearTimeout(watchdog)
      if (idx >= chunks.length) return stop()
      const my = ++token
      const c = chunks[idx]
      const v = pickVoice(c.lang)
      mark(c.el)
      renderProgress()

      const advance = () => {
        idx++
        speak()
      }
      engine.speak(c.text, { lang: v ? v.lang : c.lang, voice: v ? v.name : "", rate: settings.rate }, (err) => {
        if (my !== token) return
        if (!err) {
          errors = 0
          return advance()
        }
        if (err === "interrupted") return pause() // 다른 탭/프로그램이 음성을 가로챘다
        if (err === "not-allowed") {
          pause()
          return flash("브라우저가 자동 재생을 막았습니다. ▶️ 를 한 번 눌러 주세요.")
        }
        if (++errors >= 3) {
          stop()
          return flash("음성 엔진 오류로 읽기를 멈췄습니다: " + err)
        }
        advance()
      })
      // onend 가 끝내 오지 않는 경우(원격 음성 끊김, 서비스 워커 종료)를 대비한 안전장치
      watchdog = setTimeout(() => {
        if (my !== token) return
        halt()
        advance()
      }, (c.text.length / (4 * settings.rate)) * 1000 + 8000)
    }

    function start(o) {
      o = o || {}
      halt()
      mark(null)
      attach()
      let blocks
      if (o.text) blocks = [{ el: null, text: cleanText(o.text) }]
      else blocks = collectBlocks(opts.getRoots(), opts.skipSelector, o.range || null)
      chunks = buildChunks(blocks, opts.lang || document.documentElement.lang || "")
      if (!chunks.length) {
        setState("idle")
        if (!o.silent) flash("읽을 텍스트를 찾지 못했습니다.")
        return false
      }
      idx = 0
      errors = 0
      setState("playing")
      speak()
      return true
    }

    function pause() {
      if (state !== "playing") return
      halt()
      setState("paused")
    }

    function resume() {
      if (state !== "paused") return
      setState("playing")
      speak()
    }

    function stop() {
      halt()
      mark(null)
      chunks = []
      idx = 0
      if (state !== "idle") setState("idle")
    }

    function toggle() {
      if (state === "idle") return start()
      if (state === "playing") pause()
      else resume()
    }

    function jump(dir) {
      if (!chunks.length) return
      const cur = chunks[Math.min(idx, chunks.length - 1)].block
      let i = idx
      if (dir > 0) {
        while (i < chunks.length && chunks[i].block === cur) i++
        if (i >= chunks.length) return stop()
      } else {
        while (i > 0 && chunks[i - 1].block === cur) i--
        // 문단 첫 문장에서 누르면 앞 문단으로 간다
        if (i === idx && i > 0) {
          const prev = chunks[i - 1].block
          i--
          while (i > 0 && chunks[i - 1].block === prev) i--
        }
      }
      idx = i
      if (state === "playing") speak()
      else {
        mark(chunks[idx].el)
        renderProgress()
      }
    }

    function stepRate(dir) {
      let i = RATES.findIndex((r) => r >= settings.rate - 0.001)
      if (i < 0) i = RATES.length - 1
      settings.rate = RATES[Math.max(0, Math.min(RATES.length - 1, i + dir))]
      storage.save(settings)
      renderRate()
      if (state === "playing") speak()
    }

    // 본문 분량과 예상 재생 시간. 한국어 약 330자/분, 영어 약 900자/분 (1.0× 기준)
    function estimate() {
      const blocks = collectBlocks(opts.getRoots(), opts.skipSelector, null)
      let chars = 0
      let minutes = 0
      for (const b of blocks) {
        chars += b.text.length
        minutes += b.text.length / (/[\uac00-\ud7a3]/.test(b.text) ? 330 : 900)
      }
      return { chars, minutes: minutes / settings.rate }
    }

    function setAvailable(v) {
      available = !!v
      attach()
      fab.hidden = !(opts.fab && available && state === "idle")
    }

    return {
      start, pause, resume, stop, toggle, estimate, setAvailable, attach, flash,
      get state() {
        return state
      },
    }
  }

  window.RyuTTS = { create, webEngine }
})()
