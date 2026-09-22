// 홈 컴포넌트(정원·radar·아빠의 화단)가 쓸 데이터를 빌드할 때 모아서
// .garden-cache/garden-data.json 에 쓴다. 사이트 출력(public/)에는 아무것도 더하지 않는다.
//
// - 정원: garden.folder(기본 "scribbled notes") 의 노트마다 제목·경로·글자 수, git 기준
//   생성일·마지막 수정일·수정 횟수, 질문형 제목 여부, 나가는 [[링크]]·없는 노트 링크·백링크 수,
//   frontmatter 의 plant 값. 그리고 garden.yaml 의 규칙으로 판정한 식물과 시듦 여부.
// - radar: radar.folder 의 노트마다 하위 폴더, 제목, 경로, 날짜.
// - 갤러리: gallery.folder 의 이미지마다 경로, git 기준 추가일, gallery.yaml 의 제목·연도·재료.
//
// 설정은 garden.yaml(없으면 config.ts 의 기본값). 새 폴더가 생겨도 기본값으로 동작한다.
import fs from "fs"
import path from "path"
import YAML from "yaml"
import { slugifyFilePath, type FilePath } from "../util/path"
import { loadGardenDataConfig, type GardenDataConfig, type PlantCondition } from "./config"
import { loadGitHistory, historyOf, type GitHistory } from "./gitHistory"

export const GARDEN_DATA_PATH = path.join(process.cwd(), ".garden-cache", "garden-data.json")
const CONTENT = "content"
const CONTENT_DIR = path.join(process.cwd(), CONTENT)
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"])
const DAY = 24 * 60 * 60 * 1000

type Frontmatter = Record<string, unknown>

interface SourceNote {
  /** content/ 기준 경로(예: "scribbled notes/토끼풀.md") */
  rel: string
  slug: string
  fm: Frontmatter
  body: string
  title: string
}

// ---------- 파일 목록 ----------

/** quartz.config.yaml 의 ignorePatterns. 폴더/파일 이름 단위로만 맞춘다(private, templates …). */
function readIgnoreNames(): Set<string> {
  try {
    const cfg = YAML.parse(fs.readFileSync(path.join(process.cwd(), "quartz.config.yaml"), "utf-8"))
    const pats: unknown = cfg?.configuration?.ignorePatterns
    if (!Array.isArray(pats)) return new Set()
    return new Set(
      pats
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.replace(/^\*\*\//, "").replace(/\/\*\*$/, "").replace(/\/$/, ""))
        .filter((p) => p && !/[*?[\]]/.test(p)),
    )
  } catch {
    return new Set()
  }
}

function walk(root: string, ignore: Set<string>, rel = ""): string[] {
  const dir = rel ? path.join(root, rel) : root
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || ignore.has(e.name)) continue
    const child = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(root, ignore, child))
    else if (e.isFile()) out.push(child)
  }
  return out
}

const dirSegments = (rel: string) => rel.split("/").slice(0, -1)
const isExcluded = (rel: string, cfg: GardenDataConfig) =>
  dirSegments(rel).some((s) => cfg.exclude_folders.includes(s))
const under = (rel: string, folder: string) => rel.startsWith(folder.replace(/\/+$/, "") + "/")
const stem = (rel: string) => path.posix.basename(rel, path.posix.extname(rel))

// ---------- 노트 읽기 ----------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

function readNote(rel: string): SourceNote {
  const text = fs.readFileSync(path.join(CONTENT_DIR, rel), "utf-8")
  let fm: Frontmatter = {}
  let body = text
  const m = text.match(FRONTMATTER)
  if (m) {
    try {
      const parsed = YAML.parse(m[1])
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fm = parsed
    } catch {
      // 깨진 frontmatter 는 비어 있는 것으로 본다(Quartz 도 본문은 그대로 보여 준다)
    }
    body = text.slice(m[0].length)
  }
  const fmTitle = typeof fm.title === "string" ? fm.title.trim() : ""
  const isIndex = stem(rel) === "index"
  const title =
    fmTitle || (isIndex ? path.posix.basename(path.posix.dirname(rel)) || "index" : stem(rel))
  return { rel, slug: slugifyFilePath(rel as FilePath), fm, body, title }
}

