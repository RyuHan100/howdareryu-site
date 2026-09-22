// garden.yaml 을 읽어 기본값과 합친다. garden.yaml 이 없거나 항목이 빠져 있어도
// 여기 기본값으로 동작하므로, 새 폴더가 생겨도 설정을 따로 추가할 필요가 없다.
// (explorer 항목은 syncExplorerFromGarden.ts 가 따로 읽는다.)
import fs from "fs"
import path from "path"
import YAML from "yaml"

export const GARDEN_YAML_PATH = path.join(process.cwd(), "garden.yaml")

/** 식물 판정 조건. 한 규칙의 any 목록 중 하나라도 맞으면 그 식물이 된다. */
export interface PlantCondition {
  question?: boolean
  edits_min?: number
  chars_min?: number
}

export interface PlantRule {
  plant: string
  any: PlantCondition[]
}

export interface RadarSubfolderConfig {
  label?: string
  color?: string
}

export interface GardenDataConfig {
  exclude_folders: string[]
  garden: { folder: string }
  plants: {
    frontmatter_key: string
    kinds: Record<string, string>
    question_endings: string[]
    rules: PlantRule[]
    default: string
    wither_after_days: number
  }
  radar: {
    folder: string
    default: RadarSubfolderConfig
    subfolders: Record<string, RadarSubfolderConfig>
  }
  gallery: {
    folder: string
    artist: string
    meta_file: string
  }
}

export const DEFAULT_GARDEN_CONFIG: GardenDataConfig = {
  exclude_folders: ["img", "data"],
  garden: { folder: "scribbled notes" },
  plants: {
    frontmatter_key: "plant",
    kinds: { grass: "풀", flower: "꽃", vine: "덩굴", tree: "나무" },
    question_endings: ["?", "？", "왜", "어떻게"],
    rules: [
      { plant: "vine", any: [{ question: true }] },
      { plant: "tree", any: [{ edits_min: 30 }, { chars_min: 3000 }] },
      { plant: "flower", any: [{ edits_min: 5 }] },
    ],
    default: "grass",
    wither_after_days: 90,
  },
  radar: {
    folder: "radar",
    default: { color: "var(--secondary)" },
    subfolders: {},
  },
  gallery: {
    folder: "img/inspiration",
    artist: "",
    meta_file: "gallery.yaml",
  },
}

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** 기본값 위에 사용자 값을 얹는다. 객체는 재귀로 합치고, 배열·값은 통째로 바꾼다. */
function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined || over === null ? base : over) as T
  const out: Obj = { ...base }
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out ? merge(out[k], v) : v
  }
  return out as T
}

export function readGardenYaml(): Obj {
  if (!fs.existsSync(GARDEN_YAML_PATH)) return {}
  const parsed = YAML.parse(fs.readFileSync(GARDEN_YAML_PATH, "utf-8"))
  return isObj(parsed) ? parsed : {}
}

export function loadGardenDataConfig(): GardenDataConfig {
  const raw = readGardenYaml()
  const { explorer: _explorer, ...rest } = raw
  return merge(DEFAULT_GARDEN_CONFIG, rest)
}
