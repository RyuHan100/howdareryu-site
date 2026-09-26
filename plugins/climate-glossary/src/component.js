// 서버(빌드) 쪽 컴포넌트. climate-timeline/gallery-page 와 같은 방식으로 preact vnode 를 직접
// 만든다(Quartz 는 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). h 는
// 다른 플러그인에도 각자 있는데, 서로 다른 dist 번들이라 공유가 안 돼 여기 다시 만든다.
// Component.css/afterDOMLoaded 의 자리표시자는 build.mjs 가 채운다. quartz.config.yaml 에서
// layout.condition: "glossary" 로 등록해 content/glossary.md 에서만 나오게 한다
// (quartz.ts 의 registerCondition). 용어 데이터는 콘텐츠(마크다운 파이프라인 대상)가 아니라 이
// 플러그인 전용 빌드 데이터라 content/ 가 아니라 플러그인 옆(data/)에 둔다 — climate-timeline 과
// 같은 이유(content/glossary/ 폴더를 만들면 오솔길에 드롭다운 폴더로 보인다).
import { readFileSync } from "node:fs"
import { join } from "node:path"

const GLOSSARY_DATA_PATH = join(process.cwd(), "plugins/climate-glossary/data/climate-glossary.json")
// climate glossary ↔ climate histography 상호 링크(2026-09-26)용. climate-timeline.json 의
// 이벤트가 declare 하는 glossaryTerms(용어 id 목록)를 그대로 읽어 "용어 → 사건" 역인덱스를
// 여기서 한 번만 만든다 — climate-timeline.json 은 사건마다 자기가 어떤 용어와 관련 있는지만
// 적어 두고, "이 용어를 언급한 사건이 뭐가 있는지"는 계산하지 않는다(같은 관계를 두 파일에
// 중복해서 적어두지 않기 위해, 단일 출처는 항상 climate-timeline.json 쪽).
const TIMELINE_DATA_PATH = join(process.cwd(), "plugins/climate-timeline/data/climate-timeline.json")

function readGlossaryData() {
  try {
    return JSON.parse(readFileSync(GLOSSARY_DATA_PATH, "utf-8"))
  } catch {
    return null
  }
}

function readEventsByTerm() {
  try {
    const data = JSON.parse(readFileSync(TIMELINE_DATA_PATH, "utf-8"))
    const events = Array.isArray(data.events) ? data.events : []
    const byTerm = {}
    for (const ev of events) {
      for (const termId of ev.glossaryTerms || []) {
        if (!byTerm[termId]) byTerm[termId] = []
        byTerm[termId].push({ id: ev.id, title: ev.title })
      }
    }
    return byTerm
  } catch {
    return {}
  }
}

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

export const ClimateGlossary = () => {
  const Component = ({ displayClass }) => {
    const data = readGlossaryData()
    const terms = data?.terms ?? []
    const categories = data?.categories ?? []
    const eventsByTerm = readEventsByTerm()
    const html = terms.length > 0 ? renderGlossary(terms, categories, eventsByTerm) : null

    if (!html) {
      return h("section", {
        class: [displayClass, "climate-glossary"].filter(Boolean).join(" "),
        children: [h("p", { class: "climate-glossary-note", children: "아직 채운 용어가 없어요." })],
      })
    }

    return h("section", {
      class: [displayClass, "climate-glossary"].filter(Boolean).join(" "),
      children: [
        h("p", {
          class: "sr-only",
          children:
            "기후·에너지·탄소시장 관련 용어와 약어를 찾아보는 용어집입니다. 검색창에 낱말을 입력하거나 카테고리 버튼으로 좁혀 볼 수 있습니다. 카드를 클릭하면 자세한 설명과 출처, 관련 용어가 담긴 패널이 열립니다.",
        }),
        h("div", { dangerouslySetInnerHTML: { __html: html } }),
      ],
    })
  }

  Component.css = __STYLES__
  Component.afterDOMLoaded = __SCRIPT__
  return Component
}
