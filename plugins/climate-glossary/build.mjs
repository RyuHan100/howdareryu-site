// src → dist. 의존성 없이 node 만으로 돈다: `node build.mjs`
// dist 는 저장소에 같이 올린다 (Quartz 는 dist 가 있으면 플러그인을 빌드하지 않는다).
// climate-timeline 의 build.mjs 와 같은 방식(server core + component, client script 를
// __STYLES__/__SCRIPT__ 자리에 JSON 문자열로 끼워 넣는다) — 이 플러그인은 날짜 축이 없어
// timeline-scale.js/timeline-view.js 같은 별도 순수 계산 모듈을 안 쓰고 render/interactive
// 두 파일로 충분하다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = (name) => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf-8")

const serverCore = read("glossary-render.js")
const clientScript = read("glossary-interactive.js")

const out = (serverCore + "\n" + read("component.js"))
  .replace("__STYLES__", () => JSON.stringify(read("glossary.css")))
  .replace("__SCRIPT__", () => JSON.stringify(clientScript))

const banner = "// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.\n"
const types = "export declare const ClimateGlossary: () => unknown\n"

for (const dir of ["dist", "dist/components"]) {
  mkdirSync(new URL(`./${dir}/`, import.meta.url), { recursive: true })
  writeFileSync(new URL(`./${dir}/index.js`, import.meta.url), banner + out)
  writeFileSync(new URL(`./${dir}/index.d.ts`, import.meta.url), types)
}
console.log("built dist/")