const isDraft = (fm: Frontmatter) => fm.draft === true || fm.draft === "true"

// ---------- 본문 분석 ----------

function stripCode(body: string): string {
  return body
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
    .replace(/`[^`\n]*`/g, "")
}

/** 글자 수: frontmatter·주석·마크다운 기호를 빼고 줄바꿈을 뺀 글자(공백 포함/제외). */
export function countChars(body: string): { chars: number; charsNoSpaces: number } {
  const text = body
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s{0,3}(#{1,6}|>+|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~`=]+/g, "")
    .replace(/\r?\n/g, "")
  const chars = Array.from(text).length
  const charsNoSpaces = Array.from(text.replace(/\s+/g, "")).length
  return { chars, charsNoSpaces }
}

/** [[링크]] 대상 목록. 이미지 같은 첨부 파일 임베드와 같은 노트 안 제목 링크([[#…]])는 뺀다. */
export function wikilinkTargets(body: string): string[] {
  const out: string[] = []
  for (const m of stripCode(body).matchAll(/(!?)\[\[([^[\]\n]+?)\]\]/g)) {
    const target = m[2].split(/\\?\|/)[0].split("#")[0].trim()
    if (!target) continue
    const ext = path.posix.extname(target).toLowerCase()
    const hasFileExt = /^\.[a-z0-9]{1,5}$/.test(ext)
    if (hasFileExt && ext !== ".md") continue // 첨부 파일
    out.push(target)
  }
  return [...new Set(out)]
}

export function isQuestionTitle(title: string, endings: string[]): boolean {
  const t = title.trim().replace(/[\s.!…~"'”’)\]]+$/u, "")
  return endings.some((e) => e && t.endsWith(e))
}

// ---------- 링크 해석 (Quartz 의 markdownLinkResolution: shortest 와 비슷하게) ----------

export class LinkIndex {
  private byPath = new Map<string, string>()
  private byBase = new Map<string, string[]>()
  private folders = new Set<string>()

  constructor(noteRels: string[], allRels: string[]) {
    for (const rel of noteRels) {
      const noExt = rel.replace(/\.md$/i, "").toLowerCase()
      this.byPath.set(noExt, rel)
      const base = path.posix.basename(noExt)
      this.byBase.set(base, [...(this.byBase.get(base) ?? []), rel])
    }
    for (const rel of allRels) {
      const segs = dirSegments(rel)
      for (let i = 1; i <= segs.length; i++) this.folders.add(segs.slice(0, i).join("/").toLowerCase())
    }
  }

  /** 대상 노트의 content/ 기준 경로. 폴더면 "폴더/" 로 끝나는 문자열. 없으면 null. */
  resolve(target: string, fromRel: string): string | null {
    let t = target.replace(/\.md$/i, "").replace(/^\/+/, "")
    if (t.startsWith("./") || t.startsWith("../")) {
      t = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), t))
    }
    const lower = t.toLowerCase()
    const exact = this.byPath.get(lower) ?? this.byPath.get(`${lower}/index`)
    if (exact) return exact
    if (lower.includes("/")) {
      for (const [p, rel] of this.byPath) {
        if (p.endsWith(`/${lower}`) || p.endsWith(`/${lower}/index`)) return rel
      }
    } else {
      const hits = this.byBase.get(lower)
      if (hits?.length) {
        const here = path.posix.dirname(fromRel)
        return hits.find((h) => path.posix.dirname(h) === here) ?? [...hits].sort((a, b) => a.length - b.length)[0]
      }
    }
    for (const f of this.folders) {
      if (f === lower || f.endsWith(`/${lower}`)) return `${f}/`
    }
    return null
  }
}

// ---------- 날짜 ----------

