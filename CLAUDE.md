# howdareryu.com — "정원" 리디자인 작업 노트

이 저장소(Quartz v5, 브랜치 `v5`, GitHub Pages 배포, https://howdareryu.com)를 "정원" 콘셉트로
바꾸는 작업의 기준 문서. **모든 작업 전에 이 파일부터 읽는다.** 조사일: 2026-09-22.

## 0. 현재 상태 (먼저 확인)

- **⚠️ `content/canvases.canvas`가 작업 트리에서 삭제돼 있고 `docs/Canvas.canvas`도 내용이
  줄어든 상태(2026-09-23 발견).** 이 세션이 건드린 적 없는 파일이라 원인 불명 — Obsidian에서
  캔버스를 열람/편집 중이었을 가능성. **커밋에서 계속 빼두고 있다.** 다음 작업 시작 전에
  사용자에게 의도한 변경인지 확인할 것 — 이 삭제는 사이트 빌드에도 실제로 영향을 준다
  (그 페이지를 가리키던 backlink/graph 가 있던 페이지들이 같이 바뀜).
- **탐색기(§5, 식물 이모지 포함), 정원 데이터 수집기(§8.1), radar 이력 단위 수집(§8.2),
  홈 5구역+garden-home 뼈대(§8), Properties 표시 이름(§7), ② 정원, ③ radar 전부 완료·배포됨**
  (`v5`, 최신 배포 커밋 `dc8f0869`, `home.garden`/`home.radar: true`).
- **④ 아빠의 화단(홈 슬라이드쇼 + 전체 그림 페이지, §8) 구현 완료, `home.gallery: true`로 켬,
  아직 커밋 안 함** — 사용자 확인 대기 중. 홈 5구역(①~⑤) 전부 완성.
- **다국어(§13) 구현·로컬 확인 완료, 아직 커밋 안 함(2026-09-23).** ⚠️ **pre-commit 훅이 이미
  켜져 있다**(`core.hooksPath=.husky/_`) — 이 저장소에서 커밋하면(`npx quartz sync` 포함)
  `translate: true` 노트와 `content/index.md`가 스테이징돼 있을 때 Opus 로 영문본을 만든다.

## 1. 저장소와 클론

- 작업 클론: `/Users/ryuhan/Documents/기후/quartz` (vault 안의 사용자 본인 클론). **reset/clean 금지.**
  다른 자동화(`t_achive`, `hdr_comments`, `news_clipping`, `text2speech`)는 각자
  `~/.local/share/*/site`의 전용 sparse 클론으로 push한다 — 그 클론들은 건드리지 않는다.
- origin `RyuHan100/howdareryu-site`(public), branch `v5`. upstream `jackyzha0/quartz`.
- 커뮤니티 플러그인은 `.quartz/plugins/<name>`에 설치되고 `quartz.lock.json`이 커밋을 고정한다.
  로컬 플러그인(`source: ./plugins/<name>`)은 lock에 넣지 않는다(절대경로가 들어가 CI에서 깨짐).
- 로컬 빌드: `npx quartz build` (출력 `public/`, gitignore됨). 가끔 `ENOTEMPTY ... public/img/...`로
  실패하면 `rm -rf public` 후 다시 빌드.

## 2. content/ 구조

```
content/
  index.md                    홈
  archive.md                  title "🔒 비공개 아카이브" — /static/t-archive*/ 암호화 페이지로 가는 링크
  gallery.md                  title "Inspiration" — 아빠(여송) 그림 갤러리 (CI가 재생성, §6)
  basement.base, canvases.canvas
  basic terminal command for quartz.md
  scribbled notes/            6개(index 포함). frontmatter: title, created, aliases, tags, publish
                              aliases 가 옛 주소(scribbled/…)를 리다이렉트로 살려둠
  radar/                      105개 노트, radar/ 바로 아래 노트는 없음
    news/                     index + 2026/YYYY-MM-DD.md (뉴스 클리핑, 매일 자동)
    pacm/                     index 1개 (PACM 모니터, 매일 자동)
    국회 기노위/               index + assembly-radar + 회의별 노트 약 100개
  img/inspiration/            아빠 그림 101장(jpg 99, jpeg 2), 원본 합계 약 483MB
  Untitled/                   빈 폴더(탐색기에 안 나옴)
```

radar 노트들의 frontmatter에는 `date`, `modified`가 들어 있다(뉴스·PACM). scribbled notes는 `created`만
있고 수정일은 대부분 없다 → 수정일은 git 기록에서 읽는다(§6).

## 3. 홈 (content/index.md) 현재 구성

frontmatter `title: Ryu's Garden`, `description`, `created`, `updated`, `tags: [hello]`.
본문: 인사말 3줄 → "산책 가이드"(탐색기/그래프 뷰/검색 안내) → `---` → "신호 보내기"
(Instagram @howdareryu, Email, GitHub). 오른쪽 사이드바에 `recent-notes`("최근 업데이트")가 홈에서만 뜬다.

## 4. 테마 · 레이아웃 · 컴포넌트 설정 위치

| 무엇 | 어디 |
|---|---|
| 사이트 설정, 플러그인 목록, 옵션, 배치 | `quartz.config.yaml` (`quartz.config.default.yaml`은 업스트림 기본값 — 안 건드림) |
| 커스텀 조건(`index`/`gallery`) 등록, 빌드 전 훅 | `quartz.ts` |
| 전역 CSS 덮어쓰기 | `quartz/styles/custom.scss` |
| `<head>` (TTS 스크립트 포함) | `quartz/components/Head.tsx` |
| 로컬 플러그인 | `plugins/<name>/` (예: `plugins/hdr-comments`, `plugins/garden-home`, `plugins/gallery-page`) |
| 정원 설정 | `garden.yaml` (탐색기 §5, 홈 데이터 §8.1) — 모든 정원 설정은 여기에 |
| 정원 코드 | `quartz/garden/` (탐색기 sync, 데이터 수집기) |

- **테마**: `quartz-themes`(saberzero1) 플러그인, `options.theme: hackthebox`. 배포 워크플로도
  `THEME_NAME: hackthebox`로 테마를 받아온다. 다크 모드 전용(빌드 로그에 경고가 뜨는 게 정상).
  테마 파일은 Obsidian 테마를 옮긴 CSS 묶음(`.quartz/plugins/quartz-themes/src/themes/hackthebox.json`,
  청크별: explorer, callouts, properties …). 탐색기 아이콘은 넣지 않는다.
  **함정:** `--highlight`/`--textHighlight`가 불투명 형광 연두 → 커스텀 UI 배경으로 쓰지 말 것.
  반투명 색은 `color-mix(in srgb, var(--secondary) N%, transparent)`로 직접 만든다.
  `custom.scss`에서 `strong`을 `#9fef00`으로 칠하고 있다.
  **함정 2(2026-09-23 발견):** `--lightgray`(`#1a2331`)가 배경 `--light`(`#141d2b`)와 거의 같은
  어두운 남색이다 — 다크 전용 테마라 "light-"로 시작하는 이름과 실제 밝기가 맞물리지 않는다
  (radar 격자선/패널 테두리에 썼다가 안 보여서 발견, §8). 선·테두리처럼 배경과 대비돼야 하는
  요소는 실제로 밝은 `--gray`(`#a4b1cd`)를 `color-mix`로 옅게 섞어 쓴다. 새 UI 를 만들 때
  변수 이름만 보고 밝기를 짐작하지 말고 헤드리스 브라우저로 실제 렌더링을 확인할 것.
- **배치**: 컴포넌트 플러그인마다 `layout: { position, priority, group?, condition?, display? }`.
  position은 `left / right / beforeBody / afterBody` 배열. `pageBody`(마크다운 본문)는 단일 슬롯이라
  본문 중간에 컴포넌트를 끼울 수 없다. `layout.byPageType`으로 페이지 타입별 제외/비우기
  (지금 `folder`, `tag`에서 `hdr-comments`, `reader-mode` 제외, right 비움).
- **홈 전용 조건**: `quartz.ts`의 `registerCondition("index", props => props.fileData.slug === "index")`
  + 플러그인 항목의 `layout.condition: index`. `recent-notes`가 이미 이렇게 쓰고 있다.

## 5. 탐색기(Explorer) — 제목 · 표시 이름 · 아이콘 ✅ 완료(2026-09-22)

플러그인 `github:quartz-community/explorer`. 트리는 브라우저에서 `static/contentIndex.json`으로 그린다.
옵션 중 함수(`sortFn`/`filterFn`/`mapFn`)는 **JS 함수 식 문자열**로 넣어야 한다(브라우저가 `new Function`으로
실행). 적용 순서는 filter → map → sort. 표시 이름은 `options.mapFn`에서 `node.displayName = "..."`
(setter)로 재정의한다(폴더는 자기 `index.md`의 title, 없으면 폴더 이름. 노트는 frontmatter `title`,
없으면 파일명). 표시 이름만 바뀌고 `slug`/링크(URL)는 전혀 안 바뀐다.

**구현: `garden.yaml`(설정) + `quartz/garden/syncExplorerFromGarden.ts`(빌드 시점 반영).**
- `garden.yaml`의 `explorer:` 키에 `title`, `folder_icon`(매핑에 없는 폴더의 기본 아이콘),
  `folders`(폴더 자기 이름 → 아이콘), `items`(노트가 속한 최상위 조상 폴더/파일 이름 → 아이콘,
  깊이 무관), `plants`(scribbled notes 노트 앞 식물 이모지, 아래 참고) 5개로 관리. 지금 값:
  title `오솔길`, folder_icon `🪴`, folders `{radar: 📡}`, items `{radar: 📍, archive: 🔒,
  timeline: 🕰️, gallery: 🌼}`(`gallery`=`content/gallery.md`="아빠의 화단", 2026-09-23 추가 —
  frontmatter title 은 그대로 두고 오솔길 표시에만 붙인다, 기존 archive 방식과 같음),
  plants `{grass: 🌱, flower: 🌼, vine: 🌿, tree: 🌳, wilted: 🍂}`.
- `quartz.ts`가 `loadQuartzConfig()`를 부르기 **전에** `syncExplorerConfigFromGarden()`을 호출해서
  `garden.yaml`을 읽고, `quartz.config.yaml`의 explorer `options` 안 마커
  (`# === garden.yaml 자동 생성 시작/끝 ===`) 구간만 `title`/`mapFn`으로 재생성한다. 마커 바깥의
  손으로 쓴 `sortFn`·주석은 절대 안 건드린다. → **garden.yaml만 고치고 다시 빌드하면 탐색기가
  갱신**된다.
- 부작용 방지: 기존 `sortFn`의 마지막 비교 줄에 이모지를 떼고 비교하는 헬퍼(`stripIcon`)를 추가해서,
  표시 이름 앞에 아이콘이 붙어도 정렬 순서(scribbled notes 최상단 등)가 흔들리지 않게 했다.
- 중복 방지: `mapFn`이 아이콘을 붙이기 전에 `displayName.includes(icon)`을 확인한다 — 비공개
  아카이브는 frontmatter title에 이미 "🔒 비공개 아카이브"가 있어서 중복 없이 그대로 나온다.
- 결과(실제 콘텐츠로 시뮬레이션 검증함): 폴더는 기본 🪴, radar 폴더만 📡, radar 아래 모든 노트
  (news/pacm/국회 기노위 등 하위 폴더 깊이 무관)는 📍, 비공개 아카이브는 🔒 중복 없음.
- **한 번 CSS(`::before`, `quartz/styles/custom.scss`) 방식으로 바꿔본 적이 있다.** 표시 이름·정렬에
  전혀 영향이 없어서 이론적으론 더 안전하지만, `folders`처럼 폴더별 예외까지 `garden.yaml` 하나로
  관리하려면 CSS 셀렉터를 매번 손으로 추가해야 해서 "설정에 없는 새 폴더는 자동으로 기본 아이콘"이
  안 됐다 → 다시 지금의 mapFn/garden.yaml 방식으로 되돌렸다. CSS 규칙은 `custom.scss`에서
  전부 제거했다(더 필요해지면 폴더 컨테이너의 `data-folderpath`, 파일은 `a[href^="/prefix/"]`
  셀렉터를 쓸 수 있다는 건 기록해 둔다).

**식물 이모지(`explorer.plants`) ✅ 완료(2026-09-23) — 정원 그림과 반드시 같은 데이터를 쓴다.**
- `quartz.ts`의 실행 순서를 바꿨다: `collectGardenData()`(§8.1)를 `syncExplorerConfigFromGarden()`
  **보다 먼저** 부른다. 그래서 오솔길의 `mapFn`을 만들 때 이미 `.garden-cache/garden-data.json`
  이 존재하고, `syncExplorerFromGarden.ts`가 그 안의 `garden.notes[].plant`/`wilted`를 그대로
  읽어(판정 로직을 여기서 다시 만들지 않음) `{slug: 이모지}` 표를 만들어 `mapFn`에 `plantIcons`로
  박아 넣는다. → **정원 그림(§8)과 오솔길이 항상 같은 판정 결과를 보고, 둘이 어긋날 수가 없다**
  (판정 기준을 바꾸면 `garden.yaml`의 최상위 `plants.rules`만 고치면 둘 다 같이 바뀐다).
  `garden-data.json`이 없거나 못 읽으면(빌드 실패 등) `plantIcons`가 빈 객체가 돼서 조용히
  아이콘 없이 넘어간다 — 탐색기 자체가 깨지지는 않는다.
  wilted는 종류보다 우선(시든 덩굴도 종류 이모지 대신 🍂).
  - 구현: `quartz/garden/syncExplorerFromGarden.ts`에 `readGardenNotes()`/`buildPlantIconsBySlug()`
    추가, `mapFn`에 파일 분기 마지막에 `plantIcons[node.data.slug]` 검사 한 단락 추가(폴더/`itemIcons`
    로직은 그대로).
  - 검증: 실제 5개 노트로 시뮬레이션(풀 3·꽃 1·덩굴 1, garden-data.json과 정확히 일치),
    wilted 우선순위는 단위 테스트로 확인(시든 덩굴 → 🍂, 안 시든 나무 → 🌳 그대로).
    사이트 전체 747개 페이지의 `<body>`를 배포본과 비교하면 **전부 다르게 나오는데**, 이유는
    오솔길이 모든 페이지에 있는 공용 사이드바라 `mapFn` 문자열이 담긴 `data-data-fns` 속성이
    모든 페이지 HTML에 박혀 있기 때문 — 그 속성만 빼고 비교하면 완전히 동일함을 확인했다
    (=다른 페이지의 실제 렌더링·기능은 안 바뀜, 예상된 정상 동작).

## 6. 배포 워크플로 (`.github/workflows/deploy.yml`)

- 트리거: `v5`에 push, `workflow_dispatch`(pacm-monitor가 호출).
- 단계: `actions/checkout@v6` → Node 24 → `npm ci` → `npx quartz plugin install` → hackthebox 테마 받기
  → Python 3.12 + Pillow → `python scripts/gen_gallery.py` → `npx quartz build` → Pages 업로드·배포.
- **checkout에 `fetch-depth: 0` 있음 (확인함).** git 기록으로 수정일을 읽을 수 있다.
  `created-modified-date` 플러그인이 `priority: [frontmatter, git, filesystem]`, `defaultDateType: modified`로 켜져 있다.
- **`gen_gallery.py` (2026-09-23 재작성):** CI에서만 돌면서 `content/img/thumbs/*.webp`(긴 변
  800px 썸네일) + `content/img/thumbs/meta.json`(그림별 원본 width/height, 레이아웃 흔들림
  방지용)을 만든다 — 저장소엔 없고 CI 빌드에만 있다. **더 이상 `content/gallery.md`를 다시
  쓰지 않는다**(예전엔 소개글이 "총 N장."으로 덮어써지는 문제가 있었다 — 이제 gallery.md는
  사람이 관리하는 평범한 파일이고, 그림 격자는 `plugins/gallery-page` 컴포넌트가 그린다, §8).
  - **함정: `content/img/thumbs/`를 `.gitignore`에 넣으면 안 된다.** `quartz/plugins/emitters/
    assets.ts`(content/ 의 이미지 등을 public/ 으로 복사하는 이모터)도 Static 이모터처럼
    `glob(..., gitignore:true)`라, 로컬이든 CI든 그 순간 막 만들어진 썸네일이라도 `.gitignore`에
    걸리면 복사에서 빠져 사이트에서 이미지가 전부 깨진다(garden-properties-data.js 때와 같은
    함정, §7). 로컬에서 생겼을 때 커밋에 안 들어가게 하는 건 `.gitignore`가 아니라 손으로
    주의해야 한다(아래).
  - 로컬에서 돌리면 (Python 3.9 는 `from __future__ import annotations` 를 추가해 둬서 돌아간다)
    `content/img/thumbs/`가 생긴다 — **커밋하지 않게 주의**(위 함정 때문에 `.gitignore`로 막을
    수 없으니 `git add` 할 때 특히 조심).
- 다른 워크플로(`news-clipping.yml`, `pacm-monitor.yml` 등)는 정원 작업에서 건드리지 않는다.

## 7. 노트 상단 Properties 표 — 표시 이름 ✅ 완료(2026-09-23)

플러그인 `github:quartz-community/note-properties` (`includeAll: true`, beforeBody). 옵션은
`includeAll`/`includedProperties`/`excludedProperties`/`hidePropertiesView`/`delimiters`/`language`뿐이라
**키 이름을 바꾸는 옵션이 없다** — 표의 왼쪽 칸은 frontmatter 키를 그대로 출력하고, 표 제목
"Properties"는 플러그인 i18n에 en-US만 있어서 locale이 ko-KR이어도 그대로 "Properties"다.
frontmatter 는 절대 안 바꾼다(→ 다른 기능·git 기록·created-modified-date 플러그인에 영향 없음) —
**표시만** 클라이언트에서 갈아 끼운다.

**구현: `garden.yaml`(설정) + `quartz/garden/syncPropertiesFromGarden.ts`(빌드 시점 생성) +
`quartz/static/garden-properties.js`(손으로 쓴 동작 스크립트).**
- `garden.yaml`의 `properties:` 키로 관리: `table_title`(표 제목), `labels`(frontmatter 키 →
  표시 이름, 모든 노트 공통 기본값), `radar_overrides`(radar 폴더 노트에서만 `labels`를
  덮어씀), `scribbled_extra`(scribbled notes 전용 칸 3개의 표시 이름: `plant`/`roots`/`seeds`).
  지금 값: 제목 `식물 이름표`, labels `{created: 심은 날, modified: 물 준 날, dateModified: 물 준 날,
  tags: 품종, description: 한 줄 소개}`, radar_overrides `{created: 수신일}`, scribbled_extra
  `{plant: 식물, roots: 뿌리, seeds: 씨앗}`.
- `quartz.ts`가 `collectGardenData()`(§8.1) **다음에** `syncPropertiesConfigFromGarden()`을 불러서
  `garden.yaml`의 `properties`와 방금 만든 `.garden-cache/garden-data.json`(오솔길 식물 이모지·
  정원 그림과 같은 데이터, §5)을 읽어 `quartz/static/garden-properties-data.js`를 만든다
  (`window.__GARDEN_PROPERTIES__ = {...}` 하나, `notes` 항목에 scribbled notes 각 슬러그별
  식물/뿌리/씨앗 값이 이미 계산돼 들어있다 — 판정을 다시 하지 않음).
  - **이 생성 파일은 다른 마커-동기화 결과(quartz.config.yaml)와 달리 반드시 커밋해야 한다.**
    `quartz/static/`은 Static 이모터가 `public/static/`으로 그대로 복사하는데 그 글롭이
    `gitignore: true`라 gitignore된 파일은 조용히 빠진다(처음에 이걸로 실패해서 확인함) —
    `.garden-cache/garden-data.json`과 달리 브라우저로 나가야 하므로 커밋 대상이다.
    `garden.yaml`을 고치면 다시 빌드해서 diff를 같이 커밋한다.
- `quartz/static/garden-properties.js`(커밋된, 손으로 쓴 파일)가 `Head.tsx`에서 `data-persist`
  스크립트 태그 2개(데이터 파일 먼저, 이 파일 다음 — `defer`가 문서 순서를 지킴)로 모든 노트
  페이지(홈 제외, TTS/댓글과 같은 조건)에 실린다. `nav` 이벤트마다(+최초 로드) 다시 적용:
  1. `.note-properties-title` 텍스트를 `tableTitle`로.
  2. `document.body.dataset.slug`의 첫 세그먼트가 `radarFolder`("radar")와 같으면
     `labels`에 `radarLabelOverrides`를 덮어씌운 걸 쓴다.
  3. `.note-properties-key` 각 칸의 원문 텍스트가 `dropKeys`에 있으면 그 행을 통째로 지우고,
     `labels`에 있으면 텍스트만 바꾼다. `dropKeys`(`date`/`published`/`lastmod`/`updated`/
     `last-modified`)는 `garden.yaml`에 없는 고정값 — note-properties 플러그인이 자체적으로
     이 값들을 `created`/`modified`/`published` 캐노니컬 키로 복사해 넣기 때문에(원본
     transformer 코드, §7 조사 당시 확인), 그대로 두면 같은 날짜가 영어 키로 중복 표시된다.
     frontmatter 는 안 건드리고 표시 스냅숏에서만 지운다.
  4. 현재 슬러그가 `notes`(scribbled notes 전용)에 있으면 `<tbody>` 끝에 행을 추가한다
     (`data-garden-extra="true"`로 중복 추가 방지). `.note-properties-count` 배지도 지우고
     더한 만큼 다시 계산한다.
- **알려진 예외**: `scribbled notes/2026-09-20 AI.md`는 frontmatter 키로 `dateModified`를 쓰는데
  이건 note-properties 플러그인의 별칭 목록(`modified`/`lastmod`/`updated`/`last-modified`)에
  없어서 캐노니컬 `modified`로 안 합쳐지고 따로 남는다 → 검증 중 발견, `labels.dateModified`도
  `물 준 날`로 매핑해 표시는 맞지만, `modified`(값은 created 로 대체된 값)와 `dateModified`
  (진짜 값) 두 행이 둘 다 "물 준 날"로 남아 값이 두 번 보인다(빈도 낮은 케이스, frontmatter 를
  안 건드려서 고치지 않고 기록만 해둠 — 나중에 그 노트의 키를 `modified`로 바꾸면 사라진다).
- **검증(2026-09-23)**: 로컬 빌드 후 headless Chrome으로 스크립트 실행 뒤 DOM을 떠서 확인—
  scribbled notes(AI.md): 제목 식물 이름표, 심은 날/물 준 날/품종 라벨 정상, 식물 🌼 꽃·뿌리 0·
  씨앗 0 행 추가(칸 수 7→10, garden-data.json과 일치). radar(PACM): 제목 식물 이름표, 수신일·
  물 준 날·품종·한 줄 소개 라벨 정상, 중복 `date`/`published` 행 삭제(칸 수 5), 식물 칸 없음.
  plain 노트(archive.md, basic terminal command…): 라벨만 바뀌고 추가 칸 없음. 이전 배포 커밋
  (`1cc52afe`)과 `public/` 748개 파일을 통째로 비교해서, **차이가 난 147개 페이지 전부 `<head>`의
  새 `<script>` 태그 2개(garden-properties-data.js/garden-properties.js) 그 자체뿐**임을 정규식으로
  확인했다(그 두 태그를 지우면 baseline과 100% 동일) — 표 내용 변화는 정적 HTML이 아니라 클라이언트
  스크립트가 만드는 것이라 서버 렌더링 diff에는 안 나타난다(예상된 동작). 홈(index.html)은 스크립트
  자체가 없어(§9와 같은 조건) baseline과 완전히 동일. `index.xml`/`sitemap.xml`의 차이는 빌드
  시각(`lastmod`/`pubDate`)뿐이라 무관.

## 8. 홈 전용 컴포넌트 — `plugins/garden-home` ✅ 뼈대 완료(2026-09-22)

홈 순서: ① 소개 ② 정원 ③ radar ④ 아빠의 화단 ⑤ 정원사에게 연락하기.

**구현: 로컬 플러그인 `plugins/garden-home`, 컴포넌트 하나(`GardenHome`)가 ②~⑤를 순서대로 그린다.**
- ① 소개는 `content/index.md` 본문 그대로(`pageBody`) — 정확히 이 3줄만:
  "안녕하세요, Ryu입니다. / 이곳은 저의 디지털 정원으로, / 주로 기후위기에 대응하기 위한 자료와
  생각을 심고 가꿉니다." 기존 "산책 가이드"·"신호 보내기"는 본문에서 뺐다.
- `GardenHome`은 `quartz.config.yaml`에 `layout: { position: afterBody, condition: index, priority: 5 }`
  로 등록(`hdr-comments`priority 10 보다 위). 한 컴포넌트 안에서 섹션을 배열로 쌓아 순서를 한 곳에서
  관리한다(②③④는 각자 `garden.yaml`의 `home.garden/radar/gallery`가 true 일 때만, ⑤는 항상).
  구조는 `plugins/hdr-comments`를 그대로 따름: `package.json`의 `quartz` 필드, `src/component.js`
  (preact vnode 직접 생성, 외부 import 없음) → `node build.mjs` → `dist/` 커밋.
- **②③④는 지금 자리 표시만 나온다("다음 단계에서 채울 예정")** — 실제 시각화는 다음 단계.
  - ⑤ 연락처는 항상 나온다: "정원사에게 연락하기" + Instagram(`@howdareryu`, 외부 링크)/
    Email(`mailto:`)/GitHub(`howdareryu-site`, 외부 링크) — 기존 "신호 보내기"와 같은 값.
- **켜고 끄기**: `garden.yaml`의 `home: { garden, radar, gallery }`(각각 boolean, **기본값 전부
  false**). `quartz/garden/syncGardenHomeFromGarden.ts`가 빌드 시작 때 이 값을
  `quartz.config.yaml`의 `garden-home` 플러그인 `options`(마커 구간)에 반영한다 —
  `syncExplorerConfigFromGarden.ts`와 같은 방식, 다만 브라우저용 JS 문자열이 아니라 그냥
  boolean 값이라 더 단순하다. **새 폴더가 생겨도 이 세 스위치와 무관하게 동작**(스위치는 섹션
  전체를 켜고 끄는 것이고, 폴더별 세부 동작은 §8.1의 `config.ts` 기본값이 처리).
- 검증(2026-09-22): 로컬 빌드 후 세 스위치를 모두 켜서 ②③④⑤ 순서로 자리 표시가 나오는지
  확인하고, 다시 기본값(전부 false)으로 되돌렸다. 이전 배포 커밋과 `public/` 을 통째로 비교해서
  **홈 페이지의 `<body>` 만 바뀌었고 다른 모든 페이지의 `<body>`는 바이트 단위로 동일**함을
  확인했다(`<head>`의 공유 CSS 청크 링크 하나만 늘어남 — 새 컴포넌트의 CSS가 전체 번들에
  들어가서 생기는 불가피한 차이, 다른 페이지에 실제로 적용되는 규칙은 없음).
- 데이터는 §8.1의 `.garden-cache/garden-data.json`을 컴포넌트가 빌드 시점에 `node:fs`로 읽는다
  (`allFiles` props로 다시 계산하지 않는다 — git 기록·링크 그래프·판정은 수집기가 이미 함).
  플러그인 dist 에 npm 의존성은 안 되지만 `node:` 내장 모듈 import 는 된다(Node 가 dist 를 직접 import).
  - ② 정원 ✅ 모양 + 상호작용·움직임 완료(2026-09-22 모양, 2026-09-23 상호작용/움직임) —
    `plugins/garden-home/src/garden-svg.js`(서버 렌더링) + `garden-interactive.js`
    (`Component.afterDOMLoaded`, 클라이언트).
    - 빌드 때 SVG 문자열을 만들어 `dangerouslySetInnerHTML`로 넣는다. 식물 = 노트 하나,
      `plant`(grass 풀·flower 꽃·vine 덩굴·tree 나무, 모르는 값은 풀)대로 그린다. 덩굴 끝은 "?"처럼
      말리고 좌우는 해시로 뒤집힌다. 글자 수로 크기 0.85~1.2배.
    - 흙 단면(표토·심토·자갈) + `missingLinks`는 흙 속 씨앗(식물당 최대 4개, `<title>`에 대상 이름).
    - `wilted`는 `.is-wilted` 클래스 → CSS 에서 회색.
    - 배치: 생성일(같으면 경로) 순으로 심고, 칸은 경로 FNV-1a 해시 % 12, 차 있으면 오른쪽 빈칸,
      이랑이 12개 다 차면 아래 새 이랑. 새 노트는 늘 마지막에 심겨 **기존 식물이 안 움직인다**(시험함).
      노트를 지우거나 과거 날짜로 새 노트를 만들면 뒤쪽 몇 개가 옮길 수는 있다.
    - 반응형: 좁은 이랑(칸 30, viewBox 376)과 넓은 이랑(칸 58, viewBox 712)을 둘 다 만들고
      `@media (min-width: 801px)`(Quartz mobile 기준)로 하나만 보인다. 식물 크기는 같고 간격만 넓어진다.
      안 보이는 쪽은 display:none 이라 스크린리더·탭 순서에서 빠진다.
    - 각 식물은 `<a href="./slug" data-router-ignore aria-label="제목 · 종류[ · 시듦]">`.
      SVG `<a>`의 `href`가 문자열이 아니라 Quartz SPA 라우터가 못 다루므로 `data-router-ignore`로
      일반 이동을 쓴다. 색은 전부 클래스 + 테마 CSS 변수(`--color-green/pink/yellow/orange` 등, 대체값 포함).
    - 확인 방법: 가짜 노트 150개(`content/scribbled notes/zz-…` 임시 폴더, frontmatter 의 plant/modified/
      없는 링크로 종류·시듦·씨앗을 섞음)로 13이랑이 12개씩 차는지, 380px(iframe 으로 실제 뷰포트)와
      1400px 화면을 headless Chrome 스크린샷으로 봤다. 확인 뒤 가짜 노트는 지웠다.
      ※ headless Chrome 의 `--window-size=380` 스크린샷은 오른쪽이 잘려 보이는데 실제 overflow 가 아니다
      (380px iframe 안에서 scrollWidth=380 확인). 모바일 확인은 iframe 으로 할 것.
    - `garden.yaml`의 `home.garden`은 2026-09-23부터 **true**(상호작용·움직임까지 확인 후
      사용자가 직접 켜라고 지시함 — 이전에는 "확인만 하고 false로" 였다).

  **상호작용·움직임(2026-09-23) — `plugins/garden-home/src/garden-interactive.js`.**
  - garden-svg.js 가 각 `<a class="gp-plant">`에 data-* 속성을 미리 심어 둔다(`data-slug`/
    `title`/`kind`/`wilted`/`modified`/`created`/`links`) — 클라이언트는 이 속성만 읽고, 판정·
    날짜·링크 계산을 다시 하지 않는다(정원 그림·오솔길과 항상 같은 값).
  - **선택 패널**: 식물을 클릭(또는 포커스 후 Enter/Space)하면 그 식물의 `aria-expanded`를
    `true`로 하고(다른 식물은 `false`), `.gp-panel`에 제목·종류·물 준 날 + 노트로 가는 실제
    링크(`<a href>`)를 채운다. 같은 식물을 다시 누르거나 Escape 를 누르면 선택 해제. 클릭 시
    `preventDefault`로 즉시 이동을 막는다 — 예전엔 클릭하면 바로 노트로 이동했는데, 이제는
    패널을 먼저 보여주고 패널의 링크로 이동하는 방식으로 **동작이 바뀌었다**(요청사항).
  - **뿌리**: 고른 식물의 `data-links`(이 정원 안의 다른 식물로 가는 링크·백링크 교집합, 정원
    밖 노트는 포함 안 함)에 있는 슬러그만, 같은 `.gp-beds`(좁은/넓은 이랑) 안에서
    `getBoundingClientRect()`로 두 식물의 위치를 구해 `.gp-roots`(이랑 전체를 덮는 빈 SVG,
    `pointer-events:none`)에 곡선(`<path>`)을 그린다. 평소엔 비어 있다. 이랑을 나눠 그리는
    `<svg class="gp-row">`와는 별도 좌표계라 여러 줄에 걸친 뿌리도 그릴 수 있다.
  - **흔들림**: 식물 모양은 바깥 `<g transform="translate(x y)">`(자리, SVG 속성) 안에 다시
    `<g class="gp-sway">`(흔들림, CSS `transform`)로 감싼다 — 같은 요소에 SVG 속성 transform 과
    CSS transform 을 같이 쓰면 CSS 가 자리 이동을 덮어써서 자리가 흐트러지므로 반드시 나눈다.
    `IntersectionObserver`가 화면에 보이는 `.gp-row`에만 `.is-visible`을 붙이고, CSS
    `@media (prefers-reduced-motion: no-preference)` 안에서만 `.gp-row.is-visible .gp-sway`에
    `animation`을 건다 — 모션 최소화를 선호하면 관찰기 자체를 안 붙이고, CSS 도 한 번 더 막는다
    (이중 방어, CLAUDE.md §9).
  - **타임랩스**: 재생 버튼을 누르면 모든 식물의 `data-created` 중 가장 이른 날부터
    "오늘"(클라이언트의 실제 현재 시각 — 빌드 시각이 아니다)까지 1주 간격으로 날짜를 밟으며,
    그 날짜보다 나중에 생긴 식물엔 `.gp-future`(`opacity:0`)를 붙인다. 버튼이 "멈추기"로
    바뀌고, 다 돌거나 버튼을 다시 누르면 전부 다시 보이는 상태로 돌아온다. 모션 최소화여도
    버튼은 그대로 제공(사용자가 직접 누르는 동작이라 자동재생과 다름), 다만 `.gp-future` 전환에
    쓰는 `opacity` 트랜지션은 같은 media query 로 막아 즉시 나타나고 사라진다.
  - **검증(2026-09-23)**: Node 22 내장 WebSocket/fetch 로 헤드리스 크롬을 CDP 로 직접 조작해
    실제 클릭·키보드 이벤트를 실행해 확인(스크린샷이 아니라 DOM 상태 assert) — 클릭 시
    패널·`aria-expanded` 정상, 가짜 `data-links`로 뿌리 곡선이 옳은 두 식물 사이에 그려짐,
    같은 식물 재클릭/Escape 로 해제됨, Enter 키로도 선택됨, 재생 버튼으로 미래 식물이 숨겨지고
    날짜 배지가 올라가다 멈추기를 누르면 즉시 전부 복원됨, `prefers-reduced-motion: reduce`
    에뮬레이션 시 흔들림 관찰기가 전혀 안 붙음(`is-visible` 0개)을 확인. 이전 배포 커밋
    (`9797f9e9`)과 `public/` 전체를 비교해서 **홈(index.html) 외 147개 페이지는 전부 공유
    번들 파일명(콘텐츠 해시)만 다르고 그 파일 내용까지 대조하면 우리 스크립트/CSS가 그대로
    추가된 것 말고는 전혀 안 바뀜**을 확인했다(afterDOMLoaded 스크립트·컴포넌트 CSS 가
    사이트 전체 공유 번들이라 이 컴포넌트가 홈에서만 나와도 번들 해시는 항상 바뀐다 — §7의
    Head.tsx 스크립트 추가와 같은 종류의 불가피한 부작용). index.html 자체는 정원 자리표시자가
    실제 내용으로 바뀐 만큼만 달라짐(의도된 변화).
  - ③ radar ✅ 완료(2026-09-23) — `plugins/garden-home/src/radar-svg.js`(서버 렌더링) +
    `radar-interactive.js`(클라이언트, garden-interactive.js 뒤에 이어 붙어 같은
    `Component.afterDOMLoaded` 문자열을 이룬다 — build.mjs 참고). 표시 이름은 "radar"(고정).
    - **구역**: `garden-data.json`의 `radar.subfolders[]`(이미 garden.yaml 표시 이름·색이
      반영된 배열, 판정을 다시 안 함)로 원을 그 개수만큼 등분한다. 새 하위 폴더가 생기면
      `config.ts` 기본값으로 자동으로 구역이 하나 늘어난다(설정 안 해도 동작, 다른 정원 데이터와
      같은 철학). 구역 이름은 원 밖에 텍스트로, 각도에 따라 `text-anchor`를 start/middle/end로
      바꿔 겹치지 않게 한다.
    - **점**: `radar.notes[]`에서 `isIndex`(폴더 자기 자신의 index.md)는 보통 빼지만, PACM처럼
      `revision`(§8.2) 단위 기록은 노트 자체가 index.md 라도 이력은 진짜 기록이라 남긴다
      (`!isIndex || revision`). 나이(오늘 기준 일수)가 30을 넘으면 그리지 않는다. 각도는
      그 기록이 속한 구역 안에서 해시로 살짝 흔들어 겹침을 줄이고, 반지름은 `나이/30 × 반지름`
      (중심=오늘, 가장자리=30일). 점 색은 구역 색(`--sector-color`, garden.yaml 값 그대로).
    - **빛줄기**: "몇 겹의 반투명 부채꼴"을 그라디언트가 아니라 **진짜 4겹의 `<path>` 부채꼴**로
      겹쳐서(뒤로 갈수록 옅어짐) 만들고, 그 4겹을 통째로 담은 `<g class="radar-beam">`을 CSS
      `@keyframes radar-sweep`(`rotate(0→360deg)`, 10초, `linear infinite`)로 돌린다. 각도 규칙은
      0°=12시, 시계방향(CSS `rotate()`와 같은 방향)으로 통일해서 점의 위치 계산과 어긋나지 않게
      했다.
      **함정(2026-09-23 발견·수정)**: `transform-box: fill-box`를 쓰면 부채꼴 자기 자신의
      바운딩 박스 중심을 기준으로 돈다 — 부채꼴은 원 전체가 아니라 한쪽으로 치우친 조각이라
      그 박스 중심이 원의 진짜 중심과 다르고, 결과적으로 회전축이 원 중앙이 아니라 부채꼴이
      자기 박스 중심을 축으로 삥 도는 것처럼 보인다(사용자가 스크린샷으로 확인). `transform-box:
      view-box; transform-origin: 160px 160px`(SVG 좌표계 자체의 중심, `radar-svg.js`의
      `RADAR_CENTER`와 반드시 같은 값)로 고쳐서 해결 — 회전 중심을 원의 진짜 중심으로 못박아야
      하는 애니메이션(자기 자신이 원 전체를 덮지 않는 모양)은 `fill-box`가 아니라 `view-box` +
      절대 좌표를 써야 한다(반대로 §8의 `gp-sway`는 각 식물이 "자기 자신의 밑동" 기준으로
      흔들려야 해서 `fill-box`가 맞다 — 언제 어떤 걸 쓸지는 회전축이 "자기 자신 기준"인지
      "공유된 절대 좌표" 인지로 구분).
    - **점이 반짝임**: "빛줄기가 지나가면 밝아졌다 서서히 흐려짐"은 JS 로 실시간 계산하지 않고,
      모든 점에 **같은** `@keyframes radar-ping`(0%에 확 밝아졌다가 70%까지 서서히 옅어지고
      유지)을 걸되, 각 점의 `animation-delay`를 `(그 점의 각도/360) × 10초`로 **미리 빌드 시점에
      계산해 심어 둔다**(`radar-svg.js`의 `SWEEP_DURATION_S`가 CSS 의 10초와 반드시 같아야
      한다 — 값이 하나라도 안 맞으면 반짝임이 빛줄기와 어긋난다, 주석으로 양쪽에 표시해 둠).
      빛줄기와 점이 같은 시각(0초)에 함께 시작해서 위상이 맞다.
    - **화면 밖이면 멈춤**: `IntersectionObserver`가 `.radar-dial`을 보고 `.garden-home-radar`에
      `radar-is-visible`을 붙였다 뗀다. 빛줄기·점 애니메이션은 기본 `animation-play-state:paused`
      이고 그 클래스가 있을 때만 `running`으로 바뀐다(멈췄다 다시 보이면 그 지점부터 이어짐 —
      리셋이 아니라 진짜 "일시정지"). `prefers-reduced-motion: reduce`면 두 애니메이션 다
      `@media (prefers-reduced-motion: no-preference)` 바깥이라 처음부터 안 걸린다.
    - **점 클릭 패널**: 클릭/포커스+Enter·Space 로 고르면 그 점의 `aria-pressed`가 `true`가 되고
      (다른 점은 `false`), 정원 패널(`.gp-panel`)과 같은 모양의 패널에 구역·날짜·제목 + 노트로
      가는 링크가 뜬다. 고른 점은 인라인 `animationPlayState:paused`로 깜빡임을 멈춰 또렷하게
      유지한다(선택 해제하면 다시 CSS 애니메이션대로).
    - **검증(2026-09-23)**: 실제 데이터로 8개 점 확인(뉴스 4·PACM 1·국회 기노위 3, 30일 넘는
      기록은 실제로 빠짐). PACM 이 index.md 뿐인데 `revision` 예외로 살아남는 것도 확인. CDP로
      클릭→패널, Enter→선택/Escape→해제, `scrollIntoView` 전/후 `radar-is-visible`·
      `animationPlayState`(paused→running) 전환, `prefers-reduced-motion: reduce`에서
      `animationName: none`(애니메이션 자체가 안 걸림)을 전부 확인. 이전 배포 커밋(`7d4cc1d3`)과
      `public/` 전체 비교 결과 홈 외 페이지는 공유 번들 파일명만 다르고(§7·§8 과 같은 이유),
      그 번들 내용은 기존 정원 스크립트/CSS는 그대로 두고 radar 부분만 순수 추가됐음을 확인.
    - **스크린샷으로 잡은 버그 2개(2026-09-23, 사용자 피드백)**: (1) 위 §4 함정 2 —
      `--lightgray`가 안 보여서 원·구역선·패널 테두리가 전부 안 보였다. (2) 빛줄기가 원 중앙이
      아니라 부채꼴 자기 박스 중심을 축으로 돎(위 "빛줄기" 항목의 함정 참고, `transform-box:
      fill-box` → `view-box`로 수정). 둘 다 고친 뒤 헤드리스 크롬으로 여러 회전각(0/45/90/
      135/200/300도)에서 스크린샷을 찍어 부채꼴 꼭지점이 원 중앙(160,160)에 고정된 채로만
      도는 것을 확인했다.
  - ④ 아빠의 화단 ✅ 완료(2026-09-23) — 홈 슬라이드쇼는 `plugins/garden-home`(gallerySection,
    `gallery-svg.js`+`gallery-interactive.js`), 전체 그림 페이지는 새 로컬 플러그인
    `plugins/gallery-page`(컴포넌트 `GalleryGrid`, `layout.condition: gallery` —
    `quartz.ts`에 `registerCondition("gallery", slug==="gallery")` 추가, `content/gallery.md`
    에서만 나온다). 원본이 483MB라 **반드시 `/img/thumbs/<파일명>.webp` 썸네일**(긴 변 800px)을
    쓰고, 라이트박스로 크게 볼 때만 원본(`src`)을 쓴다. `content/img/thumbs/meta.json`(원본
    width/height, `gen_gallery.py`가 씀)으로 `aspect-ratio`를 미리 잡아 로딩 중 레이아웃이
    안 흔들리게 한다 — 로컬에는 이 파일이 없을 수도 있어 그때는 기본 4:3 상자 + `object-fit:
    contain`으로 안전하게(잘리지 않게) 대체한다.
    - **정렬**: `quartz/garden/collect.ts`가 `gallery.images[]`를 만들 때 이미 정렬해 둔다
      (`sortYear = gallery.yaml 의 year ?? added 의 연도`, 내림차순 — "연도가 있으면 연도순,
      없으면 git 추가일순, 최신 먼저"). 홈 슬라이드쇼(`gallery.home_count`, 기본 10)와 전체
      페이지 둘 다 이 순서를 그대로 쓴다.
    - **홈 필름스트립**(2026-09-26, 한 장짜리 크로스페이드에서 변경 — 예전엔 상자 비율을
      첫 그림 비율로 잡아서 PC 에서 세로 그림이 높이 ~1000px 로 너무 컸다): 제목 +
      `gallery.intro` 아래, 최근 `home_count`개를 가운데 한 장 + 양옆 작고 흐린 그림으로
      늘어놓는다. 트랙 높이 고정(모바일 `clamp(220px,68vw,320px)`, 801px+ 340px), 슬라이드는
      JS 가 붙이는 `--pos`(가운데로부터 칸 수, 고리처럼 이어짐)·`data-dist`(0/1/2/far)로
      CSS 가 자리·크기·투명도를 정한다(PC 는 `--slide-w` 34%라 양옆 한 장씩, 모바일 62%라
      가장자리만). `interval_seconds`마다 자동 전환 — 모션 최소화에서도 전환 자체는 켜 두고
      transform/opacity 트랜지션만 끈다(예전과 같은 판단). 옆 그림을 누르면 그 그림으로,
      가운데 그림을 누르면 **배경이 완전히 검은(#000, 사용자 요청) 라이트박스**로 원본을 크게
      보고 좌우 버튼·화살표 키·손가락으로 밀어 넘기기, Escape·배경·닫기로 닫는다(연 동안
      자동 전환 정지). 트랙도 밀어서 넘길 수 있다. 일시정지·재생은 오른쪽 위 버튼으로만.
      그림 수만큼 그린 꽃봉오리(`gallery-svg.js`의
      `bud()`/`bloom()`) 중 지금 보는 것만 활짝 핀 꽃 — 눌러서 바로 그 그림으로 이동. 화면
      밖이면(`IntersectionObserver`) 자동 전환 타이머를 멈춘다. 캡션은 제목·연도·재료·작가
      이름을 있는 것만 이어 붙이고(전부 없으면 칸 자체를 안 만듦 — 지금은 작가 이름
      `gallery.artist`("여송")가 항상 있어서 실제로는 늘 뜬다), "전체 보기" 링크로
      `content/gallery.md`로.
    - **전체 그림 페이지(격자)**: CSS `column-count`로 모바일 2열/640px+ 3열/1000px+ 4열 —
      각 항목이 자기 원본 비율대로 `aspect-ratio`를 갖고 `break-inside:avoid`라 그림마다
      비율이 달라도 안 잘리고 엇갈려 쌓인다(masonry). 흙색 두꺼운 테두리(6px, 테마 색을
      `color-mix`로), 맨 아래에 장식용 작은 꽃 화단 가장자리(`gallery-page-svg.js`의
      `renderFlowerBedFooter`, 데이터와 무관한 순수 장식). 그림을 누르면 라이트박스(원본 크기,
      `object-fit:contain`, 배경 완전 검정 #000 — 2026-09-26 사용자 요청, 홈과 같음)로 크게
      보고, 좌우 버튼·화살표 키·밀어서 넘기고, 닫기 버튼·배경 클릭·Escape 로 닫는다(연 동안
      `body` 스크롤 잠금). 라이트박스 캡션도 `<figcaption>` 이면 테마 figure 규칙 탓에 왼쪽으로
      밀려서 `<p>` 로 바꿨다(아래 함정과 같은 원인).
    - **함정**: 그림 격자 항목을 처음엔 `<figure>`로 만들었는데, 이 사이트 테마(`obsidian-theme`
      CSS 레이어)가 `html body figure { border-width: 0; ... }`를 코드 블록 캡션용으로 너무
      넓게 걸어 둬서, `.gg-item`의 `border: 6px`가 specificity 와 무관하게 항상 눌렸다(CSS
      cascade layer 는 specificity 보다 레이어 순서가 우선이라, `quartz-base` 레이어의 내
      규칙이 `obsidian-theme` 레이어의 규칙을 이길 수 없다). `<figcaption>`을 안 쓰는 항목이라
      그냥 `<div>`로 바꿔서 피했다 — **앞으로도 `<figure>` 에 테두리·배경 같은 시각 스타일을
      입혀야 하면 이 사이트 테마 탓에 안 먹을 수 있다는 걸 기억할 것.**
    - **앞으로 그림을 더 추가해도 문제없는지 점검(2026-09-23)** — `scripts/gen_gallery.py`
      에서 두 가지를 미리 손봤다: (1) 썸네일 파일명이 `src.stem`(확장자 뺀 이름)이었어서, 이름은
      같고 확장자만 다른 두 그림(`20260727.jpg`와 `20260727.png`)이 생기면 썸네일을 서로
      덮어쓸 뻔했다 — `src.name`(확장자 포함) + `.webp`로 바꿔서 안 겹치게 했다(`collect.ts`의
      `thumb:` 경로도 같이 맞춤, `.garden-cache`처럼 매 빌드 새로 만드는 값이라 기존 배포
      URL 이 깨질 일은 없다). (2) 투명 배경이 있는 그림(PNG 등)을 그냥 RGB 로 바꾸면 투명한
      자리가 검게 나왔다 — 흰 배경에 합성한 뒤 RGB 로 바꾸도록 고쳤다. 투명 PNG + 이름이 같고
      확장자만 다른 그림 2장을 실제로 만들어서 로컬에서 검증(썸네일이 안 겹치고, 투명한 자리가
      흰색으로 나옴)한 뒤 지웠다. **여전히 처리 안 되는 것**: 동영상(예전엔 `<video>` 로 넣어
      줬는데 이번 재작성으로 빠졌다 — `IMAGE_EXT`에 없는 파일은 조용히 아무 데도 안 나온다,
      아버지가 사진이 아니라 동영상을 보내면 다시 넣어야 함).
    - **검증(2026-09-23)**: 실제 101장으로 헤드리스 크롬 CDP 로 확인 — 슬라이드쇼(자동 전환,
      그림 클릭/버튼 일시정지, 좌우 넘기기 래핑, 꽃봉오리 클릭 이동, 화면 밖 정지 전부 동작),
      전체 페이지(101개 항목, 라이트박스가 항상 `/img/inspiration/...`(원본)을 씀, 좌우/
      화살표/Escape/배경클릭 전부 동작, 격자 2/3/4열 반응형, 테두리 정상). 이전 배포 커밋
      대비 **홈 `index.html` +6,639바이트, 사이트 전체 공유 스크립트 번들 +6,625바이트, 공유
      CSS 번들 +4,540바이트**(전체 그림 페이지의 라이트박스 코드도 이 공유 번들에 같이 들어가
      다른 모든 페이지가 조금씩 커진다 — §7·§8 의 다른 컴포넌트들과 같은 구조적 특징).
      슬라이드쇼가 쓰는 썸네일 10장은 총 약 1.16MB(그림마다 70~160KB) — 이게 실제 홈 페이지
      무게 증가의 대부분을 차지한다(그림 자체는 CI에서만 생기므로 로컬 diff 로는 안 보임).
- 움직임(레이더 스윕, 슬라이드)은 `afterDOMLoaded` 스크립트로. SPA라 `nav` 이벤트마다 다시 붙이고
  `window.addCleanup`으로 타이머를 정리한다. `prefers-reduced-motion` 필수(§9) — 지금 자리 표시는
  움직이는 게 없어서 해당 없음, 다음 단계에서 실제로 채울 때 지킬 것.

### 8.1 정원 데이터 수집기 ✅ (2026-09-22)

- 코드: `quartz/garden/collect.ts`(수집), `gitHistory.ts`(git 기록), `config.ts`(garden.yaml + 기본값).
  `quartz.ts`가 빌드 시작 때 `collectGardenData()`를 부르고, 실패해도 경고만 찍고 빌드는 계속한다.
  빌드 로그에 `[garden] 정원 5(grass 3, vine 1, flower 1, 시듦 0) · radar 105 · 갤러리 101 · git full` 같은 한 줄.
- 출력: `.garden-cache/garden-data.json` (gitignore됨, 빌드마다 새로 만듦). `public/`에는 아무것도 안 더한다.
  `npx quartz build --serve` 중에는 시작할 때 한 번만 만들어지므로 데이터를 바꾸면 서버를 다시 켠다.
- 설정: `garden.yaml`의 `exclude_folders`, `garden`, `plants`, `radar`, `gallery`. 빠진 항목은
  `config.ts`의 `DEFAULT_GARDEN_CONFIG`로 채운다(객체는 합치고 배열은 통째로 바꿈). 새 radar 하위 폴더는
  폴더 이름 + `radar.default.color`로 자동 처리. `quartz.config.yaml`의 `ignorePatterns`(이름 단위)와
  `draft: true` 노트, 점(.)으로 시작하는 폴더는 모두 뺀다.
- 스키마(요약):
  - `garden.notes[]`: `title, path(content 기준), slug, chars(공백 포함·줄바꿈 제외), charsNoSpaces,
    created, createdFrom(frontmatter|git|file), modified, modifiedFrom(같음), commits, edits(=commits-1),
    isQuestion, links[{target,slug}], missingLinks[target], backlinks, backlinkFrom[slug],
    frontmatterPlant, plant(kinds 키), label, plantFrom(frontmatter|rule|default), daysSinceModified,
    wilted`. created/modified 는 **frontmatter 를 먼저 본다**(2026-09-22 사용자 요청으로 우선순위를
    뒤집음 — 처음엔 git 우선이었다가 바꿨다): created 는 frontmatter `created`/`date`, modified 는
    `modified`/`dateModified`/`updated`/`lastmod`. 둘 중 하나만 있어도 그 필드만 frontmatter를 쓰고
    나머지는 git → 파일 시각 순으로 내려간다. `commits`(수정 횟수 계산용)는 frontmatter로 셀 수
    없어서 항상 git 기준이다(기록 없으면 0). 폴더의 index.md는 뺀다. 생성일 오름차순.
  - `radar.notes[]`: `subfolder, title, path, slug, date, dateFrom(frontmatter|filename|git|file), isIndex`.
    날짜는 frontmatter `date` → 파일명의 YYYY-MM-DD → git 마지막 수정 순. 형식이 날짜만/ISO로 섞여 있다.
    `radar.subfolders[]`: `name, label, color, count, latest`.
  - `gallery.images[]`: `file, src, added(git 첫 추가), addedFrom, takenAt(파일명 YYYYMMDD_HHMMSS),
    title, year, material`(같은 폴더 `gallery.yaml`이 있을 때만, 지금은 없음).
  - `config`: 컴포넌트가 쓸 `plants.kinds/default/wither_after_days`, `gallery.artist`.
- git 기록 주의:
  - `git log -M --name-status -- content` 한 번으로 읽고, 이름 변경(R)을 따라가 옛 이름의 기록도 합친다
    (scribbled/ → scribbled notes/ 폴더 이름 변경 전 커밋도 센다). 이름을 바꾸면서 내용을 많이 고치면
    git이 변경으로 못 알아보고 새 파일로 보기도 한다(예: 토끼풀).
  - 이 저장소의 커밋은 대부분 "Quartz sync" 묶음 커밋이라 **수정 횟수 = 그 노트가 포함된 동기화 횟수**다.
    Obsidian에서 고친 횟수와는 다르다. 식물 기준(수정 5·30회)은 이걸 감안해 조정할 것.
  - frontmatter 에 없는 필드만 git → 파일 시각 순으로 대신한다(§8.1 스키마 참고). git 기록이 없는
    파일(아직 커밋 안 한 새 노트)은 frontmatter → 파일 시각(`commits: 0`).
  - 배포 워크플로 checkout에 `fetch-depth: 0` 있음(§6) → CI에서도 전체 기록.
- 링크 해석은 Quartz `markdownLinkResolution: shortest`와 비슷하게: 경로가 있으면 경로(끝부분 일치),
  없으면 파일 이름(같은 폴더 우선, 그다음 가장 짧은 경로), 대소문자 무시, `./`·`../` 상대 경로,
  폴더 이름은 그 폴더 index로. 이미지 등 첨부 파일 링크·임베드와 `[[#제목]]`, 코드 블록 안 링크는 뺀다.

### 8.2 radar 이력(revision) 단위 수집 — PACM ✅ (2026-09-23)

radar 의 하위 폴더는 기본적으로 "노트 하나 = 점 하나"(§8.1)지만, PACM처럼 노트 하나가 계속
갱신되는 폴더는 "이력 하나(=변경 하나) = 점 하나"가 더 맞다. `garden.yaml`의
`radar.subfolders.<name>.granularity: revision`로 폴더별로 켠다(기본은 `note`, 안 적으면
전과 동일) — **지금은 pacm 만 켜져 있고, news·국회 기노위는 그대로 노트 단위**.

- **원본 데이터**: `tools/pacm_monitor/pacm_monitor.py`(매일 06:07 KST, `.github/workflows/pacm-monitor.yml`)가
  `content/radar/pacm/data/`에 쓰는 파일들:
  - `changelog.json` — **진짜 이력 로그**. 배열, 각 항목 `{date, event: added|removed|modified, key(="TYPE:ref"),
    record(현재 레코드), changes?(modified 일 때만, {field: {before, after}})}`. 이게 이번에 쓰는 데이터다.
  - `history/<날짜>.json` — 그날 전체 스냅숏(변경이 있었던 날만 생김). 이력이 아니라 전체 목록이라 안 씀.
  - `state.json`, `latest.json/csv` — 현재 상태·최신 스냅숏. 이력 아님.
  - 지금 실제로는 `changelog.json`에 항목이 1개뿐(2026-09-22, PA:6560 신규)이라 실제 밀집도는
    확인 못 함 — 아래 "확인" 항목처럼 가짜 changelog로 시험했다.
- **수집기**: `quartz/garden/collect.ts`의 `revisionRecordsFor(note, subfolder)` +
  `readChangelog`/`summarizeEvent`/`summarizeGroup`. radar 노트를 만들 때 그 하위 폴더의
  `granularity`가 `revision`이면 노트 옆(`path.dirname(note)/data/changelog.json`)을 읽어서,
  **노트 하나 대신 이력마다 레코드 하나**를 만든다(changelog.json이 없거나 비어 있으면 그냥
  기존 노트 단위 레코드로 대신 — 안전하게 폴백).
- **같은 날 여러 건은 한 점으로 합침**(요청사항): `changelog.json`을 노트+날짜로 묶어서, 같은
  날짜에 이력이 여러 개면 하나의 레코드로 합치고 `revision.count`/`revision.events[]`에 전부 담는다.
  제목은 `"이 날 변경 N건"`, `summary`는 신규/삭제/수정 건수 + 각 이력 한 줄씩. 날짜가 다르면
  당연히 점이 따로따로 찍힌다(합치는 건 "같은 날"일 때만).
- **레코드 모양** — 기존 `radar.notes[]`와 **같은 배열, 같은 필드**(`subfolder, title, path, slug,
  date, dateFrom, isIndex`)에 `revision` 필드만 추가된다(없으면 노트 단위, 있으면 이력 단위) —
  **5단계 radar 컴포넌트는 이 배열을 그대로 쓰면 되고, `revision` 유무로 분기할 필요도 없다**
  (나이 계산은 항상 `date`를 보면 되고, 이력 단위 레코드의 `date`는 이력 자체의 날짜라 "중심=오늘,
  가장자리=30일" 계산이 노트 날짜가 아니라 이력 날짜 기준이 된다).
  - `path`/`slug`는 항상 그 이력이 속한 노트(PACM은 하나뿐이라 전부 `radar/pacm/index`) —
    이게 "원본 노트로 가는 링크"다. 같은 노트를 가리키는 레코드가 여러 개(이력이 여러 개)일 수 있다.
  - `revision.events[]`: `{event, key, summary}`. `revision.summary`: 점에 붙일 한 줄 요약
    (added `🆕 신규 등록 — [PA 6560] Patrind Hydropower Project`, modified는 바뀐 필드를
    `before→after`로, removed는 `❌ 목록에서 삭제 — …`).
- **확인(2026-09-23)**: 실제 `changelog.json`(PA:6560 1건)으로 빌드해 레코드 1개 생성을 확인.
  진짜 밀집도를 보려고 임시로(제출 전 원본으로 되돌림) 가짜 5건(같은 날 3건 + 다른 날 2건)을
  넣어봤더니 예상대로 **레코드 3개**(9/20 합쳐진 1개 "이 날 변경 3건", 9/21 1개, 9/22 1개)로
  나왔다 — 병합이 의도대로 동작. 원본 `changelog.json`은 그대로 복원해 두었다(diff 없음).
- **다른 구역으로 확장하려면**: 그 폴더의 노트 옆에 같은 형식(`data/changelog.json`)을 만들고
  `garden.yaml`에 `granularity: revision`만 추가하면 된다 — 수집기 코드는 폴더 이름을 안 가린다.

## 9. 보존해야 할 기능

**어떻게 구현되어 있는지:**
- **듣기(TTS)**: `quartz/components/Head.tsx`의 `<script defer data-persist="true">` 두 줄 →
  `quartz/static/tts/tts-core.js`, `tts-site.js`(Web Speech API). 모든 페이지 `<head>`에 전역으로
  박혀 있다 — 특정 컴포넌트가 아니라 페이지 프레임 자체에 있어서 노트별로 끄는 옵션이 없다.
  `data-persist`가 없으면 Quartz SPA가 페이지 이동 때 head에서 지워버린다(Head.tsx 자체 주석에도
  적혀 있음). 원본은 vault `Scripts/Text2Speech/howdareryu built in/` (→ `project_text2speech`).
- **댓글**: 로컬 컴포넌트 플러그인 `./plugins/hdr-comments` (`quartz.config.yaml`에
  `layout: { position: afterBody, priority: 10 }`로 전체 페이지에 기본 적용). 백엔드는 Cloudflare
  Worker + D1(→ `project_hdr_comments`). 소스 `plugins/hdr-comments/src/component.js` 확인 결과
  **`fileData.slug`(= 페이지 URL 슬러그)를 키로 서버에 연결**되고, `fileData.frontmatter?.comments === false`로
  노트별로 끌 수 있고, `options.exclude`(슬러그 접두사 배열)로 경로 전체를 뺄 수 있다.
  `layout.byPageType`에서 `folder`/`tag` 페이지 타입은 이미 `hdr-comments`(와 `reader-mode`)가
  제외되어 있다.

**지켜야 할 것:**
- 듣기 기능과 댓글 기능은 모든 노트 페이지에서 지금과 똑같이 동작해야 한다. `Head.tsx`의 TTS 두 줄,
  `hdr-comments`의 기본 `layout`/`byPageType` 설정을 정원 작업 때문에 바꾸지 않는다.
- 댓글은 페이지 **주소(슬러그)** 기준으로 서버에 연결되어 있으므로, **노트·폴더의 파일 이름과 URL을
  절대 바꾸지 않는다.** 표시 이름을 바꿔야 하면 탐색기(`mapFn`/`displayName`)나 CSS(`::before`)에서만
  하고, 실제 파일 경로·slug는 그대로 둔다.
- **홈 화면에서 듣기·댓글·Properties(노트 상단 속성 표) 표시 여부는 작업 전에 반드시 사용자에게
  먼저 물어본다.** → 2026-09-22 결정 및 구현 완료: **셋 다 홈에서만 숨김**, 다른 모든 노트
  페이지는 그대로.
  - 듣기(TTS): `Head.tsx`에서 `fileData.slug !== "index"` 조건으로 스크립트 두 줄을 감쌌다.
  - 댓글: `hdr-comments` 옵션 `exclude: [index]`.
  - Properties: `content/index.md` frontmatter에 `quartz-properties: false`(기존에 지원되던
    노트별 끄기 기능을 그대로 씀 — 코드 변경 없음).
- **이번 작업 범위 밖의 컴포넌트는 건드리지 않는다.** 탐색기·홈 전용 컴포넌트·Properties 표시 이름
  작업을 하면서 그래프·검색·백링크·태그 페이지·footer 같은 다른 컴포넌트의 설정을 같이 고치지 않는다.
- **색은 하드코딩하지 않고 현재 테마(hackthebox)의 CSS 변수를 쓴다.** `quartz.config.yaml`의
  `configuration.theme.colors`에 정의된 `--light`, `--dark`, `--secondary`, `--tertiary`, `--gray`,
  `--lightgray`, `--darkgray`, `--highlight`, `--textHighlight` 등을 그대로 쓰면 라이트/다크 모드가
  둘 다 자동으로 맞는다. 반투명이 필요하면 `color-mix(in srgb, var(--secondary) N%, transparent)`처럼
  변수에서 만든다(`--highlight`/`--textHighlight` 자체가 이미 불투명 형광색으로 덮여 있어서 배경으로는
  못 쓴다 — §4의 함정 참고). 새 스타일시트를 만들 때도 `@use "./variables.scss" as *`로 같은 변수를
  가져와 쓴다.
- **움직이는 요소는 모두 `prefers-reduced-motion`을 존중한다.** 레이더 스윕, 슬라이드쇼 전환, 식물이
  자라는 애니메이션 등 새로 만드는 모든 모션에 `@media (prefers-reduced-motion: reduce)`로 정지된
  대체 표현(트랜지션 없이 바로 최종 상태, 또는 자동 재생 없이 클릭으로만 넘김)을 같이 만든다.
  기존 탐색기 폴더 펼침 애니메이션(`transition: transform .3s`)은 이번 작업 범위 밖이라 그대로 둔다.

## 10. 단계별 구현 계획

- [ ] **0. 남은 결정** — 식물 판정 기준 조정(수정 횟수가 "Quartz sync 묶음 커밋" 기준이라
      너무 쉽게 채워짐, §8.1 참고) / 레이더 점 좌표 규칙(최근 며칠? 폴더별 방향?).
      (Properties 한글 이름·gallery.md 덮어쓰기 문제는 §7·§8/§6 에서 해결됨.)
- [x] **1. 탐색기** — 완료·배포(§5, 커밋 e048a83c). 제목 "오솔길", garden.yaml `explorer` → mapFn
      (폴더 🪴, radar 폴더·하위 폴더 📡, radar 노트 📍, 비공개 아카이브 🔒).
- [x] **1.5 정원 데이터 수집기** — 완료·배포(§8.1, 커밋 47faf0ae). `.garden-cache/garden-data.json`,
      사이트 출력 변화 없음. created/modified는 frontmatter 우선.
- [x] **2. Properties 표시 이름** — 완료·배포(§7, 커밋 `9797f9e9`). `garden.yaml`의 `properties`
      매핑 + `quartz/static/garden-properties.js`(nav마다 재적용) + 빌드 시점 생성·커밋되는
      `garden-properties-data.js`. scribbled notes 전용 식물/뿌리/씨앗 칸, radar 전용 수신일.
- [x] **3. 홈 5구역 재구성 + garden-home 뼈대** — 완료·배포. index.md는 소개 3줄만 남기고
      `plugins/garden-home`이 ②③④⑤를 그린다. 홈 듣기·댓글·Properties는 숨김(§9).
- [x] **4. 구역 채우기 — ② 정원** — 모양+상호작용+움직임 완료·배포(§8, 커밋 `7d4cc1d3`),
      `home.garden: true`.
- [x] **4. 구역 채우기 — ③ radar** — 완료·배포(§8, 커밋 `dc8f0869`), `home.radar: true`.
- [x] **4. 구역 채우기 — ④ 아빠의 화단** — 완료(§8), 아직 push 안 함. 홈 슬라이드쇼 +
      전체 그림 페이지(`plugins/gallery-page`, 신규). `home.gallery`를 **true**로 켬
      (사용자 지시, 2026-09-23). **홈 5구역(①~⑤) 전부 완성.**
- [ ] **5. 확인·배포** — 다음 작업분도 `npx quartz build`로 로컬 확인 → 이전 배포본과 `public/`
      비교(§8 방식) → diff 검토(비밀값 없는지) → 사용자 확인 후 `v5`에 push → Actions 배포 확인.

## 11. garden.yaml 전체 참고 (2026-09-23)

`garden.yaml` 자체에도 각 항목 위에 같은 설명이 주석으로 있다 — 여기는 한눈에 보는 색인.
전부 없어도(파일 자체가 없어도) `quartz/garden/config.ts` 의 `DEFAULT_GARDEN_CONFIG` 로 동작한다
(객체는 깊이 합치고 배열은 통째로 바꾼다, §8.1). 어디서 읽는지도 같이 적는다.

| 키 | 뜻 | 기본값 | 읽는 곳 |
|---|---|---|---|
| `explorer.title` | 오솔길(탐색기) 제목 | `"탐색기"` | `syncExplorerFromGarden.ts` → `quartz.config.yaml` |
| `explorer.folder_icon` | 매핑에 없는 폴더의 기본 아이콘 | (없음) | 〃 |
| `explorer.folders.<이름>` | 그 이름의 폴더(+하위 전부)에 붙는 아이콘 | `{}` | 〃 |
| `explorer.items.<이름>` | 그 최상위 폴더/파일 아래 노트 제목에 붙는 아이콘 | `{}` | 〃 |
| `explorer.plants.<종류\|wilted>` | scribbled notes 노트 앞 식물 이모지(§5) — **판정은 `.garden-cache/garden-data.json` 그대로 사용, 여기서 다시 안 함** | `{}` | 〃 |
| `properties.table_title` | 노트 상단 Properties 표 제목(§7) | `"Properties"` | `syncPropertiesFromGarden.ts` → `garden-properties-data.js` |
| `properties.labels.<frontmatter 키>` | 그 키의 표시 이름(모든 노트 공통) | `{}` | 〃 |
| `properties.radar_overrides.<키>` | radar 노트에서만 `labels` 를 덮어씀 | `{}` | 〃 |
| `properties.scribbled_extra.{plant,roots,seeds}` | scribbled notes 전용 3칸의 표시 이름 | `식물`/`뿌리`/`씨앗` | 〃 |
| `home.garden` / `home.radar` / `home.gallery` | 홈 ②③④ 구역 켜고 끄기(⑤는 항상 나옴, §8) | 전부 `false` | `syncGardenHomeFromGarden.ts` → `garden-home` 플러그인 options |
| `exclude_folders` | 이 이름의 폴더는 어디 있든 정원 데이터에서 제외 | `[img, data]` | `collect.ts` (전체) |
| `garden.folder` | 정원(식물)으로 자랄 노트가 있는 폴더(content/ 기준, index.md 는 뺀다) | `"scribbled notes"` | `collect.ts` |
| `plants.frontmatter_key` | frontmatter 에서 식물 종류를 직접 지정하는 키 | `"plant"` | `collect.ts`(`decidePlant`) |
| `plants.kinds.<grass\|flower\|vine\|tree>` | 종류 코드 → 한글 이름(정원 그림 범례·씨앗/캡션 등에도 씀) | `{grass:풀, flower:꽃, vine:덩굴, tree:나무}` | `collect.ts`, `garden-svg.js`, `gallery-svg.js`(뿌리/식물 칸) |
| `plants.question_endings` | 제목이 이 목록 중 하나로 끝나면 "질문형" | `["?","？","왜","어떻게"]` | `collect.ts`(`isQuestionTitle`) |
| `plants.rules[].{plant, any[]}` | 위에서부터 순서대로 검사, 처음 맞는 규칙의 식물이 됨(frontmatter `plant` 값이 있으면 규칙보다 우선) | 3개 규칙(vine/tree/flower) | `collect.ts`(`decidePlant`) |
| `plants.default` | 어떤 규칙에도 안 맞을 때의 식물 | `"grass"` | 〃 |
| `plants.wither_after_days` | 마지막 수정 후 이 날수가 지나면 시든 것으로 봄 | `90` | `collect.ts` |
| `radar.folder` | radar 데이터가 있는 폴더(content/ 기준) | `"radar"` | `collect.ts` |
| `radar.default.color` | 하위 폴더에 색을 안 정했을 때 쓰는 기본 색(테마 CSS 변수) | `var(--secondary)` | 〃 |
| `radar.subfolders.<이름>.label` | 그 하위 폴더의 표시 이름(radar 원 구역 이름, §8) | 폴더 이름 그대로 | 〃 |
| `radar.subfolders.<이름>.color` | 그 하위 폴더의 점·구역 이름 색(테마 CSS 변수) | `radar.default.color` | 〃 |
| `radar.subfolders.<이름>.granularity` | `"note"`(노트 하나=점 하나, 기본) 또는 `"revision"`(그 노트 옆 `data/changelog.json` 의 이력 하나하나=점 하나, §8.2 — 같은 날 여러 건은 하나로 합침) | `"note"` | 〃 |
| `gallery.folder` | 아빠의 화단 원본 그림이 있는 폴더(content/ 기준) | `"img/inspiration"` | `collect.ts` |
| `gallery.artist` | 작가 이름(캡션에 붙음, §8) | `""` | 〃 |
| `gallery.meta_file` | 그 폴더 안에서 그림별 제목·연도·재료를 읽을 YAML 파일 이름 | `"gallery.yaml"` | 〃 |
| `gallery.intro` | 홈 "아빠의 화단" 슬라이드쇼 제목 아래 한 줄 소개 | `""` | 〃 → `gallerySection()` |
| `gallery.home_count` | 홈 슬라이드쇼에 보여줄 최근 그림 수 | `10` | 〃 |
| `gallery.interval_seconds` | 홈 슬라이드쇼 자동 전환 간격(초) — **radar 의 `SWEEP_DURATION_S`(CSS 애니메이션 시간과 미리 맞춰야 해서 코드에 고정된 상수)와 달리, 이 값은 매번 JS 로 그대로 넘어가므로 CSS 를 안 고쳐도 바로 반영된다** | `4` | 〃 → `gallery-interactive.js` |

**정렬·표시가 "이미 계산돼 들어있는" 값들**(garden.yaml 에 설정이 없다): `garden.notes[]`는 생성일
오름차순, `radar.notes[]`는 날짜 내림차순, `gallery.images[]`는 연도(있으면) 또는 git 추가일
내림차순(§8) — 전부 `collect.ts` 가 `.garden-cache/garden-data.json` 에 쓸 때 이미 정렬해 둔다.

## 12. 전체 점검 (2026-09-23, 홈 5구역 완성 직후)

`v5` 최신 배포 커밋 `a9a9e0ec`(홈 5구역 전부 켜진 상태)를 실제 `https://howdareryu.com`과
헤드리스 크롬으로 점검. 발견한 건 전부 그 자리에서 고침(다음 배포에 포함).

- **다크/라이트 × 모바일/데스크톱**: 4가지 조합 모두 스크린샷 확인. hackthebox 테마가
  다크 전용이라(§4) 라이트는 다크와 완전히 같다 — 의도된 동작, 버그 아님. 모바일 420px·
  데스크톱 1400px 둘 다 다섯 구역이 깨지지 않고 순서대로 나옴.
- **TTS·댓글**: 실제 배포본에서 `scribbled-notes/2026-09-20-ai` 확인 — TTS 스크립트 2개
  그대로, `hdr-comments` 위젯이 그 노트의 기존 댓글(`id:4, "Test", 2026-09-22`)을 정상적으로
  불러옴("댓글 1"로 표시). **로컬(`localhost`)에서는 Worker CORS 때문에 "댓글을 불러오지
  못했습니다"로 보인다 — 로컬 검증 시 착각하지 않도록 기록.** 홈에서는 여전히 TTS·댓글·
  Properties 전부 숨겨짐(§9 그대로).
- **오솔길 ↔ 정원 판정 일치**: 실제 배포본에서 정원 그림의 5개 식물(class `gp-kind-*`/
  `is-wilted`)과 오솔길에 뜨는 이모지를 전부 대조 — 5개 전부 일치(AI 🌼, 토끼풀/노동의 우울과
  자율성의 훼손/오빠가 냉장고를 사줬다 🌱, 그 목소리는 왜 🌿). §5 에서 설계한 "같은 데이터를
  쓴다"가 실제로도 어긋나지 않음을 재확인.
- **스크린리더 설명 — 함정 발견·수정**: 정원/radar/아빠의 화단 SVG 는 `aria-label`이
  개수만 말했다("이랑 1 — 식물 5개", "radar — 최근 30일 기록 8개") — 이 구역이 **무엇을**
  보여주는지는 안 읽어 줬다. `garden-home/src/component.js`·`gallery-page/src/component.js`
  의 각 `<h3>` 바로 뒤에 `.sr-only`(화면엔 안 보이고 스크린리더만 읽는) 문단을 추가해서
  정원(식물=노트, 종류·시듦의 뜻), radar(구역=폴더, 거리=나이), 슬라이드쇼/전체 그림 페이지
  (넘기는 방법·크게 보기)를 설명한다. `.sr-only` 유틸리티 클래스를 `garden-home.css`/
  `gallery-page.css` 양�지에 추가(각자 번들이라 공유 안 됨).
- **`prefers-reduced-motion`**: 헤드리스 크롬 에뮬레이션으로 다섯 개(정원 흔들림, 정원
  타임랩스 전환, radar 빛줄기, radar 반짝임, 갤러리 크로스페이드)를 전부 확인 —
  `getComputedStyle().animationName`이 다섯 다 `"none"`, 전환(transition)도 `opacity`가
  전혀 안 잡힘(남는 `transition: color 0.2s`는 링크 기본 스타일이라 무관). 정원 타임랩스와
  갤러리 자동 전환은 **기능 자체는 그대로 동작**함도 같이 확인(디자인대로 — 화면이 갑자기
  훅 움직이는 게 아니라 콘텐츠가 순간적으로 바뀌는 것뿐이라 모션 최소화 대상이 아니라고 판단,
  §8 정원/아빠의 화단 항목 참고).
- **빌드 시간·홈 페이지 용량**: 로컬 클린 빌드(117개 파일) `time npx quartz build` 로
  **약 37.5초**(CI는 `gen_gallery.py`가 그림 101장을 처리하는 시간이 따로 더 붙는다, §6).
  홈 페이지(`index.html` + 공유 코어 CSS/JS + 컴포넌트 CSS/JS, 이미지 제외) 총합 **약
  323KB**(`index.html` 49,165B + `prescript` 1,664B + 코어 CSS 25,289B + `postscript` 900B +
  컴포넌트 스크립트 185,251B + 컴포넌트 CSS 60,577B) + 슬라이드쇼가 실제로 불러오는 썸네일
  10장 **약 1.16MB** = 첫 방문 실질 총량 **약 1.5MB**.
- **사용하지 않는 코드**: Explore 서브에이전트로 `quartz/garden/*.ts`·`plugins/garden-home/
  src/*`·`plugins/gallery-page/src/*`·`quartz/static/garden-properties*.js`를 훑음 — 죽은
  함수·CSS 선택자·미사용 import 는 없음(모든 헬퍼가 concatenate 된 번들 안에서 실제로 호출됨,
  `placeholder()`도 정원/radar/갤러리 각각의 "아직 없음" 상태로 여전히 쓰임). **딱 하나 발견**:
  `plugins/gallery-page/src/component.js`의 "아직 올린 그림이 없어요" 빈 상태가
  `garden-home`에만 있는 `.garden-home-note` 클래스를 썼는데 그 CSS는 gallery-page 번들에
  안 들어간다(서로 다른 플러그인이라 CSS 를 공유 안 함) — 이미지가 101장이라 실제로 이 경로를
  탈 일은 없었지만, `.gallery-page-note`를 새로 만들어 고쳤다.
- **찾았지만 정원 작업 범위 밖 — 사용자에게 별도 확인 필요**: `content/pacm/`(제목
  "PACM_radar")가 `a64a7ad3` 커밋(2026-09-23, pacm-monitor 자동 커밋)으로 새로 생겼다.
  `.github/workflows/pacm-monitor.yml`은 여전히 `content/radar/pacm`을 대상으로 하는데
  (`--page`/`--data-dir` 그대로), 실제로는 `content/pacm/`에 새 파일이 생겼다 — `tools/
  pacm_monitor/pacm_monitor.py` 쪽에서 뭔가 달라진 것으로 보이나, 이 도구는 §6 규칙("다른
  워크플로는 정원 작업에서 안 건드림")대로 이 세션에서 조사·수정하지 않았다. 부작용 2개:
  (1) 오솔길에 "PACM_radar"라는 새 최상위 폴더가 생겨 방문자가 볼 수 있다(폴더라 기본 🪴
  아이콘, 버그는 아니고 그냥 새 콘텐츠). (2) **`content/radar/pacm/`(§8.2 radar PACM 구역이
  읽는 진짜 경로)가 2026-09-22 자로 멈춰 있어서, 새 위치에 계속 쓰인다면 radar 의 PACM
  점이 점점 낡은 데이터를 보여주게 된다.** 다음에 pacm_monitor 를 만질 때(또는 사용자가
  확인해 줄 때) 짚어볼 것.

## 13. 다국어(한/영) — quartz-multilanguage + 번역 pre-commit 훅 (2026-09-23)

계획서: https://claude.ai/artifact/3x973zhj91rmq7XnszFPbp (범위 결정·대안 비교). 요약:

- **번역본은 원본 옆 `노트.en.md`**(파일 이름 접미사). 한국어가 기본 언어라 기존 slug·URL·댓글은
  그대로이고, 영문본은 `…/노트.en` 주소가 된다. **번역 대상은 frontmatter `translate: true`**인
  노트 + 홈(`content/index.md`, 플래그 없이 항상). `content/radar/**`는 훅이 건너뛴다.
- **플러그인**: `github:boxi-os/quartz-multilanguage`(lock 커밋 `7da4665`), `quartz.config.yaml`
  crawl-links 다음. `detection: [suffix]`, `linking: [path]`, `seo.hreflang/ogLocale`,
  스위처 `style: links`·`showCurrent: false`·`missing: disabled`(번역 없으면 흐린 알약),
  `beforeBody` priority 12(제목 10 ↔ 속성 표 15 사이). 페이지마다 `<html lang>`(emitter 가 빌드
  후 고쳐 씀), `og:locale(:alternate)`, hreflang en/ko/x-default(transformer 의 `additionalHead`)
  가 자동으로 들어간다.
- **스위처 모양**: `custom.scss` 끝. '듣기' 버튼(`tts-site.js`의 `.ryu-tts-inline`, 런타임 `<style>`)
  값을 그대로 옮겼고 두 요소를 `inline-flex`로 한 줄에 둔다 — **tts-site.js 의 버튼 스타일을
  바꾸면 custom.scss 도 같이.** 헤드리스 크롬으로 계산된 스타일(폰트·크기·padding·radius·테두리·
  배경·글자색)이 같음을 확인. 플러그인 기본 드롭다운 CSS 는 §4 함정 두 개(`--lightgray` 테두리,
  `--highlight` 배경)에 다 걸려서 안 쓴다.
- **정원 데이터**: `collect.ts`가 `quartz.config.yaml`의 multilanguage `languages`에서 기본 언어가
  아닌 코드를 읽어 `*.en.md`를 노트 목록에서 뺀다(식물·링크 그래프 중복 방지 — 언어 목록은 거기
  한 곳).
- **오솔길**: explorer `filterFn`(손으로 쓴 부분, 마커 밖)으로 `.en` 노드를 숨긴다(기본 필터의
  `tags` 제외도 같이 옮김). 영문본은 스위처로만 오간다. **검색·그래프·백링크·최근 업데이트에는
  영문본이 그대로 보인다**(§9 "범위 밖 컴포넌트는 안 건드림" — 필요하면 따로 결정).
- **속성 표**: note-properties `excludedProperties: [translate]`.
- **댓글 공유**: 댓글 키는 `fileData.slug`가 아니라 **브라우저 주소(pathname)**다(`comments.client.js`
  `pageKey()`, Worker `normalizePage()`와 같은 규칙 — §9 설명보다 정확한 사실). 번역본일 때만
  서버 컴포넌트가 `data-page="/<baseSlug>"`(플러그인이 넣어 주는 `fileData.multilanguage.baseSlug`)
  를 심고, 클라이언트는 그 값이 있으면 키로 쓴다. 한국어 페이지는 `data-page`가 없어 예전과 똑같다.
  `exclude` 도 baseSlug 로 맞춰서 `index.en`에도 댓글이 없다.
- **홈 영문본**: `registerCondition("index")`가 slug 정확 일치라 `index.en`에는 ②~⑤(garden-home)가
  안 나온다 — 의도된 기본값(홈 UI 문자열 다국어화는 별도 프로젝트, 그때 조건도 같이 바꾼다).
- **번역 훅**: `.husky/pre-commit` → `scripts/translate/pre-commit.mjs`(+ `prompt.md` 문체·마크다운
  규칙, `glossary.yaml` UNFCCC 표기 — 둘 다 고치면 다음 번역부터 반영). 스테이징된 **내용**
  (`git show :경로`)을 `claude -p --model claude-opus-5-5 --tools ""`로 통째 번역(매번 전체 재번역),
  frontmatter 는 원본 값을 쓰고 `title`/`description`만 번역값, `translate`·`aliases`는 뺀다
  (aliases 는 옛 주소 리다이렉트라 복사하면 충돌). 전부 성공한 뒤에만 쓰고 `git add` — 하나라도
  실패하면 아무것도 안 쓰고 exit 1. `CI` 환경이면 건너뜀. 급하면 `git commit --no-verify`.
  글 하나 약 15~20초.
- **함정들(이번에 밟음)**:
  - `npx quartz plugin add`는 설치 후 **`quartz.config.yaml`을 `YAML.stringify`로 통째로 다시 써서
    주석 30줄과 garden.yaml 마커를 전부 지운다**(`quartz/cli/plugin-data.js`). 반드시 백업 →
    add → 백업으로 복원 → 블록은 손으로 추가.
  - `.quartz/plugins/timeline-pin`(지워진 `plugins/timeline-pin`을 가리키던 끊어진 심볼릭 링크)
    때문에 `plugin add`가 lock 을 쓰기 직전에 ENOENT 로 죽었다 → scratchpad 로 옮겨 해결.
    첫 시도에서 받아진 폴더가 남아 있으면 "already exists"로 lock 에 안 들어가니 지우고 다시.
  - nvm 의 `claude` CLI 2.1.215 는 `claude-opus-5-5`를 거부했다(2.1.280 이상 필요) → `claude update`.
    훅은 node·claude 를 못 찾으면 `~/.nvm/nvm.sh`를 불러온다(GUI 커밋 대비).
  - `claude -p --bare`는 API 키 전용이라 못 쓴다. 저장소 CLAUDE.md 를 번역 맥락에 안 넣으려고
    임시 폴더를 cwd 로 실행한다.
  - `npx quartz sync`는 커밋 실패를 확인하지 않고 push 로 넘어가 "Done!"을 찍는다 — 번역이
    실패하면 새 변경은 안 올라갔는데 끝난 것처럼 보인다(빨간 `[translate] 실패` 줄을 볼 것).
- **검증(로컬)**: 임시 git 저장소에서 훅 시험(실패 시 파일 0개·exit 1, 플래그 없는 커밋 0.5초 통과,
  플래그 노트 수정 커밋에 영문본 포함, radar 제외, 원본 무변경). 실제 번역본 2개(AI, 홈)를 임시로
  넣고 빌드 → 헤드리스 크롬(CDP)으로 스위처 양방향 이동·`html lang` 전환·hreflang 3개·오솔길 중복
  없음·영문본 댓글 요청 `page=/scribbled-notes/2026-09-20-ai`·모바일 390px 가로 넘침 없음 확인 후
  번역본은 뺐다. 정원은 번역본이 있어도 5개 그대로.

## 참고 메모

- `project_hdr_comments` — 로컬 플러그인 패턴, lock 규칙, 댓글 백엔드.
- `project_text2speech` — TTS 원본과 배포, hackthebox 색 함정.
- `feedback_diff_before_deploy_secrets` — push 전 diff 확인.
- `feedback_no_destructive_bugfix_deletes` — 지우는 작업은 먼저 확인.

## 다음 계획

- histography.io를 참고한 기후 관련 사건 연표 페이지 (별도 신규 기능, 지금 단계에 포함하지 않음)
- 데이터 후보: radar의 PACM 이력, 국회 기노위 기록, scribbled notes에 날짜가 있는 사건
- 10단계(마무리 점검)까지 마친 뒤 별도로 진행 예정
코드는 건드리지 마.