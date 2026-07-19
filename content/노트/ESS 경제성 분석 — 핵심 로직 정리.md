# ESS 경제성 분석 — 핵심 로직 정리

> 원본: `ess_lng_economic_analysis.py` / 대조 보고서: LNG_ESS_최종보고서_v8

## 1. 개념도 (보고서 구조 기준)

```mermaid
flowchart TD

    subgraph INPUT["📥 입력 데이터"]
        A1["연간 noESS 발전량"]
        A2["4계절 대표주차 ESS 시뮬레이션"]
        A3["10h 용량스윕<br/>(§3.2, App.D)"]
        A4["LCOS·탄소가격·RCP<br/>(§5.1, App.B·C)"]
    end

    subgraph S1["🔁 annualize_direct_scenario<br/>§4.4, 표 4-3"]
        B1["α = (G_ESS_rep − G_noESS_rep) / G_noESS_rep"]
        B2["ΔG_annual = Σ α × G_noESS_season"]
    end

    subgraph S1B["📐 scale_annual_effects<br/>§4.4 각주"]
        B3["10·15GW = 8GW × 피크절감비"]
    end

    subgraph S2["⚡ 물리효과 3종 산출"]
        C1["calculate_operating_cost_savings_krw<br/>§5.4 — 운영비 절감"]
        C2["calculate_carbon_reduction_tco2<br/>§5.4 — 탄소감축(표5-3)"]
        C3["lookup_peak_reduction<br/>§3.2 — 피크절감→정격환산"]
        C4["annual_discharge_twh<br/>§5.3 표5-2 — 연간방전량"]
    end

    subgraph S3["🧮 build_case_definitions<br/>§5.6 표5-4"]
        D1["LCOS 169/91원 × 탄소가격 하/상"]
        D2["Case A1·A2·B1·B2"]
    end

    subgraph S4["📅 연도별 보정계수<br/>§5.2 표5-1"]
        E1["physical_effect_factor s_y<br/>(2030:0.5 → 2038:1.0)"]
        E2["discount_factor d_y<br/>(할인율 4.5%)"]
    end

    subgraph S5["💰 calculate_economics<br/>§5.5·5.6, Appendix G"]
        F1["기본편익 = 운영편익+탄소편익"]
        F2["고정비편익 = 기본편익 + B_fixed,y<br/>(Δpmax×RCP_y×8760×s_y)"]
        F3["ESS비용 = 연간방전량×LCOS"]
        F4["PV = 값 × d_y"]
    end

    subgraph S6["📊 결과 & 검증"]
        G1["BCR = ΣB·d / ΣC·d<br/>Appendix A"]
        G2["NPV = Σ(B−C)·d<br/>표5-5"]
        G3["validate_against_report<br/>표4-3·5-5 대조"]
    end

    A1-->B1
    A2-->B1
    B1-->B2
    A3-->B3
    B2-.참조.->B3

    B2-->C1
    B3-->C1
    B2-->C2
    B3-->C2
    A3-->C3
    B2-->C4

    A4-->D1
    D1-->D2

    C1-->F1
    C2-->F1
    C3-->F2
    C4-->F3
    D2-->F1
    D2-->F3
    E1-->F1
    E1-->F2
    E1-->F3
    E2-->F4

    F1-->F4
    F2-->F4
    F3-->F4

    F4-->G1
    F4-->G2
    G1-->G3
    G2-->G3

    classDef input fill:#e8eef7,stroke:#4a6fa5,color:#1a2b3d;
    classDef process fill:#eaf7ee,stroke:#4a9d5f,color:#1a2b3d;
    classDef result fill:#fff3e0,stroke:#c98a1f,color:#1a2b3d;
    class A1,A2,A3,A4 input;
    class B1,B2,B3,C1,C2,C3,C4,D1,D2,E1,E2,F1,F2,F3,F4 process;
    class G1,G2,G3 result;
```

## 2. 함수 호출 계층도 (Call Graph)

```mermaid
flowchart TD
    MAIN["run_analysis()"]

    MAIN --> PRE1["read_generation_csv()<br/><i>전처리</i>"]
    MAIN --> PRE2["load_capacity_sweep()<br/>§3.2"]

    MAIN --> DIRECT["annualize_direct_scenario()<br/>mode=direct 시나리오별 반복"]
    DIRECT --> U1["generation_masks() · extract_week()<br/>aggregate_energy_mwh() · safe_divide()<br/><i>전처리 헬퍼</i>"]

    MAIN --> SCALE["scale_annual_effects()<br/>mode=scaled 시나리오별 반복"]
    SCALE --> LOOKUP["lookup_peak_reduction()"]

    MAIN --> ECONIN["load_economic_inputs()<br/>§5.1"]
    ECONIN --> U2["interpolate_series() · parse_year_token()<br/><i>전처리 헬퍼</i>"]

    MAIN --> CASES["build_case_definitions()<br/>§5.6"]

    MAIN --> EFFECTS["시나리오별 물리효과 계산"]
    EFFECTS --> OP["calculate_operating_cost_savings_krw()"]
    EFFECTS --> CARBON["calculate_carbon_reduction_tco2()"]
    EFFECTS --> DISCHARGE["annual_discharge_twh()"]

    MAIN --> ECON["calculate_economics()<br/>§5.5·5.6, Appendix G"]
    ECON --> PEF["physical_effect_factor() — 연도별 s_y"]
    ECON --> DF["discount_factor() — 연도별 d_y"]
    ECON -.입력값 사용.-> OP
    ECON -.입력값 사용.-> CARBON
    ECON -.입력값 사용.-> DISCHARGE
    ECON -.입력값 사용.-> CASES
    ECON -.입력값 사용.-> ECONIN

    MAIN --> VALID["validate_against_report()<br/>표4-3·5-5 대조"]
    MAIN --> OUT["export_results() / plot_*()<br/><i>출력·시각화, 비핵심</i>"]

    classDef core fill:#eaf7ee,stroke:#4a9d5f,color:#1a2b3d;
    classDef util fill:#f0f0f0,stroke:#999,color:#555;
    classDef entry fill:#e8eef7,stroke:#4a6fa5,color:#1a2b3d,font-weight:bold;

    class MAIN entry;
    class PRE1,U1,U2,OUT util;
    class PRE2,DIRECT,SCALE,LOOKUP,ECONIN,CASES,EFFECTS,OP,CARBON,DISCHARGE,ECON,PEF,DF,VALID core;
```



s_y : 물리효과 보정계수 physical_effect_factor
- 이 분석은 원래 **2038년 딱 한 해**의 시뮬레이션 결과(운영비 절감, 탄소감축 등)만 갖고 있습니다.
- 그런데 분석 대상 기간은 **2030~2045년**이라, 2038년 값을 다른 연도에도 써야 합니다.
- 다만 2030년처럼 이른 시점에는 계통 상황(재생에너지 비중, ESS 성숙도 등)이 2038년만큼 여건이 갖춰지지 않았을 거라 보고, "2038년 효과를 100% 그대로 적용하면 과대평가"라는 문제의식에서 만든 **가중치**입니다.
- "physical_effect_start_factor": 0.5,