function fmDate(fm: Frontmatter, keys: string[]): string | null {
  for (const k of keys) {
    const v = fm[k]
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString()
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim()
  }
  return null
}

function fileTimes(rel: string): { created: string; modified: string } {
  const st = fs.statSync(path.join(CONTENT_DIR, rel))
  const born = st.birthtimeMs > 0 ? st.birthtime : st.mtime
  return { created: born.toISOString(), modified: st.mtime.toISOString() }
}

type DateSource = "frontmatter" | "git" | "file"

/**
 * frontmatter 에 날짜가 있으면 그걸 우선 쓰고, 없으면 git 기록, 그것도 없으면(아직
 * 커밋 안 한 새 노트 등) 파일 시각으로 대신한다. created/modified 는 각자 따로 판단한다
 * (예: created 만 frontmatter 에 있고 modified 는 없으면 modified 는 git 을 쓴다).
 * commits(=수정 횟수 계산용)는 frontmatter 로 셀 수 없는 값이라 항상 git 기준이다(없으면 0).
 */
function datesOf(rel: string, fm: Frontmatter, git: GitHistory) {
  const h = historyOf(git, `${CONTENT}/${rel}`)
  const ft = fileTimes(rel)
  const fmCreated = fmDate(fm, ["created", "date"])
  const fmModified = fmDate(fm, ["modified", "dateModified", "updated", "lastmod"])
  return {
    created: fmCreated ?? h?.created ?? ft.created,
    createdFrom: (fmCreated ? "frontmatter" : h ? "git" : "file") as DateSource,
    modified: fmModified ?? h?.modified ?? ft.modified,
    modifiedFrom: (fmModified ? "frontmatter" : h ? "git" : "file") as DateSource,
    commits: h?.commits ?? 0,
  }
}

// ---------- radar 이력(revision) 단위 — 지금은 PACM 전용, garden.yaml 의
// radar.subfolders.<name>.granularity: revision 로 켠다 (§8.2) ----------

type RadarDateSource = DateSource | "filename" | "changelog"

/** tools/pacm_monitor/pacm_monitor.py 가 쓰는 changelog.json 한 줄. */
interface ChangelogEntry {
  date: string
  event: "added" | "removed" | "modified"
  key: string
  record?: { type?: string; ref?: string; title?: string; [k: string]: unknown }
  changes?: Record<string, { before: unknown; after: unknown }>
}

const EVENT_LABEL: Record<ChangelogEntry["event"], string> = {
  added: "신규",
  removed: "삭제",
  modified: "수정",
}

function shortValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-"
  if (v === undefined || v === null || v === "") return "-"
  return String(v)
}

function recordLabel(r?: ChangelogEntry["record"]): string {
  if (!r) return ""
  const tag = r.type && r.ref ? `[${r.type} ${r.ref}] ` : ""
  return `${tag}${r.title ?? ""}`.trim()
}

/** 이력 하나(added/removed/modified)를 한 줄 요약으로. */
function summarizeEvent(e: ChangelogEntry): string {
  const label = recordLabel(e.record)
  if (e.event === "added") return `🆕 신규 등록 — ${label}`
  if (e.event === "removed") return `❌ 목록에서 삭제 — ${label}`
  const fields = Object.entries(e.changes ?? {}).map(([field, c]) => {
    if (Array.isArray(c.before) || Array.isArray(c.after)) return `${field} 변경`
    return `${field} ${shortValue(c.before)}→${shortValue(c.after)}`
  })
  return `🔄 정보 변경 — ${label}${fields.length ? ` (${fields.join(", ")})` : ""}`
}

