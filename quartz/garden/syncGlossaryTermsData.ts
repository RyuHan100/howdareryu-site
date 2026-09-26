// plugins/climate-glossary/data/climate-glossary.json 을 읽어 quartz/static/glossary-terms-data.js
// 를 만든다. quartz/static/glossary-tooltip.js(손으로 쓴, 커밋된 파일)가 이 데이터를 읽어
// 노트 본문의 .glossary-ref(plugins/glossary-linker 가 붙임) 위에 호버 툴팁을 그린다.
//
// garden-properties-data.js 와 같은 이유로 이 생성 파일도 **커밋해야 한다** — quartz/static 은
// Static 이모터가 .gitignore 를 존중해 public/static 으로 복사하므로, gitignore 된 파일은
// 브라우저로 안 나간다.
import fs from "fs"
import path from "path"

const GLOSSARY_DATA_PATH = path.join(process.cwd(), "plugins", "climate-glossary", "data", "climate-glossary.json")
const OUTPUT_PATH = path.join(process.cwd(), "quartz", "static", "glossary-terms-data.js")

interface GlossaryTerm {
  id: string
  term: string
  definition?: string
  category?: string
}

interface GlossaryData {
  categories?: { key: string; label: string }[]
  terms?: GlossaryTerm[]
}

export function syncGlossaryTermsData(): void {
  let data: GlossaryData
  try {
    data = JSON.parse(fs.readFileSync(GLOSSARY_DATA_PATH, "utf-8"))
  } catch {
    data = {}
  }

  const labelByKey = new Map((data.categories ?? []).map((c) => [c.key, c.label]))
  const terms: Record<string, { term: string; definition: string; category: string }> = {}
  for (const t of data.terms ?? []) {
    if (!t?.id) continue
    terms[t.id] = {
      term: t.term ?? t.id,
      definition: t.definition ?? "",
      category: labelByKey.get(t.category ?? "") ?? t.category ?? "",
    }
  }

  const out = `// 자동 생성 파일 — plugins/climate-glossary/data/climate-glossary.json 을 고치고 다시\n// 빌드하면 갱신됨. 직접 고치지 마세요. quartz/garden/syncGlossaryTermsData.ts 가 만든다.\n// public/static 으로 그대로 배포되므로(Static 이모터가 gitignore 된 파일은 뺀다) 커밋해야 한다.\nwindow.__GLOSSARY_TERMS__ = ${JSON.stringify(terms, null, 2)}\n`

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, out, "utf-8")
}
