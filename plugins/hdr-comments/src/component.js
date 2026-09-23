// 서버(빌드) 쪽 컴포넌트. 빈 상자 하나만 찍고, 나머지는 comments.client.js 가 브라우저에서 그린다.
// 외부 import 없이 preact vnode 를 직접 만든다 (Quartz 는 플러그인 dist 의 외부 의존성을 허용하지 않는다).
// 아래 CSS·스크립트 자리표시자는 build.mjs 가 채운다.

let vnodeId = 0
function h(type, props) {
  return {
    type,
    props,
    key: undefined,
    ref: undefined,
    __k: null,
    __: null,
    __b: 0,
    __e: null,
    __c: null,
    constructor: undefined,
    __v: --vnodeId,
    __i: -1,
    __u: 0,
  }
}

export const HdrComments = (opts) => {
  const apiBase = (opts?.apiBase ?? "").replace(/\/+$/, "")
  const exclude = opts?.exclude ?? []

  const Component = ({ displayClass, fileData }) => {
    const override = fileData.frontmatter?.comments
    const slug = fileData.slug ?? ""
    // 번역본(quartz-multilanguage 의 "노트.en")은 원본과 같은 댓글 스레드를 쓴다
    const baseSlug = fileData.multilanguage?.baseSlug || slug
    const excluded = exclude.some(
      (prefix) => baseSlug === prefix || baseSlug.startsWith(prefix + "/"),
    )
    if (override === false || override === "false" || excluded) return null

    return h("section", {
      class: [displayClass, "hdr-comments"].filter(Boolean).join(" "),
      "data-api": apiBase,
      "data-page": baseSlug !== slug ? "/" + baseSlug : undefined,
      children: h("noscript", { children: "댓글을 보려면 자바스크립트가 필요합니다." }),
    })
  }

  Component.css = __STYLES__
  Component.afterDOMLoaded = __CLIENT_SCRIPT__
  return Component
}