/** 같은 노트·같은 날짜의 이력 여러 개를 한 점으로 합칠 때 쓰는 요약(너무 빼곡해지지 않게). */
function summarizeGroup(events: ChangelogEntry[]): { title: string; summary: string } {
  if (events.length === 1) {
    return { title: recordLabel(events[0].record) || "PACM 변경", summary: summarizeEvent(events[0]) }
  }
  const counts = { added: 0, removed: 0, modified: 0 }
  for (const e of events) counts[e.event]++
  const parts = (["added", "removed", "modified"] as const)
    .filter((k) => counts[k] > 0)
    .map((k) => `${EVENT_LABEL[k]} ${counts[k]}`)
  return {
    title: `이 날 변경 ${events.length}건`,
    summary: `이 날 변경 ${events.length}건 (${parts.join(" · ")}) — ${events.map(summarizeEvent).join(" / ")}`,
  }
}

function readChangelog(noteRel: string): ChangelogEntry[] | null {
  const changelogPath = path.join(CONTENT_DIR, path.posix.dirname(noteRel), "data", "changelog.json")
  if (!fs.existsSync(changelogPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(changelogPath, "utf-8"))
    return Array.isArray(parsed) ? parsed : null
  } catch (e) {
    console.warn(`[garden] ${path.relative(process.cwd(), changelogPath)} 을 읽지 못했다: ${e}`)
    return null
  }
}

/**
 * 노트 옆 data/changelog.json 을 읽어 이력 하나당 레코드 하나로 만든다. 같은 날짜의 이력은
 * 한 점으로 합친다(요청: "하루에 여러 번이면 하나로"). 반환하는 배열의 모양은 일반 radar.notes[]
 * 항목과 같고(subfolder/title/path/slug/date/dateFrom/isIndex), `revision` 필드만 추가로 붙는다
 * — 5단계의 radar 컴포넌트는 이 구분 없이 같은 배열로 쓸 수 있다. changelog.json 이 없으면(아직
 * 한 번도 변경이 없었던 폴더 등) null 을 돌려줘서 호출부가 노트 단위 기본 동작으로 대신하게 한다.
 */
function revisionRecordsFor(note: SourceNote, subfolder: string) {
  const changelog = readChangelog(note.rel)
  if (!changelog || changelog.length === 0) return null

  const byDate = new Map<string, ChangelogEntry[]>()
  for (const e of changelog) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }

  const isIndex = stem(note.rel) === "index"
  return [...byDate.entries()].map(([date, events]) => {
    const { title, summary } = summarizeGroup(events)
    return {
      subfolder,
      title,
      path: note.rel,
      slug: note.slug,
      date,
      dateFrom: "changelog" as RadarDateSource,
      isIndex,
      revision: {
        count: events.length,
        events: events.map((e) => ({ event: e.event, key: e.key, summary: summarizeEvent(e) })),
        summary,
      },
    }
  })
}

// ---------- 식물 ----------

function decidePlant(
  cfg: GardenDataConfig["plants"],
  fm: Frontmatter,
  facts: { question: boolean; edits: number; chars: number },
) {
  const kinds = cfg.kinds
  const labelOf = (id: string) => kinds[id] ?? id
  const raw = fm[cfg.frontmatter_key]
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const v = String(raw).trim()
    const id = v in kinds ? v : (Object.entries(kinds).find(([, l]) => l === v)?.[0] ?? v)
    return { plant: id, label: labelOf(id), plantFrom: "frontmatter" as const }
  }
  const holds = (c: PlantCondition) => {
    const checks: boolean[] = []
    if (c.question !== undefined) checks.push(facts.question === c.question)
    if (c.edits_min !== undefined) checks.push(facts.edits >= c.edits_min)
    if (c.chars_min !== undefined) checks.push(facts.chars >= c.chars_min)
    return checks.length > 0 && checks.every(Boolean)
  }
  for (const rule of cfg.rules ?? []) {
    if ((rule.any ?? []).some(holds)) {
      return { plant: rule.plant, label: labelOf(rule.plant), plantFrom: "rule" as const }
    }
  }
  return { plant: cfg.default, label: labelOf(cfg.default), plantFrom: "default" as const }
}

// ---------- 수집 ----------

export interface GardenDataSummary {
  path: string
  garden: number
  plants: Record<string, number>
  wilted: number
  radar: number
  gallery: number
  git: "full" | "shallow" | "none"
}

