// src → dist. 의존성 없이 node 만으로 돈다: `node build.mjs`
// dist 는 저장소에 같이 올린다 (Quartz 는 dist 가 있으면 플러그인을 빌드하지 않는다).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = (name) => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf-8")
// climate-timeline 플러그인의 소스를 그대로 가져다 쓴다(다른 플러그인 dist 는 import 로 못
// 불러오지만, 빌드 스크립트 단계에서 그 플러그인의 src 파일을 문자열로 읽어 오는 건 된다).
// 홈에 climate histography 전체를 넣되(사용자 지시, 2026-09-23) render 함수를 따로 베껴
// 쓰지 않고 원본 파일을 그대로 이어 붙이는 이유: climate-timeline.json 에 이벤트를 추가하면
// /timeline/ 페이지와 홈이 "같은 함수" 를 실행하므로 둘이 어긋날 일이 없다(복사본이었다면
// 한쪽만 고치고 잊어버리는 사고가 날 수 있다).
const readShared = (relPath) => readFileSync(new URL(relPath, import.meta.url), "utf-8")

// garden-svg.js/radar-svg.js/gallery-svg.js/timeline-render.js(전부 순수 함수)를 component.js
// 앞에 붙인다. import 문은 ESM 에서 어디 있든 끌어올려진다. 클라이언트 스크립트
// (afterDOMLoaded)는 네 개를 이어 붙여 하나의 문자열로 만든다 — 각자 "nav" 리스너를 걸고
// 서로 다른 섹션(.garden-home-garden/.garden-home-radar/.garden-home-gallery/.climate-timeline)
// 만 찾으므로 순서는 안 중요하다.
// timeline-scale.js(날짜<->px 순수 함수)도 timeline-render.js 와 함께 그대로 가져온다 —
// /timeline/ 페이지와 정확히 같은 위치 계산을 쓰기 위해서다(climate-timeline/build.mjs 참고).
const out = (
  read("garden-svg.js") +
  "\n" +
  read("radar-svg.js") +
  "\n" +
  read("gallery-svg.js") +
  "\n" +
  readShared("../climate-timeline/src/timeline-scale.js") +
  "\n" +
  readShared("../climate-timeline/src/timeline-render.js") +
  "\n" +
  read("component.js")
)
  .replace("__STYLES__", () => JSON.stringify(read("garden-home.css")))
  .replace("__SCRIPT__", () => {
    // timeline-interactive.js 는 자기 IIFE 안에 timeline-scale.js + timeline-view.js(줌
    // 컨트롤러)를 이어붙인 채로 들어가야 한다(climate-timeline/build.mjs 와 같은 이유 —
    // 이 파일들의 최상위 함수 선언이 garden/radar/gallery 인터랙티브 코드와 이름이 안
    // 겹치려면 timeline-interactive.js 자신의 IIFE 안에서만 존재해야 한다).
    const timelineClientCore =
      readShared("../climate-timeline/src/timeline-scale.js") +
      "\n" +
      readShared("../climate-timeline/src/timeline-view.js")
    const timelineScript = readShared("../climate-timeline/src/timeline-interactive.js").replace(
      "// __TL_SCALE_AND_VIEW__",
      () => timelineClientCore,
    )
    return JSON.stringify(
      read("garden-interactive.js") + "\n" + read("radar-interactive.js") + "\n" + read("gallery-interactive.js") + "\n" + timelineScript,
    )
  })

const banner = "// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.\n"
const types =
  "export type GardenHomeOptions = { garden?: boolean; radar?: boolean; gallery?: boolean }\n" +
  "export declare const GardenHome: (opts?: GardenHomeOptions) => unknown\n"

for (const dir of ["dist", "dist/components"]) {
  mkdirSync(new URL(`./${dir}/`, import.meta.url), { recursive: true })
  writeFileSync(new URL(`./${dir}/index.js`, import.meta.url), banner + out)
  writeFileSync(new URL(`./${dir}/index.d.ts`, import.meta.url), types)
}
console.log("built dist/")
