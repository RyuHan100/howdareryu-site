# howdareryu.com — "정원" 리디자인 작업 노트

이 저장소(Quartz v5, 브랜치 `v5`, GitHub Pages 배포, https://howdareryu.com)를 "정원" 콘셉트로
바꾸는 작업의 기준 문서. **모든 작업 전에 이 파일부터 읽는다.** 조사일: 2026-09-22.

## 0. 현재 상태 (먼저 확인)

- **탐색기 아이콘·제목은 완료했다(§5), 아직 커밋·push는 안 했다.** `garden.yaml`을 만들고,
  `quartz.ts`가 빌드 시작 시 그 내용을 읽어서 `quartz.config.yaml`의 explorer `options`(마커
  구간)를 자동으로 다시 쓰는 방식(mapFn)으로 구현했다. 아이콘은 폴더 기본값(🪴) + 예외
  (radar 폴더 📡, radar 안 노트 📍, 비공개 아카이브 🔒 — 중복 방지) 구조.
  (이전에 CSS(`::before`) 방식으로 한 번 바꿔봤었는데, garden.yaml 로 폴더별 예외까지 관리하려면
  이쪽이 다시 더 맞아서 mapFn 방식으로 되돌렸다 — 아래 §5 참고.)
- 바뀐 파일: `garden.yaml`(explorer 설정), `quartz/garden/syncExplorerFromGarden.ts`(신규),
  `quartz.ts`(sync 호출 추가), `quartz.config.yaml`(explorer 옵션에 자동 생성 블록 + sortFn 한 줄),
  `quartz/styles/custom.scss`(이전 CSS 아이콘 규칙 제거, 원래 상태로).
- 홈 전용 컴포넌트(§8)는 아직 착수 전.

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
| 정원 설정 | `garden.yaml` (현재 탐색기만, §0) |

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

## 8. 홈 전용 컴포넌트 — 제안

홈 순서: ① 소개 ② 정원 ③ radar ④ 아빠의 화단 ⑤ 정원사와 연결되기.

**제안: 로컬 플러그인 하나(`plugins/garden-home`)에 컴포넌트 하나(`GardenHome`)가 ②~⑤를 순서대로 그린다.**
- ① 소개는 `content/index.md` 본문(마크다운)에 남긴다 → `pageBody`. 산책 가이드·신호 보내기는 본문에서 뺀다.
- `GardenHome`은 `layout: { position: afterBody, condition: index, priority: 5 }`.
  afterBody에 `hdr-comments`(priority 10)도 있으니 priority를 더 작게 해 댓글보다 위에 둔다.
- 섹션을 컴포넌트 여러 개로 나누면 플러그인 항목·priority 관리가 늘어난다. 한 컴포넌트 안에서
  섹션 순서를 정하면 순서가 한 곳에서 관리되고 CSS/스크립트도 한 번만 실린다.
- 구조는 `plugins/hdr-comments`를 따른다: `package.json`의 `quartz` 필드(category `component`,
  `components`), `src/` → `node build.mjs` → `dist/` 커밋. dist에 외부 import가 없어야 한다.
- 데이터는 빌드 시점에 컴포넌트 props의 `allFiles`에서 얻는다(slug, frontmatter, dates).
  - ② 정원: `scribbled-notes/*`. 식물 판정 규칙은 `garden.yaml`의 `plants`에.
  - ③ radar: `radar/*` 최근 기록. 점 위치 규칙은 `garden.yaml`의 `radar`에.
  - ④ 아빠의 화단: `content/img/inspiration` 목록을 빌드 때 읽는다. 원본이 483MB라 **반드시
    `/img/thumbs/*.webp` 썸네일**을 쓴다(CI에서 gen_gallery가 먼저 만든다). 클릭하면 원본이나 gallery 페이지로.
    로컬에는 썸네일이 없으니 로컬 확인용 대체 경로(원본 또는 gallery.py 로컬 실행)가 필요하다.
  - ⑤ 연락처: 지금 index.md의 "신호 보내기" 내용(Instagram/Email/GitHub). footer 링크와 같은 값.
- 움직임(레이더 스윕, 슬라이드)은 `afterDOMLoaded` 스크립트로. SPA라 `nav` 이벤트마다 다시 붙이고
  `window.addCleanup`으로 타이머를 정리한다.

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
  먼저 물어본다.** 지금은 셋 다 전역 설정이라 홈에도 자동으로 나온다 — §8의 `garden-home`
  컴포넌트를 만들 때 이 상태를 유지할지, 홈만 빼고 싶은지 미리 확인.
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

- [ ] **0. 결정받기** — 홈에서 TTS·댓글 표시 여부 / 식물 판정 기준(글 길이? 나이? 태그?) /
      레이더 점 규칙(최근 며칠? 폴더별 방향?) / Properties 한글 이름 목록 /
      gallery.md 소개글이 CI에서 덮어써지는 문제 처리.
- [x] **1. 탐색기** — 완료(§5). 제목 "오솔길", 아이콘은 `custom.scss`에 CSS로(폴더 🪴, radar 노트 📍).
- [ ] **2. Properties 표시 이름** — `garden.yaml`의 매핑 + nav마다 적용되는 작은 스크립트.
- [ ] **3. garden-home 뼈대** — `plugins/garden-home` 생성, config에 `afterBody / condition: index / priority 5`로 등록,
      빈 섹션 4개가 홈에만 나오는지 확인(다른 페이지·댓글·TTS 그대로인지 확인).
- [ ] **4. ⑤ 연락처 → ④ 아빠의 화단 → ③ radar → ② 정원** 순으로 채운다(데이터가 단순한 것부터).
- [ ] **5. index.md 정리** — 소개만 남긴다.
- [ ] **6. 확인·배포** — `npx quartz build`로 로컬 확인 → diff 검토(비밀값 없는지) → 사용자 확인 후 `v5`에 push.

## 참고 메모

- `project_hdr_comments` — 로컬 플러그인 패턴, lock 규칙, 댓글 백엔드.
- `project_text2speech` — TTS 원본과 배포, hackthebox 색 함정.
- `feedback_diff_before_deploy_secrets` — push 전 diff 확인.
- `feedback_no_destructive_bugfix_deletes` — 지우는 작업은 먼저 확인.
