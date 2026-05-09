# North Star Metric: SmartProductDiscoveryAISystem

> Defining the North Star Metric and supporting input metrics

---

## Business Game Classification

**Game Type: Productivity Game**

SmartProductDiscoveryAISystem adalah productivity tool — user value bertambah setiap kali mereka berhasil menyelesaikan discovery cycle dan menghasilkan insight yang actionable. Revenue berbanding lurus dengan seberapa sering dan seberapa efektif user menggunakan platform.

**Key Characteristics:**
- Value = completing discovery cycles efficiently
- Revenue scales with usage depth (more cycles → more value → upgrade)
- Retention driven by habit formation (weekly discovery practice)
- Growth through demonstrated value (successful discovery outcomes)

---

## North Star Metric

### Weekly Discovery Cycles Completed

**Definition:** Jumlah discovery cycle yang berhasil diselesaikan (dari start → insight → documented outcome) per minggu di seluruh platform.

**Why this metric?**
1. **Reflects core value**: User mendapat value hanya ketika mereka BENAR-BENAR menyelesaikan discovery cycle — bukan hanya sign up atau browse
2. **Leading indicator of revenue**: More completed cycles → higher engagement → higher conversion to paid → higher retention
3. **Measurable and actionable**: Binary (completed or not) + countable
4. **Aligns all teams**: Product (better workflow), Engineering (faster platform), Growth (more activation)

**Targets:**
| Period | Weekly Target | Cumulative Users |
|--------|--------------|-----------------|
| Month 1-3 (Beta) | 50 cycles | 100 beta users |
| Month 4-6 (Public Launch) | 200 cycles | 500 users |
| Month 7-12 (Growth) | 1,000 cycles | 2,000 users |
| Year 2 (Scale) | 5,000 cycles | 10,000 users |

---

## Input Metrics Constellation

```
                        ★ North Star ★
                   Weekly Discovery
                    Cycles Completed
                          |
         ┌────────────────┼────────────────┐
         |                |                |
    🎯 Acquisition   🎯 Activation    🎯 Engagement
         |                |                |
   New Signups      First Cycle       Cycles per
   from target      Completion       Active User
   segments         Rate             per Week
         |                |                |
   Channel            Time to         Discovery
   Conversion         First           Streak
                      Insight         (consecutive
                                      weeks)
         ┌────────────────┼────────────────┐
         |                |                |
    💰 Monetization  🔄 Retention     📈 Quality
         |                |                |
   Free → Paid       Monthly          Hypothesis
   Conversion        Retention        Validation
   Rate              Rate             Rate
         |                |                |
   Revenue per        Churned          AI Insight
   Discovery Cycle    User             Adoption
                      Recovery         Rate
```

---

## Detailed Input Metrics

### 1. Acquisition Metrics

| Metric | Definition | Target (Year 1) | Owner |
|--------|-----------|-----------------|-------|
| **New Weekly Signups** | Users yang mendaftar per minggu | 50-100/week | Growth |
| **Signup → First Cycle Rate** | % signup yang start discovery cycle dalam 7 hari | 40% | Product |
| **Channel Conversion Rate** | Conversion per acquisition channel | Track per channel | Marketing |
| **Cost per Signup** | Total spend / new signups | <$20 | Growth |

### 2. Activation Metrics

| Metric | Definition | Target (Year 1) | Owner |
|--------|-----------|-----------------|-------|
| **First Cycle Completion Rate** | % user yang complete first discovery cycle | 60% | Product |
| **Time to First Insight** | Waktu dari signup ke first AI-generated insight | < 30 min | Product |
| **"Aha Moment" Rate** | % user yang reach aha moment (first validated hypothesis) | 30% in 14 days | Product |
| **Onboarding Completion** | % user yang complete onboarding flow | 70% | Product |

### 3. Engagement Metrics

| Metric | Definition | Target (Year 1) | Owner |
|--------|-----------|-----------------|-------|
| **Cycles per Active User per Week** | Average discovery cycles per WAU | 1.5 | Product |
| **Discovery Streak** | % users with 3+ consecutive weeks of discovery | 25% | Product |
| **AI Feature Usage** | % cycles yang use AI synthesis/recommendation | 80% | Product |
| **Collaboration Rate** | % cycles yang involve 2+ team members | 20% | Product |

### 4. Retention Metrics

| Metric | Definition | Target (Year 1) | Owner |
|--------|-----------|-----------------|-------|
| **D7 Retention** | % users yang return within 7 days | 40% | Product |
| **D30 Retention** | % users yang return within 30 days | 25% | Product |
| **Monthly Churn Rate** | % paid users yang cancel per month | <5% | Success |
| **Churned User Recovery** | % churned users yang return within 90 days | 15% | Success |

### 5. Monetization Metrics

| Metric | Definition | Target (Year 1) | Owner |
|--------|-----------|-----------------|-------|
| **Free → Pro Conversion** | % free users yang upgrade within 60 days | 5% | Growth |
| **Revenue per Discovery Cycle** | MRR / monthly cycles completed | $3-5 | Finance |
| **Expansion Revenue** | % revenue from upgrades vs new | 20%+ | Sales |
| **LTV:CAC Ratio** | Lifetime value / customer acquisition cost | >3:1 | Finance |

### 6. Quality Metrics

| Metric | Definition | Target (Year 1) | Owner |
|--------|-----------|-----------------|-------|
| **Hypothesis Validation Rate** | % hypotheses yang get clear pass/fail result | 70% | Product |
| **AI Insight Acceptance Rate** | % AI insights yang user accepts/acts on | 60% | Product |
| **AI Accuracy Score** | User rating of AI recommendation quality | 4.0/5.0 | Engineering |
| **NPS (Active Users)** | Net Promoter Score dari monthly active users | 50+ | Success |

---

## Metric Review Cadence

| Review | Frequency | Participants | Focus |
|--------|-----------|-------------|-------|
| **Daily Standup** | Daily | Core team | Blockers, micro-trends |
| **Weekly Metrics Review** | Weekly | Product + Growth | NSM trend, input metrics |
| **Monthly Business Review** | Monthly | All leads | Full funnel, unit economics |
| **Quarterly Strategy Review** | Quarterly | Leadership | Strategy adjustments, target recalibration |

---

## Alert Thresholds

| Metric | Warning (Yellow) | Critical (Red) | Action |
|--------|-----------------|---------------|--------|
| First Cycle Completion Rate | <50% | <40% | Investigate onboarding friction |
| Weekly Discovery Cycles | 20% below target | 40% below target | Activate growth experiments |
| Monthly Churn Rate | >5% | >8% | Customer success outreach |
| AI Insight Acceptance | <50% | <40% | Review AI quality |
| Free → Pro Conversion | <3% | <2% | Test pricing/feature changes |

---

## Connecting NSM to Product Decisions

| Product Decision | Metric Impact | Priority |
|-----------------|--------------|----------|
| Simplify onboarding | ↑ First Cycle Completion Rate | P0 |
| Improve AI synthesis quality | ↑ AI Insight Acceptance Rate | P0 |
| Add Jira integration | ↑ D7 Retention, ↑ Engagement | P1 |
| Team collaboration features | ↑ Collaboration Rate → ↑ Expansion | P1 |
| Template library expansion | ↑ Cycles per Active User | P1 |
| Mobile experience | ↑ Discovery Streak | P2 |

---

*Dokumen ini dibuat menggunakan North Star Metric framework.*
*Terakhir diperbarui: April 2026*
