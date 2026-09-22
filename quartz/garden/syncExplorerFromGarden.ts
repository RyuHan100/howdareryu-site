// garden.yaml 의 explorer 설정(제목/아이콘)을 quartz.config.yaml 의 explorer 플러그인
// options 에 반영한다. quartz.ts 가 config 를 읽기 전에 호출해서, garden.yaml 을 고치고
// 다시 빌드하기만 하면 탐색기가 갱신되도록 한다.
//
// quartz.config.yaml 안에서 이 함수가 쓰는 구간은 마커(START/END) 사이뿐이다 — 그 바깥의
// sortFn 등 손으로 쓴 옵션은 절대 건드리지 않는다.
//
// 식물 이모지(explorer.plants)는 quartz.ts 가 이 함수보다 먼저 만들어 둔
// .garden-cache/garden-data.json(quartz/garden/collect.ts 의 결과)의 plant/wilted 판정을
// 그대로 읽어서 쓴다 — 판정 규칙을 여기서 다시 만들지 않는다. 그래서 홈의 정원 그림과 오솔길이
// 항상 같은 데이터를 보고, 어긋날 일이 없다.
import fs from "fs"
import path from "path"
import YAML from "yaml"
import { GARDEN_DATA_PATH } from "./collect"

const GARDEN_YAML_PATH = path.join(process.cwd(), "garden.yaml")
const CONFIG_YAML_PATH = path.join(process.cwd(), "quartz.config.yaml")

const EXPLORER_ANCHOR = "  - source: github:quartz-community/explorer"
const OPTIONS_ANCHOR = "\n    options:\n"
const MARKER_START =
  "      # === garden.yaml 자동 생성 시작 (직접 고치지 말고 garden.yaml 을 고치세요) ==="
const MARKER_END = "      # === garden.yaml 자동 생성 끝 ==="

interface GardenExplorerConfig {
  title?: string
  folder_icon?: string
  folders?: Record<string, string>
  items?: Record<string, string>
  /** grass/flower/vine/tree(garden.yaml 의 최상위 plants.kinds 와 같은 키) + wilted. */
  plants?: Record<string, string>
}

interface GardenConfig {
  explorer?: GardenExplorerConfig
}

interface GardenNoteSummary {
  slug: string
  plant: string
  wilted: boolean
}

/** .garden-cache/garden-data.json 이 없거나(아직 빌드 전) 못 읽으면 빈 목록 — 식물 아이콘 없이 진행. */
function readGardenNotes(): GardenNoteSummary[] {
  try {
    const data = JSON.parse(fs.readFileSync(GARDEN_DATA_PATH, "utf-8"))
    const notes = data?.garden?.notes
    if (!Array.isArray(notes)) return []
    return notes.map((n: { slug: string; plant: string; wilted: boolean }) => ({
      slug: n.slug,
      plant: n.plant,
      wilted: n.wilted === true,
    }))
  } catch {
    return []
  }
}

/** 노트 slug → 아이콘. wilted 가 종류보다 우선(시든 덩굴도 🍂). */
function buildPlantIconsBySlug(plantsCfg: Record<string, string> | undefined): Record<string, string> {
  if (!plantsCfg) return {}
  const notes = readGardenNotes()
  const bySlug: Record<string, string> = {}
  for (const n of notes) {
    const icon = n.wilted ? plantsCfg.wilted : plantsCfg[n.plant]
    if (icon) bySlug[n.slug] = icon
  }
  return bySlug
}

function buildMapFnSource(cfg: GardenExplorerConfig): string {
  const folderIcons = JSON.stringify(cfg.folders ?? {})
  const itemIcons = JSON.stringify(cfg.items ?? {})
  const defaultIcon = JSON.stringify(cfg.folder_icon ?? "")
  const plantIcons = JSON.stringify(buildPlantIconsBySlug(cfg.plants))
  return [
    "(node) => {",
    `  const folderIcons = ${folderIcons};`,
    `  const itemIcons = ${itemIcons};`,
    `  const plantIcons = ${plantIcons};`,
    `  const defaultFolderIcon = ${defaultIcon};`,
    "  if (node.isFolder) {",
    // 자기 이름이 매핑에 있으면 그걸 쓰고, 없으면 최상위 조상 폴더 이름으로 다시 찾는다
    // (예: radar 하위 어느 폴더든 깊이와 상관없이 radar 의 아이콘을 물려받는다).
    // 둘 다 없으면 기본 아이콘(설정에 없는 새 폴더도 이걸 쓴다).
    "    const name = node.displayName || node.slugSegment || \"\";",
    "    const top = (node.slugSegments && node.slugSegments[0]) || node.slugSegment;",
    "    const icon = folderIcons[node.slugSegment] || folderIcons[top] || defaultFolderIcon;",
    '    if (icon && !name.includes(icon)) node.displayName = icon + " " + name;',
    "    return;",
    "  }",
    "  const top = (node.slugSegments && node.slugSegments[0]) || \"\";",
    "  const itemIcon = itemIcons[top];",
    "  if (itemIcon) {",
    "    const name = node.displayName || node.slugSegment || \"\";",
    '    if (!name.includes(itemIcon)) node.displayName = itemIcon + " " + name;',
    "  }",
    // 식물 이모지: scribbled notes 등 정원 노트만 매핑에 있고(quartz/garden/collect.ts 의
    // 판정 결과), 그 외 노트는 매핑에 없어서 아무 것도 안 붙는다.
    "  const plantIcon = plantIcons[node.data && node.data.slug];",
    "  if (plantIcon) {",
    "    const name = node.displayName || node.slugSegment || \"\";",
    '    if (!name.includes(plantIcon)) node.displayName = plantIcon + " " + name;',
    "  }",
    "}",
  ].join("\n")
}

function indentBlock(src: string, indent: string): string {
  return src
    .split("\n")
    .map((line) => indent + line)
    .join("\n")
}

function buildGeneratedBlock(cfg: GardenExplorerConfig): string {
  const title = cfg.title ?? "탐색기"
  const mapFnSource = buildMapFnSource(cfg)
  return [
    MARKER_START,
    `      title: ${JSON.stringify(title)}`,
    "      mapFn: |-",
    indentBlock(mapFnSource, "        "),
    MARKER_END,
  ].join("\n")
}

export function syncExplorerConfigFromGarden(): void {
  if (!fs.existsSync(GARDEN_YAML_PATH) || !fs.existsSync(CONFIG_YAML_PATH)) return

  const garden = (YAML.parse(fs.readFileSync(GARDEN_YAML_PATH, "utf-8")) ?? {}) as GardenConfig
  const explorerCfg = garden.explorer
  if (!explorerCfg) return

  const generated = buildGeneratedBlock(explorerCfg)
  const original = fs.readFileSync(CONFIG_YAML_PATH, "utf-8")

  let updated: string
  const startIdx = original.indexOf(MARKER_START)
  const endIdx = original.indexOf(MARKER_END)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    updated =
      original.slice(0, startIdx) + generated + original.slice(endIdx + MARKER_END.length)
  } else {
    const anchorIdx = original.indexOf(EXPLORER_ANCHOR)
    if (anchorIdx === -1) return
    const optionsIdx = original.indexOf(OPTIONS_ANCHOR, anchorIdx)
    if (optionsIdx === -1) return
    const insertAt = optionsIdx + OPTIONS_ANCHOR.length
    updated = original.slice(0, insertAt) + generated + "\n" + original.slice(insertAt)
  }

  if (updated !== original) {
    fs.writeFileSync(CONFIG_YAML_PATH, updated, "utf-8")
  }
}
