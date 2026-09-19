# PACM(6.4조) 전환 모니터

UNFCCC CDM의 [Activities transitioned to A6.4](https://cdm.unfccc.int/ProgrammeOfActivities/deregistered.html) 페이지를 매일 확인하고,
결과를 howdareryu.com(Quartz, GitHub Pages)의 `/pacm` 페이지로 자동 게시합니다.

## 구성

| 파일 | 역할 |
|---|---|
| `pacm_monitor.py` | 페이지 확보 → 파싱 → 이전 스냅샷과 비교 → 마크다운/JSON/CSV 생성 |
| `requirements.txt` | playwright, beautifulsoup4 |
| `.github/workflows/pacm-monitor.yml` | 매일 07:30 KST 실행, 커밋, Quartz 배포 트리거 |
| `run_local.sh`, `launchd/` | GitHub 러너가 차단될 때 쓰는 macOS 로컬 실행 대안 |

## 생성물 (Quartz 저장소 안)

- `content/pacm/index.md` : 게시 페이지. 주소는 `https://howdareryu.com/pacm`
- `content/pacm/data/latest.json`, `latest.csv` : 현재 목록
- `content/pacm/data/changelog.json` : 신규/삭제/수정 이력 누적
- `content/pacm/data/state.json` : 기준선, 항목별 최초 확인일
- `content/pacm/data/history/YYYY-MM-DD.json` : 변경이 있던 날의 스냅샷

## 변경 하이라이트 방식

- 페이지 상단 콜아웃에 최근 30일 변경을 나열합니다. 신규 🆕, 삭제 ❌, 수정 🔄.
- 표에서 해당 행의 Ref와 사업명을 `==하이라이트==` 처리하고 🆕/🔄 배지를 붙입니다.
- 하단 "변경 이력" 표에 전체 이력이 남습니다.
- 첫 실행은 기준선으로만 저장하고 변경으로 취급하지 않습니다.
- 기간은 `PACM_HIGHLIGHT_DAYS` 또는 `--highlight-days` 로 조정합니다.
- `PACM_WEBHOOK` 시크릿을 넣으면 변경 시 Slack/Discord/Teams로 알림을 보냅니다.
  - Teams: 채널 ⋯ → Workflows → "Post to a channel when a webhook request is received" 로 만든 URL을 넣습니다. URL 호스트(`logic.azure.com`, `powerplatform.com`)를 보고 Adaptive Card 형식으로 자동 전환합니다.

## 설치 A: GitHub Actions (권장)

Quartz 저장소(howdareryu.com 소스)에서:

```bash
mkdir -p tools/pacm_monitor .github/workflows
cp <이 폴더>/pacm_monitor.py <이 폴더>/requirements.txt tools/pacm_monitor/
cp <이 폴더>/.github/workflows/pacm-monitor.yml .github/workflows/
git add tools .github && git commit -m "add pacm monitor" && git push
```

그다음 확인할 것:

1. `pacm-monitor.yml` 의 `SITE_BRANCH`(`v5`)와 `DEPLOY_WORKFLOW`(`deploy.yml`)는 `RyuHan100/howdareryu-site` 에 맞춰져 있습니다.
2. 배포 워크플로에 `workflow_dispatch:` 트리거가 있어야 합니다. 없으면 `on:` 아래에 한 줄 추가.
3. Settings → Actions → General → Workflow permissions 를 "Read and write" 로 설정.
4. Actions 탭에서 "PACM transition monitor" 를 수동 실행(Run workflow)해 첫 기준선을 만듭니다.

## 설치 B: 로컬 macOS (대안)

UNFCCC 사이트는 Incapsula 봇 차단을 씁니다. 헤드리스 브라우저는 차단되고 실제 Chrome 창을 띄우면 통과합니다.
워크플로는 xvfb 위에서 Chrome을 헤드풀로 실행해 우회하지만, GitHub 러너 IP가 차단되면 실패합니다(이 경우 데이터는 건드리지 않고 exit 2).
그럴 때는 로컬 실행으로 전환합니다.

```bash
# SITE_REPO/SITE_BRANCH 는 howdareryu-site / v5 로 설정돼 있음
./run_local.sh                                   # 1회 테스트
cp launchd/com.ryuhan.pacm-monitor.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ryuhan.pacm-monitor.plist
```

## 주의

- Obsidian 볼트를 Quartz `content/` 로 미러링 동기화(삭제 포함)한다면 `content/pacm/` 을 동기화 제외로 지정하세요. 아니면 다음 동기화 때 지워집니다.
- 수동 테스트: `python pacm_monitor.py --site-root <quartz 경로> --dry-run`
- 저장된 HTML로 테스트: `--html-file page.html`
