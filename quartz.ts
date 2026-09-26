import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { registerCondition } from "./quartz/plugins/loader/conditions"
import { syncExplorerConfigFromGarden } from "./quartz/garden/syncExplorerFromGarden"
import { syncGardenHomeConfigFromGarden } from "./quartz/garden/syncGardenHomeFromGarden"
import { syncPropertiesConfigFromGarden } from "./quartz/garden/syncPropertiesFromGarden"
import { syncGlossaryTermsData } from "./quartz/garden/syncGlossaryTermsData"
import { collectGardenData } from "./quartz/garden/collect"

// 홈에서만 렌더링할 컴포넌트용 (quartz.config.yaml 의 layout.condition: index)
registerCondition("index", (props) => props.fileData.slug === "index")

// 아빠의 화단 전체 그림 페이지에서만 렌더링할 컴포넌트용 (layout.condition: gallery)
registerCondition("gallery", (props) => props.fileData.slug === "gallery")

// climate histography(연표) 페이지에서만 렌더링할 컴포넌트용 (layout.condition: timeline)
// content/gallery.md 와 같은 방식으로 content/timeline.md 하나뿐인 flat 페이지다(오솔길에
// 드롭다운 폴더로 안 보이게 — content/timeline/index.md 폴더 구조를 쓰지 않는다).
registerCondition("timeline", (props) => props.fileData.slug === "timeline")

// climate glossary(용어집) 페이지에서만 렌더링할 컴포넌트용 (layout.condition: glossary)
// content/timeline.md 와 같은 방식으로 content/glossary.md 하나뿐인 flat 페이지다.
registerCondition("glossary", (props) => props.fileData.slug === "glossary")

// 홈 컴포넌트 + 오솔길(탐색기) 식물 이모지가 같은 판정 결과를 쓰도록, 탐색기 설정을
// 만들기 전에 먼저 수집한다(.garden-cache/garden-data.json). 실패해도 빌드는 계속한다.
try {
  const s = collectGardenData()
  const plants = Object.entries(s.plants)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")
  console.log(
    `[garden] 정원 ${s.garden}(${plants}, 시듦 ${s.wilted}) · radar ${s.radar} · 갤러리 ${s.gallery} · git ${s.git} → ${s.path}`,
  )
} catch (e) {
  console.warn(`[garden] 정원 데이터 수집 실패(빌드는 계속): ${e instanceof Error ? e.message : e}`)
}

// garden.yaml 의 탐색기 제목/아이콘/식물 이모지 설정을 quartz.config.yaml 에 반영
// (방금 만든 garden-data.json 의 plant/wilted 판정을 그대로 읽어 정원 그림과 어긋나지 않게 한다)
syncExplorerConfigFromGarden()

// garden.yaml 의 home 항목(정원/radar/아빠의 화단 on·off)을 quartz.config.yaml 에 반영
syncGardenHomeConfigFromGarden()

// garden.yaml 의 properties 항목(노트 상단 Properties 표 표시 이름)을
// quartz/static/garden-properties-data.js 로 반영 (§7 — 방금 만든 garden-data.json 을
// 그대로 읽어 오솔길·정원 그림과 같은 식물 판정을 쓴다)
syncPropertiesConfigFromGarden()

// 용어집 인라인 연동(호버 툴팁, plugins/glossary-linker 가 본문에 심어둔 .glossary-ref 가
// 읽을 데이터) — plugins/climate-glossary/data/climate-glossary.json 을 그대로 옮겨 쓴다.
syncGlossaryTermsData()

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
