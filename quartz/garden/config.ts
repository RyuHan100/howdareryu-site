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
  /**
   * "note"(기본) = 노트 하나가 점 하나. "revision" = 그 폴더의 노트가 가리키는
   * data/changelog.json 의 변경 이력 하나하나가 점 하나(§8.2, PACM에 처음 적용).
   * 나중에 다른 구역도 이 값만 바꾸면 이력 단위로 전환된다.
   */
  granularity?: "note" | "revision"
}

export interface HomeToggles {
  garden: boolean
  radar: boolean
  gallery: boolean
}

export interface GardenDataConfig {
  exclude_folders: string[]
  /** 홈 화면의 정원/radar/아빠의 화단 구역을 켜고 끈다. "정원사에게 연락하기"는 항상 나온다. */
  home: HomeToggles
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
    /** 홈 "아빠의 화단" 슬라이드쇼 제목 아래 한 줄 소개. */
    intro: string
    /** 홈 슬라이드쇼에 보여줄 최근 그림 수. */
    home_count: number
    /** 홈 슬라이드쇼 자동 전환 간격(초). */
    interval_seconds: number
  }
}

export const DEFAULT_GARDEN_CONFIG: GardenDataConfig = {
  exclude_folders: ["img", "data"],
  home: { garden: false, radar: false, gallery: false },
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
    intro: "",
    home_count: 10,
    interval_seconds: 4,
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
