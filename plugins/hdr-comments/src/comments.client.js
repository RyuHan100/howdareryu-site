// 댓글 위젯 (브라우저에서 실행). build.mjs 가 이 파일을 문자열로 dist 에 넣는다.
// Quartz 는 SPA 라서 페이지를 옮길 때마다 "nav" 이벤트가 오고, 그때 다시 그린다.
;(function () {
  var TOKEN_KEY = "hdr-comments-token"
  var NAME_KEY = "hdr-comments-name"
  var memory = {} // localStorage 가 막힌 브라우저(일부 인앱·사생활 보호 모드)용

  function storeGet(key) {
    try {
      var v = window.localStorage.getItem(key)
      if (v !== null) return v
    } catch (e) {}
    return memory[key] || null
  }

  function storeSet(key, value) {
    memory[key] = value
    try {
      window.localStorage.setItem(key, value)
      return window.localStorage.getItem(key) === value
    } catch (e) {
      return false
    }
  }

  // 쿠키 대신 쓰는 작성자 식별 토큰. 서버에는 해시만 저장된다.
  function authorToken() {
    var token = storeGet(TOKEN_KEY)
    if (token && /^[a-f0-9]{64}$/.test(token)) return token
    var bytes = new Uint8Array(32)
    window.crypto.getRandomValues(bytes)
    token = ""
    for (var i = 0; i < bytes.length; i++) token += ("0" + bytes[i].toString(16)).slice(-2)
    storeSet(TOKEN_KEY, token)
    return token
  }

  function storagePersists() {
    return storeSet("hdr-comments-probe", "1")
  }

  // Worker 의 normalizePage() 와 같은 규칙이어야 한다
  function normalizeKey(p) {
    p = p.normalize("NFC")
    p = p.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "")
    if (p.length > 1) p = p.replace(/\/+$/, "")
    return p
  }

  // 번역본은 서버 컴포넌트가 원본 주소를 data-page 로 넣어 준다
  function pageKey(root) {
    var given = root && root.getAttribute("data-page")
    if (given) return normalizeKey(given)
    var p = window.location.pathname
    try {
      p = decodeURIComponent(p)
    } catch (e) {}
    return normalizeKey(p)
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  function formatDate(iso) {
    var d = new Date(iso)
    if (isNaN(d)) return ""
    try {
      return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
    } catch (e) {
      return d.toLocaleString()
    }
  }

  function request(api, method, path, body) {
    var headers = { "X-Author-Token": authorToken() }
    if (body) headers["Content-Type"] = "application/json"
    return fetch(api + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
      cache: "no-store",
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {}
        })
        .then(function (data) {
          if (!res.ok) throw new Error(data.error || "요청에 실패했습니다.")
          return data
        })
    })
  }

  function mount(root) {
    var api = (root.getAttribute("data-api") || "").replace(/\/+$/, "")
    var page = pageKey(root)
    root.textContent = ""

    var title = el("h2", "hdr-comments-title", "댓글")
    var count = el("span", "hdr-comments-count")
    title.appendChild(count)
    root.appendChild(title)

    var list = el("ul", "hdr-comments-list")
    root.appendChild(list)

    if (!api) {
      list.appendChild(el("li", "hdr-comments-empty", "댓글 서버가 설정되지 않았습니다."))
      return
    }

    // ---- 작성 폼 ----------------------------------------------------------
    var form = el("form", "hdr-comments-form")
    form.setAttribute("novalidate", "")

    var nameInput = el("input", "hdr-comments-name")
    nameInput.type = "text"
    nameInput.name = "name"
    nameInput.required = true
    nameInput.maxLength = 40
    nameInput.placeholder = "이름 (필수)"
    nameInput.setAttribute("aria-label", "이름")
    nameInput.autocomplete = "nickname"
    nameInput.value = storeGet(NAME_KEY) || ""

    var contentInput = el("textarea", "hdr-comments-content")
    contentInput.name = "content"
    contentInput.required = true
    contentInput.maxLength = 2000
    contentInput.rows = 4
    contentInput.placeholder = "댓글을 남겨 주세요"
    contentInput.setAttribute("aria-label", "댓글 내용")

    // 허니팟: 사람에게는 보이지 않는 칸. 봇이 채우면 서버가 버린다.
    var trap = el("input", "hdr-comments-trap")
    trap.type = "text"
    trap.name = "website"
    trap.tabIndex = -1
    trap.autocomplete = "off"
    trap.setAttribute("aria-hidden", "true")

    var privateLabel = el("label", "hdr-comments-private")
    var privateInput = el("input")
    privateInput.type = "checkbox"
    privateInput.name = "is_private"
    privateLabel.appendChild(privateInput)
    privateLabel.appendChild(el("span", null, "비공개 (나와 관리자만 볼 수 있음)"))

    var hint = el("p", "hdr-comments-hint")
    hint.hidden = true

    var submit = el("button", "hdr-comments-submit", "댓글 남기기")
    submit.type = "submit"

    var status = el("p", "hdr-comments-status")
    status.setAttribute("role", "status")
    status.setAttribute("aria-live", "polite")

    var footer = el("div", "hdr-comments-footer")
    footer.appendChild(privateLabel)
    footer.appendChild(submit)

    form.appendChild(nameInput)
    form.appendChild(contentInput)
    form.appendChild(trap)
    form.appendChild(footer)
    form.appendChild(hint)
    form.appendChild(status)
    root.appendChild(form)

    privateInput.addEventListener("change", function () {
      hint.hidden = !privateInput.checked
      if (!privateInput.checked) return
      hint.textContent = storagePersists()
        ? "비공개 댓글은 지금 쓰는 이 브라우저에서만 다시 볼 수 있습니다. 카카오톡·인스타그램 안에서 열었다면, 다음에도 같은 앱 안에서 열어야 보입니다."
        : "이 브라우저는 기록을 저장하지 못해, 비공개 댓글은 이 페이지를 떠나면 다시 볼 수 없습니다. 관리자에게는 전달됩니다."
    })

    // ---- 목록 -------------------------------------------------------------
    function setStatus(text, isError) {
      status.textContent = text || ""
      status.classList.toggle("is-error", !!isError)
    }

    function renderItem(c) {
      var li = el("li", "hdr-comment")
      if (c.hidden) {
        li.classList.add("is-hidden")
        li.appendChild(el("span", "hdr-comment-lock", "비공개 댓글입니다."))
        li.appendChild(el("time", "hdr-comment-date", formatDate(c.created_at)))
        return li
      }

      if (c.is_private) li.classList.add("is-private")
      var head = el("div", "hdr-comment-head")
      head.appendChild(el("strong", "hdr-comment-name", c.name))
      if (c.is_private) head.appendChild(el("span", "hdr-comment-badge", "비공개"))
      var time = el("time", "hdr-comment-date", formatDate(c.created_at))
      time.dateTime = c.created_at
      head.appendChild(time)
      li.appendChild(head)

      // textContent 로만 넣는다: 댓글에 든 HTML 은 글자 그대로 보인다
      li.appendChild(el("p", "hdr-comment-body", c.content))

      if (c.mine) {
        var del = el("button", "hdr-comment-delete", "삭제")
        del.type = "button"
        del.addEventListener("click", function () {
          if (!window.confirm("이 댓글을 삭제할까요?")) return
          del.disabled = true
          request(api, "DELETE", "/api/comments/" + c.id)
            .then(load)
            .catch(function (err) {
              del.disabled = false
              setStatus(err.message, true)
            })
        })
        head.appendChild(del)
      }
      return li
    }

    function render(comments) {
      list.textContent = ""
      count.textContent = comments.length ? " " + comments.length : ""
      if (!comments.length) {
        list.appendChild(el("li", "hdr-comments-empty", "아직 댓글이 없습니다. 첫 댓글을 남겨 보세요."))
        return
      }
      comments.forEach(function (c) {
        list.appendChild(renderItem(c))
      })
    }

    function load() {
      return request(api, "GET", "/api/comments?page=" + encodeURIComponent(page))
        .then(function (data) {
          // 응답을 기다리는 사이 다른 페이지로 옮겨 갔으면 버린다
          if (!root.isConnected || page !== pageKey(root)) return
          render(data.comments || [])
        })
        .catch(function () {
          if (!root.isConnected) return
          list.textContent = ""
          list.appendChild(el("li", "hdr-comments-empty", "댓글을 불러오지 못했습니다."))
        })
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault()
      var name = nameInput.value.trim()
      var content = contentInput.value.trim()
      if (!name) {
        setStatus("이름을 입력해 주세요.", true)
        nameInput.focus()
        return
      }
      if (!content) {
        setStatus("내용을 입력해 주세요.", true)
        contentInput.focus()
        return
      }

      submit.disabled = true
      setStatus("보내는 중…")
      request(api, "POST", "/api/comments", {
        page: page,
        name: name,
        content: content,
        is_private: privateInput.checked,
        website: trap.value,
      })
        .then(function () {
          storeSet(NAME_KEY, name)
          contentInput.value = ""
          setStatus(privateInput.checked ? "비공개 댓글을 남겼습니다." : "댓글을 남겼습니다.")
          return load()
        })
        .catch(function (err) {
          setStatus(err.message || "댓글을 보내지 못했습니다.", true)
        })
        .then(function () {
          submit.disabled = false
        })
    })

    load()
  }

  function init() {
    var roots = document.querySelectorAll(".hdr-comments")
    for (var i = 0; i < roots.length; i++) mount(roots[i])
  }

  document.addEventListener("nav", init)
})()
