// src → dist. 의존성 없이 node 만으로 돈다: `node build.mjs`
// 다른 로컬 플러그인과 달리 클라이언트 스크립트/CSS 가 없는 순수 변환기라 __STYLES__/__SCRIPT__
// 자리표시자 치환이 필요 없다 — src 파일을 그대로 이어붙이기만 한다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const read = (name) => readFileSync(new URL(`./src/${name}`, import.meta.url), "utf-8")

const out = read("transformer.js")

const banner = "// 자동 생성 파일. src/ 를 고친 뒤 `node build.mjs` 로 다시 만든다.\n"
const types = "export declare const GlossaryLinker: (opts?: unknown) => unknown\n"

mkdirSync(new URL("./dist/", import.meta.url), { recursive: true })
writeFileSync(new URL("./dist/index.js", import.meta.url), banner + out)
writeFileSync(new URL("./dist/index.d.ts", import.meta.url), types)
console.log("built dist/")
