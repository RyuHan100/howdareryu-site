import json
import sys
from datetime import datetime, timedelta
from email.utils import format_datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import news_clipping as nc  # noqa: E402

NOW = datetime(2026, 9, 20, 6, 40, tzinfo=nc.KST)


def rss(*entries) -> bytes:
    """entries: (title, source, hours_ago)"""
    items = "".join(
        f"<item><title>{t} - {s}</title><link>https://news.google.com/rss/articles/{abs(hash((t, s)))}</link>"
        f"<pubDate>{format_datetime(NOW - timedelta(hours=h))}</pubDate>"
        f'<source url="https://{s}.example">{s}</source></item>'
        for t, s, h in entries)
    return f'<?xml version="1.0"?><rss version="2.0"><channel>{items}</channel></rss>'.encode()


def write_config(tmp_path: Path, keywords, **settings) -> Path:
    p = tmp_path / "keywords.yml"
    p.write_text(json.dumps({"keywords": keywords, "settings": {"request_delay": 0, **settings}}, ensure_ascii=False))
    return p


NAVER = {"X-NCP-APIGW-API-KEY-ID": "id", "X-NCP-APIGW-API-KEY": "secret"}


def naver(*entries) -> bytes:
    """entries: (title, originallink, hours_ago[, description])"""
    return json.dumps({"items": [{
        "title": e[0], "originallink": e[1], "link": "https://n.news.naver.com/x",
        "description": e[3] if len(e) > 3 else "", "pubDate": format_datetime(NOW - timedelta(hours=e[2])),
    } for e in entries]}, ensure_ascii=False).encode()


def fake_fetcher(feeds: dict):
    """(검색어, 'ko'|'en') 는 Google 판, (검색어, 'naver') 는 네이버 1쪽."""
    def fetcher(url, headers=None):
        for (query, lang), body in feeds.items():
            if lang == "naver":
                assert url != nc.build_naver_url(query) or headers == NAVER
            if url == (nc.build_naver_url(query) if lang == "naver" else nc.build_url(query, lang, 48)):
                if isinstance(body, Exception):
                    raise body
                return body
        return rss()
    return fetcher


def test_normalize_keyword_string():
    assert nc.normalize_keyword("탄소시장")["en"] is None
    assert nc.normalize_keyword("CBAM") == {"name": "CBAM", "ko": "CBAM", "en": "CBAM", "naver": ["CBAM"], "must": [], "must_in": "title"}
    assert nc.normalize_keyword({"name": "x", "ko": '국제감축 OR "파리협정 6조"'})["naver"] == ['국제감축 | "파리협정 6조"']
    assert nc.normalize_keyword({"name": "x", "ko": "a", "naver": ["b", "c"]})["naver"] == ["b", "c"]


def test_parse_strips_source_suffix_and_keeps_source():
    [item] = nc.parse_rss(rss(("배출권 가격 급등", "연합뉴스", 3)), "ko", "탄소시장")
    assert item["title"] == "배출권 가격 급등"
    assert item["source"] == "연합뉴스"
    assert item["published"].startswith("2026-09-19T18:40")


def test_key_ignores_bracket_prefix_and_punctuation():
    assert nc.item_key("[단독] 배출권 가격, 급등", "연합뉴스") == nc.item_key("배출권 가격 급등", "연합뉴스")


def test_cluster_groups_similar_titles_and_ranks_by_coverage():
    items = nc.parse_rss(rss(
        ("정부, 2035 NDC 감축목표 53% 확정", "A일보", 5),
        ("정부 2035 NDC 감축목표 53%로 확정", "B신문", 4),
        ("EU CBAM 본격 시행 앞두고 철강업계 비상", "C경제", 1),
    ), "ko", "k")
    clusters = nc.cluster(items, 0.5, priority_sources=["B신문"])
    assert [len(c) for c in clusters] == [2, 1]
    assert clusters[0][0]["source"] == "B신문"      # 우선 매체가 대표


