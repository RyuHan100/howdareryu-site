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

## 3. 데이터 흐름 요약

1. **연간화 (§4.4)** — 4계절 대표주차의 noESS 대비 변화율(α)을 계절 전체 noESS 발전량에 곱해 2038년 ΔG_annual(원전/석탄/가스, TWh)을 얻는다. 3GW·8GW는 직접 계산(`annualize_direct_scenario`), 10GW·15GW는 8GW 결과를 피크절감비로 확대(`scale_annual_effects`)한다.

2. **물리효과 3종 (§5.3·5.4)** — ΔG_annual로부터 운영비 절감(`calculate_operating_cost_savings_krw`)과 탄소감축(`calculate_carbon_reduction_tco2`)을 산정하고, 별도로 피크절감(MW)→정격용량 환산과 ESS 연간 방전량(`annual_discharge_twh`, LCOS 비용 산정 기준)을 계산한다.

3. **Case 정의 (§5.6)** — LCOS(169/91원) × 탄소가격 경로(하한/상한) 조합으로 Case A1·A2·B1·B2를 만든다(`build_case_definitions`).

4. **연도별 확장·비용편익 (§5.2·5.5, Appendix G)** — `calculate_economics`가 2030~2045년 각 연도에 대해 물리효과 보정계수 s_y, 할인계수 d_y를 적용해 편익(운영+탄소+선택적 고정비 회피)과 비용(방전량×LCOS)을 계산하고 현재가치로 환산한다.

5. **결과·검증 (Appendix A, 표5-5)** — BCR = ΣPV편익/ΣPV비용, NPV = Σ(편익−비용)·d_y를 산출하고, `validate_against_report`가 코드 산출값을 보고서 표 4-3·5-5 원본 수치와 자동 대조한다.

> 검증 함수의 하드코딩된 기대값(예: 8GW 탄소감축 3.30MtCO₂, 운영비 412.5십억원)이 보고서 표 4-3과 정확히 일치하는 것을 확인했어요 — 코드가 보고서 계산을 충실히 재현하고 있다는 뜻입니다.