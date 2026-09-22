// content/ 아래 파일마다 git 기록(처음 추가된 날, 마지막으로 바뀐 날, 커밋 수)을 모은다.
// `git log` 한 번으로 전체를 읽고, 이름이 바뀐 파일(R)은 옛 이름의 기록까지 이어 붙인다.
// (예: scribbled/ → scribbled notes/ 로 폴더 이름을 바꾼 노트도 처음 만든 날이 유지된다.)
//
// 배포 워크플로의 checkout 에 fetch-depth: 0 이 있어야 CI 에서도 전체 기록이 보인다.
import { execFileSync } from "child_process"
import path from "path"

export interface FileHistory {
  /** 처음 추가된 커밋의 작성 시각(ISO) */
  created: string
  /** 마지막으로 바뀐 커밋의 작성 시각(ISO) */
  modified: string
  /** 이 파일을 건드린 커밋 수(추가 커밋 포함) */
  commits: number
}

export interface GitHistory {
  available: boolean
  shallow: boolean
  /** 키: 저장소 루트 기준 현재 경로(예: "content/scribbled notes/x.md") */
  files: Map<string, FileHistory>
  /** 저장소 루트에서 cwd 까지의 상대 경로("" 이면 같은 곳) */
  prefix: string
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd,
    encoding: "utf-8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  })
}

const RECORD = "\x1e"
const FIELD = "\x1f"

export function loadGitHistory(cwd: string, pathspec: string): GitHistory {
  const empty: GitHistory = { available: false, shallow: false, files: new Map(), prefix: "" }
  let toplevel: string
  try {
    toplevel = git(cwd, ["rev-parse", "--show-toplevel"]).trim()
  } catch {
    return empty
  }

  let shallow = false
  try {
    shallow = git(cwd, ["rev-parse", "--is-shallow-repository"]).trim() === "true"
  } catch {
    // 오래된 git 은 이 옵션이 없다 — 얕은 클론이 아니라고 본다
  }

  let log: string
  try {
    log = git(cwd, [
      "log",
      "-M",
      "--name-status",
      `--format=${RECORD}%H${FIELD}%aI`,
      "--",
      pathspec,
    ])
  } catch {
    return { ...empty, available: true, shallow }
  }

  const files = new Map<string, FileHistory>()
  // 옛 이름 → 현재 이름. 최신 커밋부터 거꾸로 읽으면서 이름 변경을 따라간다.
  const alias = new Map<string, string>()
  // 이미 "추가(A)"까지 거슬러 올라간 이름. 그보다 오래된 같은 이름의 기록은 다른(지워진) 파일이다.
  const retired = new Set<string>()
  let orphan = 0

  const keyOf = (p: string): string => {
    if (retired.has(p)) return `\0orphan:${orphan++}`
    return alias.get(p) ?? p
  }
  const touch = (key: string, date: string) => {
    const h = files.get(key)
    if (!h) files.set(key, { created: date, modified: date, commits: 1 })
    else {
      h.created = date // 거꾸로 읽으므로 뒤에 나올수록 더 오래된 날짜
      h.commits++
    }
  }

  for (const record of log.split(RECORD)) {
    if (!record.trim()) continue
    const lines = record.split("\n")
    const [, date] = lines[0].split(FIELD)
    if (!date) continue
    for (const line of lines.slice(1)) {
      if (!line) continue
      const parts = line.split("\t")
      const status = parts[0]
      if (status.startsWith("R")) {
        const [, oldP, newP] = parts
        const key = keyOf(newP)
        touch(key, date)
        retired.add(newP)
        // 옛 이름의 더 오래된 기록은 이 파일의 것이다(나중에 같은 이름으로 새 파일이 생겼더라도).
        retired.delete(oldP)
        alias.set(oldP, key)
      } else if (status.startsWith("C")) {
        const [, , newP] = parts
        touch(keyOf(newP), date)
        retired.add(newP)
      } else if (status === "A") {
        touch(keyOf(parts[1]), date)
        retired.add(parts[1])
      } else if (status === "D") {
        // 지워진 파일. 이 이름의 더 오래된 기록은 지금 있는 파일과 무관하다.
        retired.add(parts[1])
      } else {
        touch(keyOf(parts[1]), date)
      }
    }
  }

  const prefix = path.relative(toplevel, cwd).split(path.sep).join("/")
  return { available: true, shallow, files, prefix }
}

/** cwd 기준 상대 경로(예: "content/x.md")로 기록을 찾는다. */
export function historyOf(h: GitHistory, relFromCwd: string): FileHistory | undefined {
  const key = h.prefix ? `${h.prefix}/${relFromCwd}` : relFromCwd
  return h.files.get(key)
}