def test_esc_neutralizes_obsidian_syntax():
    assert nc.esc("COP31 #기후 [속보] ==a== $1|x") == r"COP31 \#기후 \[속보\] \=\=a\=\= \$1\|x"


def test_run_writes_pages_dedupes_across_keywords_and_days(tmp_path):
    cfg = write_config(tmp_path, [{"name": "탄소시장", "ko": "탄소시장", "en": "carbon market"}, "CBAM"])
    feeds = {
        ("탄소시장", "ko"): rss(("배출권 가격 급등", "연합뉴스", 3), ("오래된 기사", "연합뉴스", 72),
                              ("CBAM 대응 탄소시장 보고서 발간", "환경일보", 2)),
        ("carbon market", "en"): rss(("Carbon market hits record", "Reuters", 6)),
        ("CBAM", "ko"): rss(("CBAM 대응 탄소시장 보고서 발간", "환경일보", 2)),
    }
    assert nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds)) == 0

    root = tmp_path / "content/news"
    day = json.loads((root / "data/daily/2026-09-20.json").read_text())
    assert len(day["items"]) == 3                                   # 72시간 전 기사는 제외
    shared = next(i for i in day["items"] if "보고서" in i["title"])
    assert (shared["keyword"], shared["also"]) == ("탄소시장", ["CBAM"])

    page = (root / "2026/2026-09-20.md").read_text()
    assert "## 📄 리포트·보고서" in page and "### 해외 · 1건" in page
    assert page.index("리포트·보고서") < page.index("## 탄소시장")
    assert "\n---\n\n## 탄소시장" in page and "---\n\n## 📄" not in page      # 문단 사이에만 구분선
    index = (root / "index.md").read_text()
    assert "[[news/2026/2026-09-20|2026-09-20 클리핑]]" in index

    # 같은 날 재실행: 새 기사만 추가
    feeds[("CBAM", "ko")] = rss(("CBAM 대응 탄소시장 보고서 발간", "환경일보", 2), ("CBAM 인증서 가격 공개", "한겨레", 1))
    nc.run(tmp_path, "content/news", cfg, NOW + timedelta(hours=2), fetcher=fake_fetcher(feeds))
    assert len(json.loads((root / "data/daily/2026-09-20.json").read_text())["items"]) == 4

    # 다음 날: 이미 실은 기사는 다시 나오지 않는다
    feeds[("탄소시장", "ko")] = rss(("배출권 가격 급등", "연합뉴스", 27), ("새 기사", "경향신문", 1))
    nc.run(tmp_path, "content/news", cfg, NOW + timedelta(days=1), fetcher=fake_fetcher(feeds))
    next_day = json.loads((root / "data/daily/2026-09-21.json").read_text())
    assert [i["title"] for i in next_day["items"]] == ["새 기사"]
    assert "[[news/2026/2026-09-20|← 2026-09-20]]" in (root / "2026/2026-09-21.md").read_text()
    assert "[[news/2026/2026-09-20|2026-09-20]] — 4건" in (root / "index.md").read_text()


def test_all_requests_failing_touches_nothing(tmp_path):
    cfg = write_config(tmp_path, ["탄소시장"])
    code = nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher({("탄소시장", "ko"): RuntimeError("429")}))
    assert code == 2
    assert not (tmp_path / "content").exists()


def test_partial_failure_is_reported_on_page(tmp_path):
    cfg = write_config(tmp_path, [{"name": "탄소시장", "ko": "탄소시장", "en": "carbon market"}])
    feeds = {("탄소시장", "ko"): rss(("배출권 가격 급등", "연합뉴스", 3)), ("carbon market", "en"): RuntimeError("timeout")}
    assert nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds)) == 0
    assert "수집 실패 1건" in (tmp_path / "content/news/index.md").read_text()


def test_must_and_exclude_filters(tmp_path):
    cfg = write_config(tmp_path, [{"name": "6조", "ko": "국제감축", "must": ["국제감축"]}], exclude_terms=["부고"])
    feeds = {("국제감축", "ko"): rss(("국제감축 사업 확대", "A", 1), ("무관한 기사", "B", 1), ("[부고] 국제감축 담당자", "C", 1))}
    nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds))
    day = json.loads((tmp_path / "content/news/data/daily/2026-09-20.json").read_text())
    assert [i["title"] for i in day["items"]] == ["국제감축 사업 확대"]