export function collectGardenData(now = new Date()): GardenDataSummary {
  const cfg = loadGardenDataConfig()
  const ignore = readIgnoreNames()
  const allRels = walk(CONTENT_DIR, ignore)
  const noteRels = allRels.filter((r) => r.toLowerCase().endsWith(".md"))
  const git = loadGitHistory(process.cwd(), CONTENT)

  const notes = new Map<string, SourceNote>()
  for (const rel of noteRels) {
    const n = readNote(rel)
    if (!isDraft(n.fm)) notes.set(rel, n)
  }

  // 링크 그래프(백링크를 세려고 모든 노트를 본다)
  const index = new LinkIndex([...notes.keys()], allRels)
  const outgoing = new Map<string, { target: string; to: string | null }[]>()
  const backlinks = new Map<string, Set<string>>()
  for (const n of notes.values()) {
    const links = wikilinkTargets(n.body).map((target) => ({ target, to: index.resolve(target, n.rel) }))
    outgoing.set(n.rel, links)
    for (const { to } of links) {
      if (!to || to === n.rel || to.endsWith("/")) continue
      if (!backlinks.has(to)) backlinks.set(to, new Set())
      backlinks.get(to)!.add(n.rel)
    }
  }
  const slugOfTarget = (to: string) =>
    to.endsWith("/") ? slugifyFilePath(`${to}index.md` as FilePath) : notes.get(to)!.slug

  // 정원
  const gardenNotes = [...notes.values()]
    .filter((n) => under(n.rel, cfg.garden.folder) && stem(n.rel) !== "index" && !isExcluded(n.rel, cfg))
    .map((n) => {
      const { chars, charsNoSpaces } = countChars(n.body)
      const d = datesOf(n.rel, n.fm, git)
      const edits = Math.max(0, d.commits - 1)
      const question = isQuestionTitle(n.title, cfg.plants.question_endings)
      const links = outgoing.get(n.rel) ?? []
      const from = [...(backlinks.get(n.rel) ?? [])]
      const daysSinceModified = Math.floor((now.getTime() - new Date(d.modified).getTime()) / DAY)
      const fmPlant = n.fm[cfg.plants.frontmatter_key]
      return {
        title: n.title,
        path: n.rel,
        slug: n.slug,
        chars,
        charsNoSpaces,
        created: d.created,
        createdFrom: d.createdFrom,
        modified: d.modified,
        modifiedFrom: d.modifiedFrom,
        commits: d.commits,
        edits,
        isQuestion: question,
        links: links.filter((l) => l.to).map((l) => ({ target: l.target, slug: slugOfTarget(l.to!) })),
        missingLinks: links.filter((l) => !l.to).map((l) => l.target),
        backlinks: from.length,
        backlinkFrom: from.map((r) => notes.get(r)!.slug),
        frontmatterPlant: fmPlant === undefined || fmPlant === null ? null : String(fmPlant),
        ...decidePlant(cfg.plants, n.fm, { question, edits, chars }),
        daysSinceModified,
        wilted: daysSinceModified >= cfg.plants.wither_after_days,
      }
    })
    .sort((a, b) => a.created.localeCompare(b.created))

  // radar
  const radarRoot = cfg.radar.folder.replace(/\/+$/, "")
  const radarNotes = [...notes.values()]
    .filter((n) => under(n.rel, radarRoot) && !isExcluded(n.rel, cfg))
    .flatMap((n) => {
      const segs = n.rel.split("/")
      const subfolder = segs.length > 2 ? segs[1] : ""
      const granularity = cfg.radar.subfolders[subfolder]?.granularity ?? "note"
      if (granularity === "revision") {
        const revisions = revisionRecordsFor(n, subfolder)
        if (revisions) return revisions // changelog.json 이 있으면 이력 단위로 — 없으면 노트 그대로(아래)
      }
      const fromFm = fmDate(n.fm, ["date"])
      const fromName = path.posix.basename(n.rel).match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
      let date: string
      let dateFrom: RadarDateSource
      if (fromFm) [date, dateFrom] = [fromFm, "frontmatter"]
      else if (fromName) [date, dateFrom] = [fromName, "filename"]
      else {
        const d = datesOf(n.rel, n.fm, git)
        ;[date, dateFrom] = [d.modified, d.modifiedFrom === "frontmatter" ? "frontmatter" : d.modifiedFrom]
      }
      return [{ subfolder, title: n.title, path: n.rel, slug: n.slug, date, dateFrom, isIndex: stem(n.rel) === "index" }]
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const subNames = [...new Set([...Object.keys(cfg.radar.subfolders), ...radarNotes.map((r) => r.subfolder)])]
  const radarSubfolders = subNames.map((name) => {
    const own = cfg.radar.subfolders[name] ?? {}
    const mine = radarNotes.filter((r) => r.subfolder === name)
    return {
      name,
      label: own.label ?? (name || radarRoot),
      color: own.color ?? cfg.radar.default.color ?? "var(--secondary)",
      count: mine.length,
      latest: mine[0]?.date ?? null,
    }
  })

  // 갤러리
  const galleryDir = cfg.gallery.folder.replace(/\/+$/, "")
  let meta: Record<string, Record<string, unknown>> = {}
  const metaPath = path.join(CONTENT_DIR, galleryDir, cfg.gallery.meta_file)
  if (cfg.gallery.meta_file && fs.existsSync(metaPath)) {
    try {
      const parsed = YAML.parse(fs.readFileSync(metaPath, "utf-8"))
      if (parsed && typeof parsed === "object") meta = parsed
    } catch (e) {
      console.warn(`[garden] ${cfg.gallery.meta_file} 을 읽지 못했다: ${e}`)
    }
  }
  const images = allRels
    .filter((r) => under(r, galleryDir) && IMAGE_EXT.has(path.posix.extname(r).toLowerCase()))
    .sort()
    .map((rel) => {
      const name = path.posix.basename(rel)
      const m = meta[name] ?? meta[stem(rel)] ?? {}
      const h = historyOf(git, `${CONTENT}/${rel}`)
      const drawn = stem(rel).match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
      return {
        file: rel,
        src: "/" + slugifyFilePath(rel as FilePath),
        added: h?.created ?? fileTimes(rel).created,
        addedFrom: h ? ("git" as const) : ("file" as const),
        takenAt: drawn ? `${drawn[1]}-${drawn[2]}-${drawn[3]}T${drawn[4]}:${drawn[5]}:${drawn[6]}` : null,
        title: m.title ?? null,
        year: m.year ?? null,
        material: m.material ?? null,
      }
    })

  const data = {
    generatedAt: now.toISOString(),
    git: { available: git.available, shallow: git.shallow },
    config: {
      plants: {
        kinds: cfg.plants.kinds,
        default: cfg.plants.default,
        wither_after_days: cfg.plants.wither_after_days,
      },
      gallery: { artist: cfg.gallery.artist },
    },
    garden: { folder: cfg.garden.folder, notes: gardenNotes },
    radar: { folder: radarRoot, subfolders: radarSubfolders, notes: radarNotes },
    gallery: { folder: galleryDir, artist: cfg.gallery.artist, images },
  }

  fs.mkdirSync(path.dirname(GARDEN_DATA_PATH), { recursive: true })
  fs.writeFileSync(GARDEN_DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8")

  const plants: Record<string, number> = {}
  for (const n of gardenNotes) plants[n.plant] = (plants[n.plant] ?? 0) + 1
  return {
    path: path.relative(process.cwd(), GARDEN_DATA_PATH),
    garden: gardenNotes.length,
    plants,
    wilted: gardenNotes.filter((n) => n.wilted).length,
    radar: radarNotes.length,
    gallery: images.length,
    git: !git.available ? "none" : git.shallow ? "shallow" : "full",
  }
}
