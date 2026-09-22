import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { registerCondition } from "./quartz/plugins/loader/conditions"
import { syncExplorerConfigFromGarden } from "./quartz/garden/syncExplorerFromGarden"
import { collectGardenData } from "./quartz/garden/collect"

// 홈에서만 렌더링할 컴포넌트용 (quartz.config.yaml 의 layout.condition: index)
registerCondition("index", (props) => props.fileData.slug === "index")

// garden.yaml 의 탐색기 제목/아이콘 설정을 quartz.config.yaml 에 반영
syncExplorerConfigFromGarden()

// 홈 컴포넌트용 정원 데이터(.garden-cache/garden-data.json). 실패해도 빌드는 계속한다.
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

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