def test_empty_keywords_rejected(tmp_path):
    with pytest.raises(SystemExit):
        nc.load_config(write_config(tmp_path, []))


def test_report_terms_match_whole_english_words_only():
    terms = nc.DEFAULT_SETTINGS["report_terms"]
    assert nc.is_report({"title": "IEA World Energy Outlook 2026 released"}, terms)
    assert nc.is_report({"title": "탄소시장 전망 보고서 발간"}, terms)
    assert not nc.is_report({"title": "Reporter says sources reported CBAM delay"}, terms)


def test_has_term_matches_ascii_terms_as_words():
    assert nc.has_term("ESS용 배터리 K-ESS 3차 입찰", "ESS")
    assert nc.has_term("Carbon credits surge", "credit")
    assert not nc.has_term("Daily business progress", "AI")
    assert not nc.has_term("Daily business progress", "ESS")
    assert nc.has_term("국제감축사업 추진", "감축")


def test_paired_keyword_is_one_section_with_both_editions(tmp_path):
    assert nc.normalize_keyword("탄소시장 / carbon market") == {
        "name": "탄소시장 / carbon market", "ko": "탄소시장", "en": "carbon market", "naver": ["탄소시장"], "must": [], "must_in": "title"}
    cfg = write_config(tmp_path, ["탄소시장 / carbon market"])
    feeds = {("탄소시장", "ko"): rss(("배출권 가격 급등", "연합뉴스", 3)),
             ("carbon market", "en"): rss(("Carbon market hits record", "Reuters", 6))}
    nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds))
    page = (tmp_path / "content/news/2026/2026-09-20.md").read_text()
    assert page.count("## 탄소시장 / carbon market") == 1
    assert page.index("### 국내 · 1건") < page.index("### 해외 · 1건")


def test_naver_items_merge_with_google_and_get_outlet_names(tmp_path):
    cfg = write_config(tmp_path, ["탄소시장"])
    feeds = {
        ("탄소시장", "naver"): naver(
            ("<b>배출권</b> 가격 &quot;급등&quot;", "https://www.yna.example/view/1", 3, "정부가 <b>배출권</b> 시장 안정화 방안을 내놨다."),
            ("네이버에만 있는 기사", "https://m.local.example/a/2", 2),
            ("오래된 기사", "https://old.example/3", 72)),
        ("탄소시장", "ko"): b'<?xml version="1.0"?><rss version="2.0"><channel>'
            b'<item><title>\xeb\xb0\xb0\xec\xb6\x9c\xea\xb6\x8c \xea\xb0\x80\xea\xb2\xa9 "\xea\xb8\x89\xeb\x93\xb1" - \xec\x97\xb0\xed\x95\xa9\xeb\x89\xb4\xec\x8a\xa4</title>'
            b'<link>https://news.google.com/rss/articles/1</link><pubDate>' + format_datetime(NOW - timedelta(hours=3)).encode() +
            b'</pubDate><source url="https://www.yna.example">\xec\x97\xb0\xed\x95\xa9\xeb\x89\xb4\xec\x8a\xa4</source></item></channel></rss>',
    }
    assert nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds), naver_headers=NAVER) == 0
    root = tmp_path / "content/news"
    items = json.loads((root / "data/daily/2026-09-20.json").read_text())["items"]
    assert len(items) == 2                                          # 양쪽에서 잡힌 기사는 1건으로
    merged = next(i for i in items if "배출권" in i["title"])
    assert merged["title"] == '배출권 가격 "급등"'
    assert (merged["via"], merged["source"], merged["link"]) == ("naver", "연합뉴스", "https://www.yna.example/view/1")
    assert next(i for i in items if "네이버에만" in i["title"])["source"] == "local.example"   # 모르는 도메인은 그대로
    assert json.loads((root / "data/sources.json").read_text()) == {"yna.example": "연합뉴스"}
    page = (root / "index.md").read_text()
    assert "정부가 배출권 시장 안정화 방안을 내놨다." in page and "출처: 네이버 뉴스 검색 · Google News" in page


