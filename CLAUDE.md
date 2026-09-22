# howdareryu.com — "정원" 리디자인 작업 노트

이 저장소(Quartz v5, 브랜치 `v5`, GitHub Pages 배포, https://howdareryu.com)를 "정원" 콘셉트로
바꾸는 작업의 기준 문서. **모든 작업 전에 이 파일부터 읽는다.** 조사일: 2026-09-22.

## 0. 현재 상태 (먼저 확인)

- **탐색기 아이콘·제목 완료·배포됨(§5, 커밋 e048a83c).** `garden.yaml`의 `explorer`를
  `quartz.ts`가 빌드 시작 시 읽어 `quartz.config.yaml`의 explorer `options`(마커 구간)를 다시 쓴다.
  폴더 기본 🪴, radar 폴더와 그 하위 폴더 전부 📡, radar 안 노트 📍, 비공개 아카이브 🔒(중복 방지).
- **정원 데이터 수집기 완료(§8.1), 아직 커밋 안 함.** 빌드 때 `.garden-cache/garden-data.json`을
  만든다. 사이트 출력은 바뀌지 않는다(빌드 결과를 커밋 전 상태와 비교해 확인 — sitemap/RSS의
  빌드 시각만 다름).
- 홈 전용 컴포넌트(§8) 자체는 아직 착수 전.

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
| 커스텀 조건(`index`) 등록, 빌드 전 훅 | `quartz.ts` |
| 전역 CSS 덮어쓰기 | `quartz/styles/custom.scss` |
| `<head>` (TTS 스크립트 포함) | `quartz/components/Head.tsx` |
| 로컬 플러그인 | `plugins/<name>/` (예: `plugins/hdr-comments`) |
| 정원 설정 | `garden.yaml` (탐색기 §5, 홈 데이터 §8.1) — 모든 정원 설정은 여기에 |
| 정원 코드 | `quartz/garden/` (탐색기 sync, 데이터 수집기) |

- **테마**: `quartz-themes`(saberzero1) 플러그인, `options.theme: hackthebox`. 배포 워크플로도
  `THEME_NAME: hackthebox`로 테마를 받아온다. 다크 모드 전용(빌드 로그에 경고가 뜨는 게 정상).
  테마 파일은 Obsidian 테마를 옮긴 CSS 묶음(`.quartz/plugins/quartz-themes/src/themes/hackthebox.json`,
  청크별: explorer, callouts, properties …). 탐색기 아이콘은 넣지 않는다.
  **함정:** `--highlight`/`--textHighlight`가 불투명 형광 연두 → 커스텀 UI 배경으로 쓰지 말 것.
  반투명 색은 `color-mix(in srgb, var(--secondary) N%, transparent)`로 직접 만든다.
  `custom.scss`에서 `strong`을 `#9fef00`으로 칠하고 있다.
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
  깊이 무관) 4개로 관리. 지금 값: title `오솔길`, folder_icon `🪴`, folders `{radar: 📡}`,
  items `{radar: 📍, archive: 🔒}`.
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
  scribbled notes 노트들은 아직 아무 아이콘도 안 붙음(§8에서 식물 이모지로 다룰 예정, 이번엔 범위 밖).
- **한 번 CSS(`::before`, `quartz/styles/custom.scss`) 방식으로 바꿔본 적이 있다.** 표시 이름·정렬에
  전혀 영향이 없어서 이론적으론 더 안전하지만, `folders`처럼 폴더별 예외까지 `garden.yaml` 하나로
  관리하려면 CSS 셀렉터를 매번 손으로 추가해야 해서 "설정에 없는 새 폴더는 자동으로 기본 아이콘"이
  안 됐다 → 다시 지금의 mapFn/garden.yaml 방식으로 되돌렸다. CSS 규칙은 `custom.scss`에서
  전부 제거했다(더 필요해지면 폴더 컨테이너의 `data-folderpath`, 파일은 `a[href^="/prefix/"]`
  셀렉터를 쓸 수 있다는 건 기록해 둔다).

## 6. 배포 워크플로 (`.github/workflows/deploy.yml`)

- 트리거: `v5`에 push, `workflow_dispatch`(pacm-monitor가 호출).
- 단계: `actions/checkout@v6` → Node 24 → `npm ci` → `npx quartz plugin install` → hackthebox 테마 받기
  → Python 3.12 + Pillow → `python scripts/gen_gallery.py` → `npx quartz build` → Pages 업로드·배포.
- **checkout에 `fetch-depth: 0` 있음 (확인함).** git 기록으로 수정일을 읽을 수 있다.
  `created-modified-date` 플러그인이 `priority: [frontmatter, git, filesystem]`, `defaultDateType: modified`로 켜져 있다.
