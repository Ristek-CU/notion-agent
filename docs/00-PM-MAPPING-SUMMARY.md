# SmartProductDiscoveryAISystem — PM Mapping Summary

> Ringkasan komprehensif dari Product Management mapping menggunakan PM Skills Marketplace
> Dibuat: April 2026

---

## Project Overview

**Nama Project:** SmartProductDiscoveryAISystem
**Deskripsi:** AI-powered platform yang membantu product managers dan teams menemukan, memvalidasi, dan memprioritaskan ide produk menggunakan AI/ML yang mengintegrasikan framework PM terbukti.

**Repo Referensi:** [pm-skills](https://github.com/phuryn/pm-skills) oleh Paweł Huryn — 65 PM skills dan 36 chained workflows across 8 plugins.

---

## Dokumen Mapping

| # | Dokumen | Framework | Deskripsi |
|---|---------|-----------|-----------|
| 01 | [Product Strategy Canvas](01-product-strategy.md) | Product Strategy (Pawel Huryn) | 9-section strategy canvas: vision, segments, costs, value prop, trade-offs, metrics, growth, capabilities, defensibility |
| 02 | [Value Proposition](02-value-proposition.md) | 6-Part JTBD Template | Value proposition untuk 3 target segments: Startup PM, Mid-size Team, Enterprise Leader |
| 03 | [Lean Canvas](03-lean-canvas.md) | Lean Canvas (Ash Maurya) | Business model hypothesis: problem, solution, UVP, unfair advantage, channels, revenue, costs, metrics |
| 04 | [SWOT Analysis](04-swot-analysis.md) | SWOT Framework | 6 strengths, 6 weaknesses, 7 opportunities, 7 threats + cross-reference analysis |
| 05 | [User Personas](05-user-personas.md) | Persona Framework | 3+ personas dengan demographics, JTBD, pains, gains, dan unexpected insights |
| 06 | [Market Sizing](06-market-sizing.md) | TAM/SAM/SOM | Market size estimation dengan top-down dan bottom-up approaches |
| 07 | [Competitive Analysis](07-competitive-analysis.md) | Competitor Analysis | 11 competitors analyzed: direct, AI-native, dan indirect |
| 08 | [Porter's Five Forces](08-porters-five-forces.md) | Porter's Framework | Industry analysis: rivalry, supplier power, buyer power, substitutes, new entrants |
| 09 | [Customer Journey Map](09-customer-journey.md) | Journey Mapping | 7-stage journey: awareness → advocacy dengan touchpoints, emotions, pain points |
| 10 | [North Star Metric](10-north-star-metric.md) | NSM Framework | North Star: Weekly Discovery Cycles Completed + 20+ input metrics |

---

## Key Strategic Insights

### Product Positioning
- **Category**: AI-powered Product Discovery Platform
- **Differentiator**: Bukan sekadar AI chatbot atau template — AI reasoning engine yang memahami PM frameworks dan memandu discovery end-to-end
- **Price Position**: Mid-to-premium (unique value, bukan low cost)

### Target Segments (Priority Order)
1. **Startup PM / Founder** (Beachhead) — burning pain, fast adoption, evangelists
2. **Mid-size Company Product Teams** (Growth) — consistency, collaboration needs
3. **Enterprise Product Leaders** (Scale) — visibility, compliance, auditability

### Revenue Model
| Tier | Price | Target |
|------|-------|--------|
| Free | $0 | Individual PMs (3 cycles/month) |
| Pro | $29/user/mo | Startup teams |
| Team | $49/user/mo | Mid-size teams |
| Enterprise | Custom | Enterprise orgs |

### Critical Assumptions to Validate
1. PMs will pay for AI-powered discovery (vs free ChatGPT)
2. AI can produce trusted, quality discovery insights
3. Startup PMs are the right beachhead segment
4. Product discovery is important enough for dedicated tool investment

### Key Metrics
- **North Star**: Weekly Discovery Cycles Completed
- **OMTM (This Quarter)**: Discovery Cycle Completion Rate
- **Year 1 MRR Target**: $12,150/mo (~$146K ARR)

---

## PM Skills Used

Mapping ini dibuat menggunakan skill-skill berikut dari PM Skills Marketplace:

| Plugin | Skills Used |
|--------|------------|
| **pm-product-strategy** | product-strategy, value-proposition, lean-canvas, swot-analysis, porters-five-forces |
| **pm-market-research** | user-personas, market-sizing, competitor-analysis, customer-journey-map |
| **pm-marketing-growth** | north-star-metric |

### Recommended Next Steps (PM Skills)

1. **Discovery**: `/discover` — Run full discovery cycle untuk validate assumptions
2. **PRD**: `/write-prd` — Create PRD untuk MVP
3. **Pricing**: `/pricing` — Deep dive pricing strategy
4. **Beachhead**: `/plan-launch` — Go-to-market strategy
5. **Metrics Dashboard**: `/setup-metrics` — Design product metrics dashboard
6. **Stakeholder Map**: `/stakeholder-map` — Map stakeholders untuk project ini
7. **Pre-mortem**: `/pre-mortem` — Risk analysis sebelum launch

---

## Project Structure

```
SmartProductDiscoveryAISystem/
├── docs/
│   ├── 00-PM-MAPPING-SUMMARY.md    ← You are here
│   ├── 01-product-strategy.md      ← 9-section Product Strategy Canvas
│   ├── 02-value-proposition.md     ← 3 Value Propositions (JTBD)
│   ├── 03-lean-canvas.md           ← Lean Canvas business model
│   ├── 04-swot-analysis.md         ← SWOT Analysis + cross-reference
│   ├── 05-user-personas.md         ← User Personas (3+ segments)
│   ├── 06-market-sizing.md         ← TAM/SAM/SOM estimation
│   ├── 07-competitive-analysis.md  ← 11 competitors analyzed
│   ├── 08-porters-five-forces.md   ← Porter's Five Forces
│   ├── 09-customer-journey.md      ← 7-stage customer journey
│   └── 10-north-star-metric.md     ← NSM + input metrics constellation
└── pm-skills/                       ← PM Skills Marketplace (reference)
    ├── pm-product-discovery/
    ├── pm-product-strategy/
    ├── pm-execution/
    ├── pm-market-research/
    ├── pm-data-analytics/
    ├── pm-marketing-growth/
    ├── pm-go-to-market/
    └── pm-toolkit/
```

---

*Dokumen ini di-generate menggunakan PM Skills Marketplace oleh Paweł Huryn.*
*Semua framework yang digunakan: Product Strategy Canvas, 6-Part JTBD Value Proposition, Lean Canvas (Ash Maurya), SWOT Analysis, Porter's Five Forces, User Personas, TAM/SAM/SOM, Competitor Analysis, Customer Journey Mapping, North Star Metric.*
