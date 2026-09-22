import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { registerCondition } from "./quartz/plugins/loader/conditions"
import { syncExplorerConfigFromGarden } from "./quartz/garden/syncExplorerFromGarden"

// 홈에서만 렌더링할 컴포넌트용 (quartz.config.yaml 의 layout.condition: index)
registerCondition("index", (props) => props.fileData.slug === "index")

// garden.yaml 의 탐색기 제목/아이콘 설정을 quartz.config.yaml 에 반영
syncExplorerConfigFromGarden()

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
