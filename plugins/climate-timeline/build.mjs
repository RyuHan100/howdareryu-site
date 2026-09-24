// src → dist. 의존성 없이 node 만으로 돈다: `node build.mjs`
// dist 는 저장소에 같이 올린다 (Quartz 는 dist 가 있으면 플러그인을 빌드하지 않는다).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = (name) => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf-8")

// timeline-scale.js(날짜<->px 순수 함수) + timeline-render.js(순수 함수)를 component.js 앞에
// 붙인다 — 서버는 ES 모듈이라 이 정도 최상위 함수 나열은 자기 모듈 스코프라 안전하다.
const serverCore = read("timeline-scale.js") + "\n" + read("timeline-render.js")

// 클라이언트: timeline-scale.js + timeline-view.js(줌 컨트롤러)를 timeline-interactive.js 의
// IIFE 안, "__TL_SCALE_AND_VIEW__" 표시 자리에 그대로 이어붙인다 — 그래야 이 파일들이 다른
// 컴포넌트와 한 스코프를 공유하는 번들(garden-home)에 들어가도 이름이 안 새어나간다.
const clientCore = read("timeline-scale.js") + "\n" + read("timeline-view.js")
const clientScript = read("timeline-interactive.js").replace("// __TL_SCALE_AND_VIEW__", () => clientCore)

const out = (serverCore + "\n" + read("component.js"))
  .replace("__STYLES__", () => JSON.stringify(read("timeline.css")))
  .replace("__SCRIPT__", () => JSON.stringify(clientScript))

const banner = "// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.\n"
const types = "export declare const ClimateTimeline: () => unknown\n"

for (const dir of ["dist", "dist/components"]) {
  mkdirSync(new URL(`./${dir}/`, import.meta.url), { recursive: true })
  writeFileSync(new URL(`./${dir}/index.js`, import.meta.url), banner + out)
  writeFileSync(new URL(`./${dir}/index.d.ts`, import.meta.url), types)
}
console.log("built dist/")
