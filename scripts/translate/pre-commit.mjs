// pre-commit 훅(.husky/pre-commit)이 부른다.
// 스테이징된 content/ 의 한국어 노트 중 frontmatter 에 `translate: true` 가 있는 것(홈 content/index.md 는
// 플래그 없이 항상)을 claude CLI 로 통째로 영어로 옮겨 옆에 `노트.en.md` 로 쓰고 같은 커밋에 넣는다.
// 하나라도 실패하면 아무 파일도 쓰지 않고 커밋을 멈춘다. 한국어 원본은 읽기만 한다.
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

const MODEL = "claude-opus-5-5"
const TIMEOUT_MS = 10 * 60 * 1000
const HOME_NOTE = "content/index.md"
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
// 영문본에는 넣지 않는 키: translate 는 훅 전용 플래그, aliases 는 옛 주소를 원본으로 보내는
// 리다이렉트라 영문본에 복사하면 같은 주소를 두 페이지가 차지한다.
const DROP_KEYS = ["translate", "aliases"]
const TRANSLATED_KEYS = ["title", "description"]

const here = path.dirname(fileURLToPath(import.meta.url))
const log = (msg) => console.error(`[translate] ${msg}`)
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })

function fail(msg) {
  log(`실패: ${msg}`)
  log("커밋을 멈췄습니다. 고친 뒤 다시 커밋하거나, 번역 없이 커밋하려면 git commit --no-verify")
  process.exit(1)
}

function splitFrontmatter(text) {
  const m = text.match(FRONTMATTER)
  if (!m) return { fm: {}, body: text }
  const fm = YAML.parse(m[1]) ?? {}
  if (typeof fm !== "object" || Array.isArray(fm))
    throw new Error("frontmatter 가 YAML 객체가 아님")
  return { fm, body: text.slice(m[0].length) }
}

function isTarget(file, fm) {
  return file === HOME_NOTE || fm.translate === true
}

function stagedCandidates() {
  return git("diff", "--cached", "--name-only", "--diff-filter=AM", "-z")
    .split("\0")
    .filter(
      (f) =>
        f.startsWith("content/") &&
        f.endsWith(".md") &&
        !/\.[a-z]{2}(?:-[a-z]{2})?\.md$/i.test(f) &&
        !f.startsWith("content/radar/"),
    )
}

function translate(file, source, systemPrompt) {
  const res = spawnSync(
    process.env.TRANSLATE_CLAUDE_BIN || "claude",
    [
      "-p",
      "--model",
      MODEL,
      "--tools",
      "",
      "--system-prompt",
      systemPrompt,
      "--no-session-persistence",
      "--output-format",
      "text",
    ],
    {
      input: source,
      encoding: "utf-8",
      // 저장소의 CLAUDE.md 를 읽지 않도록 임시 폴더에서 실행한다
      cwd: os.tmpdir(),
      timeout: TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  if (res.error) throw new Error(`${file}: claude 실행 실패 — ${res.error.message}`)
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim().split("\n").slice(-3).join(" / ")
    throw new Error(`${file}: claude 가 코드 ${res.status} 로 끝남 — ${detail}`)
  }
  return res.stdout
}

function assemble(file, originalFm, output) {
  const text = output.trim().replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, "$1")
  if (!text.startsWith("---"))
    throw new Error(`${file}: 번역 결과가 frontmatter(---)로 시작하지 않음`)
  const { fm: translatedFm, body } = splitFrontmatter(text)
  if (!body.trim()) throw new Error(`${file}: 번역 결과 본문이 비어 있음`)

  const fm = { ...originalFm }
  for (const key of TRANSLATED_KEYS) {
    if (key in fm && typeof translatedFm[key] === "string" && translatedFm[key].trim())
      fm[key] = translatedFm[key]
  }
  for (const key of DROP_KEYS) delete fm[key]
  return `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n${body.startsWith("\n") ? body : "\n" + body}`
}

function main() {
  if (process.env.CI) return

  const root = git("rev-parse", "--show-toplevel").trim()
  const targets = []
  for (const file of stagedCandidates()) {
    const source = git("show", `:${file}`)
    let fm
    try {
      fm = splitFrontmatter(source).fm
    } catch (e) {
      if (file === HOME_NOTE) fail(`${file}: frontmatter 를 읽지 못함 — ${e.message}`)
      continue
    }
    if (isTarget(file, fm)) targets.push({ file, source, fm })
  }
  if (targets.length === 0) return

  const systemPrompt =
    fs.readFileSync(path.join(here, "prompt.md"), "utf-8") +
    "\n\n## 용어집 (YAML: 원문 → 영문)\n\n" +
    fs.readFileSync(path.join(here, "glossary.yaml"), "utf-8")

  const results = []
  for (const [i, t] of targets.entries()) {
    log(`${i + 1}/${targets.length} ${t.file} 영어로 옮기는 중 (${MODEL})…`)
    try {
      results.push({
        file: t.file,
        text: assemble(t.file, t.fm, translate(t.file, t.source, systemPrompt)),
      })
    } catch (e) {
      fail(e.message)
    }
  }

  for (const r of results) {
    const out = r.file.replace(/\.md$/, ".en.md")
    if (out === r.file || !out.endsWith(".en.md")) fail(`${r.file}: 영문본 경로 계산이 이상함`)
    fs.writeFileSync(path.join(root, out), r.text)
    git("add", "--", out)
    log(`→ ${out}`)
  }
}

main()
