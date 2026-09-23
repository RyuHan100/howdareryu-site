// garden.yaml 의 properties 설정(노트 상단 Properties 표 표시 이름, 정원 콘셉트)을
// quartz/static/garden-properties-data.js 로 만든다. 이 파일은 빌드마다 다시 만들어지지만
// **커밋해야 한다** — quartz/static 은 Static 이모터(quartz/plugins/emitters/static.ts)가
// public/static 으로 그대로 복사하는데, 그 글롭이 .gitignore 를 존중해서(`gitignore: true`)
// gitignore 된 파일은 조용히 빠진다(.garden-cache/garden-data.json 과 달리 이건 Node 가 직접
// 읽는 게 아니라 배포된 정적 파일로 브라우저에 나가야 하므로 안 된다). quartz.config.yaml 의
// explorer 마커 블록처럼: garden.yaml 을 고치면 다시 빌드해서 diff 를 같이 커밋한다.
// 실제로 표를 갈아 끼우는 동작은 손으로 쓴 quartz/static/garden-properties.js(같이 커밋된
// 파일)가 한다 — 이 함수는 그 스크립트가 읽을 설정/데이터만 만든다.
//
// note-properties 플러그인은 키 이름을 바꾸는 옵션이 없고(§7), 표는 frontmatter 키를 그대로
// 찍는다. frontmatter 자체는 절대 안 건드리므로, 표시만 클라이언트에서 바꾼다.
//
// scribbled notes 전용 칸(식물/뿌리/씨앗)은 .garden-cache/garden-data.json 의
// garden.notes[](quartz/garden/collect.ts 의 결과, 오솔길 식물 이모지·정원 그림과 같은 데이터)를
// 그대로 읽어서 만든다 — 판정을 여기서 다시 하지 않는다.
import fs from "fs"
import path from "path"
import YAML from "yaml"
import { GARDEN_DATA_PATH } from "./collect"

const GARDEN_YAML_PATH = path.join(process.cwd(), "garden.yaml")
const OUTPUT_PATH = path.join(process.cwd(), "quartz", "static", "garden-properties-data.js")

// 표시가 canonical created/modified 로 이미 반영되는(note-properties 플러그인이 자체적으로
// created/modified/published 로 값을 복사해 넣는) 원본 별칭 키들. 그대로 두면 같은 날짜가
// 영어 키로 중복 표시되므로 항상 감춘다 — frontmatter 는 안 건드리고 표에서만 뺀다.
const DROP_KEYS = ["date", "published", "lastmod", "updated", "last-modified"]

interface GardenPropertiesConfig {
  table_title?: string
  labels?: Record<string, string>
  radar_overrides?: Record<string, string>
  scribbled_extra?: { plant?: string; roots?: string; seeds?: string }
  scribbled_drop?: string[]
}

interface GardenExplorerConfig {
  plants?: Record<string, string>
}

interface GardenConfig {
  properties?: GardenPropertiesConfig
  explorer?: GardenExplorerConfig
  garden?: { folder?: string }
  radar?: { folder?: string }
}

interface GardenNote {
  slug: string
  plant: string
  label: string
  wilted: boolean
  backlinks: number
  missingLinks: string[]
}

function readGardenNotes(): GardenNote[] {
  try {
    const data = JSON.parse(fs.readFileSync(GARDEN_DATA_PATH, "utf-8"))
    const notes = data?.garden?.notes
    if (!Array.isArray(notes)) return []
    return notes
  } catch {
    return []
  }
}

function buildScribbledExtras(
  extraLabels: { plant: string; roots: string; seeds: string },
  plantIcons: Record<string, string>,
): Record<string, Record<string, string>> {
  const notes = readGardenNotes()
  const result: Record<string, Record<string, string>> = {}
  for (const n of notes) {
    const icon = n.wilted ? plantIcons.wilted : plantIcons[n.plant]
    const kindLabel = n.wilted ? `시든 ${n.label}` : n.label
    result[n.slug] = {
      [extraLabels.plant]: [icon, kindLabel].filter(Boolean).join(" "),
      [extraLabels.roots]: String(n.backlinks ?? 0),
      [extraLabels.seeds]: String((n.missingLinks ?? []).length),
    }
  }
  return result
}

export function syncPropertiesConfigFromGarden(): void {
  if (!fs.existsSync(GARDEN_YAML_PATH)) return

  const garden = (YAML.parse(fs.readFileSync(GARDEN_YAML_PATH, "utf-8")) ?? {}) as GardenConfig
  const propsCfg = garden.properties ?? {}
  const extraLabels = {
    plant: propsCfg.scribbled_extra?.plant ?? "식물",
    roots: propsCfg.scribbled_extra?.roots ?? "뿌리",
    seeds: propsCfg.scribbled_extra?.seeds ?? "씨앗",
  }

  const payload = {
    tableTitle: propsCfg.table_title ?? "Properties",
    labels: propsCfg.labels ?? {},
    radarFolder: garden.radar?.folder ?? "radar",
    radarLabelOverrides: propsCfg.radar_overrides ?? {},
    dropKeys: DROP_KEYS,
    scribbledDropKeys: propsCfg.scribbled_drop ?? ["aliases", "publish"],
    notes: buildScribbledExtras(extraLabels, garden.explorer?.plants ?? {}),
  }

  const out = `// 자동 생성 파일 — garden.yaml 을 고치고 다시 빌드하면 갱신됨. 직접 고치지 마세요.\n// quartz/garden/syncPropertiesFromGarden.ts 가 만든다. public/static 으로 그대로 배포되므로\n// (Static 이모터가 .gitignore 를 존중해 gitignore 된 파일은 뺀다) 이 파일은 커밋해야 한다.\nwindow.__GARDEN_PROPERTIES__ = ${JSON.stringify(payload, null, 2)}\n`

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, out, "utf-8")
}