- **`gen_gallery.py` 주의:** CI에서만 돌면서
  - `content/img/thumbs/*.webp`(긴 변 800px 썸네일)를 만든다 — 저장소엔 없고 CI 빌드에만 있다.
  - `content/gallery.md`를 **통째로 다시 쓴다**. 커밋된 파일의 소개글("저의 아버지 여송…")이 배포본에서는
    "총 N장."으로 바뀐다. 의도한 건지 확인이 필요하다.
  - 로컬에서 돌리면 gallery.md가 바뀌고 썸네일이 생긴다(커밋하지 않게 주의).
- 다른 워크플로(`news-clipping.yml`, `pacm-monitor.yml` 등)는 정원 작업에서 건드리지 않는다.

## 7. 노트 상단 Properties 표 — 표시 이름

플러그인 `github:quartz-community/note-properties` (`includeAll: true`, beforeBody).

- 옵션은 `includeAll`, `includedProperties`, `excludedProperties`, `hidePropertiesView`, `delimiters`, `language`뿐이다.
  **키 이름을 바꾸는 옵션은 없다.** 표의 왼쪽 칸은 frontmatter 키를 그대로 출력한다(`title`, `created`,
  `aliases`, `tags`, `publish`, `modified` …).
- 표 제목 "Properties"는 플러그인 i18n에서 오는데 **en-US만 있다** → locale이 ko-KR이어도 "Properties".
- 노트별로 표 보이기/숨기기: frontmatter `quartz-properties: false`, 접기: `quartz-properties-collapse: true`.
- 키 칸 `<td class="note-properties-key">`에는 키를 구분하는 속성이 없어서 CSS만으로는 특정 키 이름을 바꿀 수 없다.
- **권장**: 작은 클라이언트 스크립트로 `.note-properties-key` 텍스트와 `.note-properties-title`을 매핑표대로 바꾼다.
  매핑은 `garden.yaml`에 둔다(예: `properties.labels: { created: 심은 날, modified: 마지막 손질 }`).
  SPA 이동 때마다 다시 적용해야 하므로 `nav` 이벤트에 건다. 원래 키(`title` 등)는 그대로라 다른 기능은 영향 없음.
  대안으로 `excludedProperties`로 빼고 싶은 키(`aliases`, `publish` 등)는 옵션만으로 숨길 수 있다.

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
  - ② 정원 ✅ 모양 완료(2026-09-22, 움직임 없음) — `plugins/garden-home/src/garden-svg.js`.
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
    - `garden.yaml`의 `home.garden`은 커밋할 때 **false**(로컬 확인할 때만 켠다).
  - ③ radar: `radar.notes`(날짜 내림차순) + `radar.subfolders`(표시 이름·색).
  - ④ 아빠의 화단: `gallery.images`. 원본이 483MB라 **반드시 `/img/thumbs/<파일명>.webp` 썸네일**을
    쓴다(CI에서 gen_gallery가 먼저 만든다). 클릭하면 원본(`src`)이나 gallery 페이지로.
    로컬에는 썸네일이 없으니 로컬 확인용 대체 경로(원본 또는 gen_gallery.py 로컬 실행)가 필요하다.
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
      너무 쉽게 채워짐, §8.1 참고) / 레이더 점 좌표 규칙(최근 며칠? 폴더별 방향?) /
      Properties 한글 이름 목록(§7, 아직 미착수) / gallery.md 소개글이 CI에서 덮어써지는 문제.
- [x] **1. 탐색기** — 완료·배포(§5, 커밋 e048a83c). 제목 "오솔길", garden.yaml `explorer` → mapFn
      (폴더 🪴, radar 폴더·하위 폴더 📡, radar 노트 📍, 비공개 아카이브 🔒).
- [x] **1.5 정원 데이터 수집기** — 완료·배포(§8.1, 커밋 47faf0ae). `.garden-cache/garden-data.json`,
      사이트 출력 변화 없음. created/modified는 frontmatter 우선.
- [ ] **2. Properties 표시 이름** — `garden.yaml`의 매핑 + nav마다 적용되는 작은 스크립트. 아직 미착수.
- [x] **3. 홈 5구역 재구성 + garden-home 뼈대** — 완료(§8), 아직 push 안 함. index.md는 소개
      3줄만 남기고 `plugins/garden-home`이 ②③④(자리 표시, 기본 꺼짐)⑤(항상 켜짐)를 그린다.
      홈 듣기·댓글·Properties는 숨김(§9). 다른 페이지 `<body>` 무변화 확인함.
- [~] **4. 구역 채우기** — ⑤ 연락처 완료, ② 정원 모양 완료(움직임 없음, §8, 기본 꺼짐).
      남은 것: ② 정원 움직임, ④ 아빠의 화단, ③ radar.
      ⑤는 이미 완성(고정 링크라 더 할 일 없음) — 사실상 ④부터.
- [ ] **5. 확인·배포** — 다음 작업분도 `npx quartz build`로 로컬 확인 → 이전 배포본과 `public/`
      비교(§8 방식) → diff 검토(비밀값 없는지) → 사용자 확인 후 `v5`에 push → Actions 배포 확인.

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