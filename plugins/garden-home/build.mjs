// src → dist. 의존성 없이 node 만으로 돈다: `node build.mjs`
// dist 는 저장소에 같이 올린다 (Quartz 는 dist 가 있으면 플러그인을 빌드하지 않는다).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = (name) => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf-8")

// garden-svg.js/radar-svg.js/gallery-svg.js(순수 함수)를 component.js 앞에 붙인다. import 문은
// ESM 에서 어디 있든 끌어올려진다. 클라이언트 스크립트(afterDOMLoaded)는 세 개를 이어 붙여
// 하나의 문자열로 만든다 — 각자 "nav" 리스너를 걸고 서로 다른 섹션(.garden-home-garden/
// .garden-home-radar/.garden-home-gallery)만 찾으므로 순서는 안 중요하다.
const out = (
  read("garden-svg.js") + "\n" + read("radar-svg.js") + "\n" + read("gallery-svg.js") + "\n" + read("component.js")
)
  .replace("__STYLES__", () => JSON.stringify(read("garden-home.css")))
  .replace("__SCRIPT__", () =>
    JSON.stringify(
      read("garden-interactive.js") + "\n" + read("radar-interactive.js") + "\n" + read("gallery-interactive.js"),
    ),
  )

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
