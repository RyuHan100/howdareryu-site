# 뉴스 클리핑 (News_radar)

키워드로 국내외 기사·리포트를 네이버 뉴스·Google News 에서 매일 모아 howdareryu.com(Quartz, GitHub Pages)의 `/news` 페이지로 자동 게시합니다.
`pacm-monitor` 와 같은 방식입니다: 사이트 저장소 안의 GitHub Actions 가 매일 실행 → `content/news` 커밋 → Quartz 재배포.

```
keywords.yml ─▶ 네이버 뉴스 검색(NAVER API HUB, 국내) + Google News RSS (국내 ko-KR / 해외 en-US)
                   │ 최근 48시간 · 이미 실은 기사·같은 제목 제외 · 제외어/매체 필터
                   ▼
              제목 유사도로 같은 기사 묶기 (보도 많은 순 → 최신순)
                   ▼
   content/news/2026/2026-09-20.md   그날 클리핑 (쌓임)
   content/news/index.md             최신 클리핑 + 지난 30일 목록
   content/news/data/                daily/<날짜>.json (중복 판단의 근거), sources.json (도메인→매체명)
```

## 구성

| 파일 | 역할 |
|---|---|
| `tools/news_clipping/keywords.yml` | **키워드와 설정. 평소에는 이 파일만 고칩니다** |
| `tools/news_clipping/news_clipping.py` | 수집 → 중복 제거 → 묶기 → 마크다운/JSON 생성 |
| `tools/news_clipping/requirements.txt` | PyYAML (네이버·Google 호출은 표준 라이브러리) |
| `tools/news_clipping/tests/` | pytest (네트워크 없이 동작) |
| `.github/workflows/news-clipping.yml` | 매일 06:40 KST 실행, 커밋, Quartz 배포 트리거 |

## 키워드 바꾸기

GitHub 웹에서 `tools/news_clipping/keywords.yml` 을 바로 편집해도 됩니다. 다음 실행부터 반영됩니다.

```yaml
keywords:
  - 탄소시장                         # 문자열: 국내판 검색 (한글이 없으면 해외판도)
  - 탄소시장 / carbon market          # '국문 / 영문' 짝: 한 제목 아래 국내·해외로 같이 묶음
  - name: 파리협정 6조                # 국내/해외 검색어를 따로
    ko: '"파리협정 6조" OR 국제감축'     # Google 검색 문법: "구문", OR, -제외어
    en: '"Article 6" "Paris Agreement"'
    must: [6조, 국제감축, article 6]   # (선택) 제목에 하나는 있어야 실음
```

`settings` 에서 기간(`lookback_hours`), 키워드당 표시 수(`max_per_keyword`), 묶음 민감도(`similarity`),
제외어·제외 매체·우선 매체, 리포트로 분류할 단어(`report_terms`)를 조정합니다.

## 동작 방식

- **중복**: 지난 14일 클리핑에 실린 기사(제목+매체 도메인)와 **같은 제목의 기사**(다른 매체가 받아쓴 것 포함)는 다시 싣지 않습니다. 네이버와 Google 양쪽에서 잡힌 같은 기사는 1건으로 합치고 원문 직접 링크인 네이버 쪽을 남깁니다. 여러 키워드에 걸린 기사는 첫 키워드에 두고 나머지 키워드를 꼬리표로 답니다.
- **묶기**: 제목 3글자 조각의 겹침(Jaccard)이 `similarity` 이상이면 같은 사안으로 보고 대표 1건 + "관련 보도 N건"으로 접습니다. 여러 매체가 다룬 사안이 위로 올라옵니다.
- **리포트**: 제목에 보고서·리포트·report·outlook 등이 있으면 맨 위 "📄 리포트·보고서"로 따로 모읍니다.
- **재실행**: 같은 날 다시 돌리면 새 기사만 그날 파일에 추가됩니다. 모든 요청이 실패하면 파일을 건드리지 않고 exit 2(워크플로 실패 알림).
- **네이버**: 원문 직접 링크와 본문 발췌 한 줄이 붙습니다. 네이버 API 는 매체명을 주지 않아, Google 결과에서 배운 '도메인 → 매체명'(`sources.json`, 실행할수록 늘어남)으로 바꾸고 모르는 매체는 도메인으로 표시합니다.
- **한계**: Google 에서 온 기사의 링크는 Google News 경유 주소이고(클릭하면 원문으로 이동) 발췌가 없습니다.

## 네이버 API 키 (한 번만)

네이버 검색 API 는 **네이버 클라우드 플랫폼의 NAVER API HUB** 로 제공됩니다 (`naverapihub.apigw.ntruss.com/search/v1/news`, 하루 25,000회).

1. <https://console.ncloud.com> → NAVER API HUB 이용 신청 → Application 등록(검색 API) → Client ID(10자) / Client Secret(40자).
2. 사이트 저장소 Settings → Secrets and variables → Actions 에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 이름으로 등록.
   **워크플로 yml 에 값을 직접 쓰면 안 됩니다** (공개 저장소).
3. 로컬에서 돌릴 때는 볼트 밖 `~/.config/news_clipping/.env` 에 같은 이름으로 두 줄.

키가 없으면 경고만 남기고 Google News 만으로 동작합니다.

## 설치 (사이트 저장소에서)

```bash
cp -R tools/news_clipping <사이트 저장소>/tools/
cp .github/workflows/news-clipping.yml <사이트 저장소>/.github/workflows/
git add tools/news_clipping .github/workflows/news-clipping.yml && git commit -m "add news clipping" && git push
```

Actions 탭 → "News clipping" → Run workflow 로 첫 실행. 권한·배포 설정은 pacm-monitor 가 이미 쓰는 것과 같습니다
(Workflow permissions: Read and write, `deploy.yml` 의 `workflow_dispatch`).

## 로컬 실행·테스트

```bash
cd ~/Documents/기후
.venv/bin/python "Scripts/News Cripping/tools/news_clipping/news_clipping.py" --dry-run          # 파일 없이 결과만
.venv/bin/python "Scripts/News Cripping/tools/news_clipping/news_clipping.py" --site-root /tmp/site-test
.venv/bin/python -m pytest "Scripts/News Cripping/tools/news_clipping/tests"
```