def test_without_naver_keys_only_google_is_used(tmp_path):
    cfg = write_config(tmp_path, ["탄소시장"])
    feeds = {("탄소시장", "naver"): RuntimeError("호출되면 안 됨"), ("탄소시장", "ko"): rss(("배출권 가격 급등", "연합뉴스", 3))}
    assert nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds)) == 0
    index = (tmp_path / "content/news/index.md").read_text()
    assert "수집 실패" not in index and "네이버 뉴스 검색" not in index


def test_same_title_from_another_outlet_next_day_is_skipped(tmp_path):
    cfg = write_config(tmp_path, ["탄소시장"])
    feeds = {("탄소시장", "ko"): rss(("배출권 가격 급등", "연합뉴스", 3))}
    nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds))
    feeds[("탄소시장", "ko")] = rss(("배출권 가격 급등", "받아쓴일보", 1), ("정말 새 기사", "한겨레", 1))
    nc.run(tmp_path, "content/news", cfg, NOW + timedelta(days=1), fetcher=fake_fetcher(feeds))
    day2 = json.loads((tmp_path / "content/news/data/daily/2026-09-21.json").read_text())
    assert [i["title"] for i in day2["items"]] == ["정말 새 기사"]


def test_truncated_naver_title_merges_with_google_and_stays_deduped_next_day(tmp_path):
    cfg = write_config(tmp_path, ["탄소시장"])
    long_title = "지난해 국가 온실가스 배출량 전년 대비 감소했지만 2030 목표까지 1억4900만톤 추가 감축 필요"
    feeds = {("탄소시장", "naver"): naver((long_title[:30] + "...", "https://www.kuki.example/a/1", 3, "탄소시장 영향")),
             ("탄소시장", "ko"): rss((long_title, "kuki", 3))}
    feeds[("탄소시장", "ko")] = feeds[("탄소시장", "ko")].replace(b"https://kuki.example", b"https://www.kuki.example")
    nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds), naver_headers=NAVER)
    [item] = json.loads((tmp_path / "content/news/data/daily/2026-09-20.json").read_text())["items"]
    assert (item["title"], item["via"], item["link"]) == (long_title, "naver", "https://www.kuki.example/a/1")

    feeds[("탄소시장", "ko")] = rss()                  # 다음 날: 네이버에만 잘린 제목으로 다시 잡힘
    nc.run(tmp_path, "content/news", cfg, NOW + timedelta(days=1), fetcher=fake_fetcher(feeds), naver_headers=NAVER)
    assert not (tmp_path / "content/news/data/daily/2026-09-21.json").exists()


def test_must_in_text_checks_naver_description_too(tmp_path):
    cfg = write_config(tmp_path, [{"name": "ETS", "naver": ["배출권거래제"], "must": ["배출권"], "must_in": "text"}])
    feeds = {("배출권거래제", "naver"): naver(("기후 법안이 밀려온다", "https://a.example/1", 2, "배출권거래제 개편안이 핵심"),
                                         ("안동 가볼 만한 곳", "https://b.example/2", 2, "가을 여행지"))}
    nc.run(tmp_path, "content/news", cfg, NOW, fetcher=fake_fetcher(feeds), naver_headers=NAVER)
    items = json.loads((tmp_path / "content/news/data/daily/2026-09-20.json").read_text())["items"]
    assert [i["title"] for i in items] == ["기후 법안이 밀려온다"]

    strict = write_config(tmp_path, [{"name": "ETS", "naver": ["배출권거래제"], "must": ["배출권"]}])   # 기본은 제목만
    assert nc.run(tmp_path / "strict", "content/news", strict, NOW, fetcher=fake_fetcher(feeds), naver_headers=NAVER) == 0
    assert not (tmp_path / "strict/content/news/data/daily").exists()
