// 노트 본문(마크다운→HTML 변환 결과, rehype 트리)에서 climate-glossary 용어가 등장하면
// 자동으로 <a class="glossary-ref" href="/glossary#id" data-no-popover> 로 감싼다. 진짜
// <a> 태그라 JS 가 없어도 클릭하면 용어집으로 이동한다(progressive enhancement) — 호버 시
// 이 용어 하나의 정의만 보여주는 작은 툴팁은 quartz/static/glossary-tooltip.js 가
// 클라이언트에서 얹는다(Quartz 기본 팝오버는 data-no-popover 로 꺼둔다).
//
// 페이지 전체가 아니라 노트 본문(markdown 파이프라인)에만 적용된다 — 정원 홈·radar·climate
// glossary·climate histography 처럼 dangerouslySetInnerHTML 로 직접 그리는 컴포넌트는 이
// 파이프라인을 안 거치므로 영향받지 않는다(용어집 카드 자기 자신이 다시 감싸일 걱정 없음).
//
// unist-util-visit 대신 손으로 직접 트리를 순회한다 — a/code/pre/script/style 안에서는
// 건너뛰어야 하는데, 그 조상 판정을 재귀 호출의 매개변수(skip)로 자연스럽게 물려줄 수 있어서
// 굳이 별도 유틸을 쓸 필요가 없다(climate-timeline 등 다른 로컬 플러그인도 작은 헬퍼는
// 각자 새로 만드는 것과 같은 이유).
import { readFileSync } from "node:fs"
import { join } from "node:path"

const GLOSSARY_DATA_PATH = join(process.cwd(), "plugins/climate-glossary/data/climate-glossary.json")

function readTerms() {
  try {
    const data = JSON.parse(readFileSync(GLOSSARY_DATA_PATH, "utf-8"))
    return Array.isArray(data.terms) ? data.terms : []
  } catch {
    return []
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isAsciiWordChar(ch) {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch)
}

const SKIP_TAGS = new Set(["a", "code", "pre", "script", "style", "title", "textarea", "svg"])

export const GlossaryLinker = () => {
  const terms = readTerms()
  // 긴 용어를 먼저 시도해야 "온실가스 감축목표" 안의 "온실가스"처럼 짧은 용어가 먼저
  // 먹어버리는 걸 막는다(정규식 alternation 은 같은 시작 위치에서 먼저 나열된 것을 고른다).
  const sorted = [...terms]
    .filter((t) => t && t.id && t.term)
    .sort((a, b) => b.term.length - a.term.length)
  const idByTerm = new Map(sorted.map((t) => [t.term, t.id]))
  const pattern = sorted.length > 0 ? new RegExp(sorted.map((t) => escapeRegExp(t.term)).join("|"), "g") : null

  return {
    name: "GlossaryLinker",
    htmlPlugins() {
      if (!pattern) return []
      return [
        () => (tree, file) => {
          const slug = file?.data?.slug
          // 용어집 자기 자신 페이지, 영문 번역본(.en)은 대상에서 뺀다.
          if (!slug || slug === "glossary" || /\.en$/.test(slug)) return
          const seen = new Set()

          function linkify(text) {
            pattern.lastIndex = 0
            let match
            let lastIndex = 0
            let changed = false
            const out = []
            while ((match = pattern.exec(text))) {
              const word = match[0]
              const start = match.index
              const id = idByTerm.get(word)
              const before = text[start - 1]
              const after = text[start + word.length]
              // 영문/숫자로 시작하는 약어는 앞뒤가 영문/숫자가 아닐 때만 매치한다(다른 단어의
              // 일부를 잘못 잡지 않게). 한글 용어는 뒤에 조사가 바로 붙는 게 자연스러워서
              // 별도 경계 검사를 하지 않는다.
              const isAsciiTerm = /^[A-Za-z0-9]/.test(word)
              const boundaryOk =
                !isAsciiTerm || (!isAsciiWordChar(before) && !isAsciiWordChar(after))
              if (!boundaryOk || seen.has(id)) {
                pattern.lastIndex = start + 1
                continue
              }
              seen.add(id)
              changed = true
              if (start > lastIndex) out.push({ type: "text", value: text.slice(lastIndex, start) })
              out.push({
                type: "element",
                tagName: "a",
                properties: {
                  className: ["glossary-ref"],
                  href: "/glossary#" + id,
                  "data-term-id": id,
                  // Quartz 기본 팝오버(호버 시 링크 대상 페이지 전체를 미리보기)를 끈다 —
                  // 대신 quartz/static/glossary-tooltip.js 가 이 용어 하나의 정의만 보여주는
                  // 작은 툴팁을 그린다(citations 플러그인이 참고문헌 링크에 쓰는 것과 같은 방식,
                  // quartz/components/scripts/popover.inline.ts 가 이 속성을 확인한다).
                  "data-no-popover": true,
                },
                children: [{ type: "text", value: word }],
              })
              lastIndex = start + word.length
            }
            if (!changed) return null
            if (lastIndex < text.length) out.push({ type: "text", value: text.slice(lastIndex) })
            return out
          }

          function walk(node, skip) {
            if (!node || !Array.isArray(node.children)) return
            for (let i = 0; i < node.children.length; i++) {
              const child = node.children[i]
              if (child.type === "element") {
                walk(child, skip || SKIP_TAGS.has(child.tagName))
              } else if (child.type === "text" && !skip && child.value.trim()) {
                const replaced = linkify(child.value)
                if (replaced) {
                  node.children.splice(i, 1, ...replaced)
                  i += replaced.length - 1
                }
              }
            }
          }

          walk(tree, false)
        },
      ]
    },
  }
}
