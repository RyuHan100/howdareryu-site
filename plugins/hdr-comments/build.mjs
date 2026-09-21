// src → dist. 의존성 없이 node 만으로 돈다: `node build.mjs`
// dist 는 저장소에 같이 올린다 (Quartz 는 dist 가 있으면 플러그인을 빌드하지 않는다).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = (name) => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf-8")

const out = read("component.js")
  .replace("__STYLES__", () => JSON.stringify(read("comments.css")))
  .replace("__CLIENT_SCRIPT__", () => JSON.stringify(read("comments.client.js")))

const banner = "// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.\n"
const types =
  'export type HdrCommentsOptions = { apiBase: string; exclude?: string[] }\n' +
  "export declare const HdrComments: (opts?: HdrCommentsOptions) => unknown\n"

for (const dir of ["dist", "dist/components"]) {
  mkdirSync(new URL(`./${dir}/`, import.meta.url), { recursive: true })
  writeFileSync(new URL(`./${dir}/index.js`, import.meta.url), banner + out)
  writeFileSync(new URL(`./${dir}/index.d.ts`, import.meta.url), types)
}
console.log("built dist/")
