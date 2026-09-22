// garden.yaml 의 home 항목(정원/radar/아빠의 화단 구역 on/off)을 quartz.config.yaml 의
// garden-home 플러그인 options 에 반영한다. syncExplorerFromGarden.ts 와 같은 방식(마커
// 구간만 재생성) — 이쪽은 브라우저에서 실행할 JS 문자열이 아니라 그냥 boolean 값이라 더 단순하다.
import fs from "fs"
import path from "path"
import { loadGardenDataConfig } from "./config"

const CONFIG_YAML_PATH = path.join(process.cwd(), "quartz.config.yaml")

const ANCHOR = "  - source: ./plugins/garden-home"
const OPTIONS_ANCHOR = "\n    options:\n"
const MARKER_START =
  "      # === garden.yaml 자동 생성 시작 (직접 고치지 말고 garden.yaml 을 고치세요) ==="
const MARKER_END = "      # === garden.yaml 자동 생성 끝 ==="

export function syncGardenHomeConfigFromGarden(): void {
  if (!fs.existsSync(CONFIG_YAML_PATH)) return

  const { home } = loadGardenDataConfig()
  const generated = [
    MARKER_START,
    `      garden: ${home.garden}`,
    `      radar: ${home.radar}`,
    `      gallery: ${home.gallery}`,
    MARKER_END,
  ].join("\n")

  const original = fs.readFileSync(CONFIG_YAML_PATH, "utf-8")
  const anchorIdx = original.indexOf(ANCHOR)
  if (anchorIdx === -1) return // 플러그인이 아직 quartz.config.yaml 에 등록되지 않음

  let updated: string
  const startIdx = original.indexOf(MARKER_START, anchorIdx)
  const endIdx = original.indexOf(MARKER_END, anchorIdx)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    updated = original.slice(0, startIdx) + generated + original.slice(endIdx + MARKER_END.length)
  } else {
    const optionsIdx = original.indexOf(OPTIONS_ANCHOR, anchorIdx)
    if (optionsIdx === -1) return
    const insertAt = optionsIdx + OPTIONS_ANCHOR.length
    updated = original.slice(0, insertAt) + generated + "\n" + original.slice(insertAt)
  }

  if (updated !== original) {
    fs.writeFileSync(CONFIG_YAML_PATH, updated, "utf-8")
  }
}
