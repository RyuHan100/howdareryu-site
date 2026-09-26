// 서버(빌드) 쪽 컴포넌트. gallery-page 와 같은 방식으로 preact vnode 를 직접 만든다(Quartz 는
// 플러그인 dist 의 npm 의존성을 허용하지 않는다 — node: 내장 모듈만 쓴다). h/esc 는 다른
// 플러그인에도 각자 있는데, 서로 다른 dist 번들이라 공유가 안 돼 여기 다시 만든다.
// Component.css/afterDOMLoaded 의 자리표시자는 build.mjs 가 채운다. quartz.config.yaml 에서
// layout.condition: "timeline" 으로 등록해 content/timeline.md 에서만 나오게 한다
// (quartz.ts 의 registerCondition). 이벤트 데이터는 콘텐츠(마크다운 파이프라인 대상)가
// 아니라 이 플러그인 전용 빌드 데이터라 content/ 가 아니라 플러그인 옆(data/)에 둔다 —
// content/timeline/ 폴더를 만들면 오솔길(탐색기)에 드롭다운 폴더로 보여서 피한다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

const TIMELINE_DATA_PATH = join(process.cwd(), "plugins/climate-timeline/data/climate-timeline.json")
// climate glossary ↔ climate histography 상호 링크(2026-09-26)용. 이벤트의 glossaryTerms 는
// 여기서 용어 이름표(term)로 바꿔서 상세 카드에 칩으로 보여준다 — 판정을 다시 하지 않고
// climate-glossary.json 을 그대로 읽기만 한다(정원 데이터를 다른 컴포넌트가 읽는 것과 같은 방식).
const GLOSSARY_DATA_PATH = join(process.cwd(), "plugins/climate-glossary/data/climate-glossary.json")

function readTimelineData() {
  try {
    return JSON.parse(readFileSync(TIMELINE_DATA_PATH, "utf-8"))
  } catch {
    return null
  }
}

function readGlossaryTermLabels() {
  try {
    const data = JSON.parse(readFileSync(GLOSSARY_DATA_PATH, "utf-8"))
    const map = {}
    for (const t of data.terms ?? []) {
      if (t?.id) map[t.id] = t.term
    }
    return map
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

export const ClimateTimeline = () => {
  const Component = ({ displayClass }) => {
    const data = readTimelineData()
    const events = data?.events ?? []
    const categories = data?.categories ?? []
    const glossaryLabels = readGlossaryTermLabels()
    const html = events.length > 0 ? renderTimeline(events, categories, glossaryLabels) : null

    if (!html) {
      return h("section", {
        class: [displayClass, "climate-timeline"].filter(Boolean).join(" "),
        children: [h("p", { class: "climate-timeline-note", children: "아직 연표에 채운 사건이 없어요." })],
      })
    }

    return h("section", {
      class: [displayClass, "climate-timeline"].filter(Boolean).join(" "),
      children: [
        h("p", {
          class: "sr-only",
          children:
            "1824년부터 지금까지 기후 관련 사건을 월 단위로 배치한 가로 타임라인입니다. 위 카테고리 버튼으로 필터링할 수 있고, 타임라인 영역만 가로로 스크롤됩니다. 각 점에는 사건 제목·분류·날짜가 붙어 있습니다. −/+/Reset 버튼이나 Ctrl(또는 Cmd)을 누른 채 휠을 굴려 확대·축소할 수 있고, 연도를 누르면 그 구간으로 이동합니다.",
        }),
        h("div", { dangerouslySetInnerHTML: { __html: html } }),
      ],
    })
  }

  Component.css = __STYLES__
  Component.afterDOMLoaded = __SCRIPT__
  return Component
}
