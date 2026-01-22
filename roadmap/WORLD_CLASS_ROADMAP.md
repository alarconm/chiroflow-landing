# ChiroFlow World-Class Roadmap

## Total Scope: 220 User Stories across 28 Epics

### Phase 1: Core EHR Features (60 Stories)
*Already in master prd.json - Epics 07-18*

| Epic | Title | Stories | Status |
|------|-------|---------|--------|
| 07 | Billing & Claims | 12 | US-057 to US-068 |
| 08 | Clearinghouse Integration | 8 | US-069 to US-084 |
| 10 | Payment Processing | 8 | US-085 to US-092 |
| 14 | Patient Portal | 8 | US-093 to US-100 |
| 15 | Reporting & Analytics | 8 | US-101 to US-108 |
| 17 | Inventory & POS | 8 | US-109 to US-116 |
| 18 | Marketing & Referrals | 8 | US-117 to US-124 |

### Phase 2: World-Class Differentiators (72 Stories)
*Epics 19-27 - What makes ChiroFlow best-in-class*

| Epic | Title | Stories | Key Features |
|------|-------|---------|--------------|
| 19 | Chiropractic Clinical Intelligence | 8 | Subluxation tracking, technique library, vertebral listings |
| 20 | AI Posture & Movement Analysis | 8 | Photo-based posture analysis, ROM tracking, MediaPipe AI |
| 21 | Telehealth & Virtual Care | 8 | Video consultations, virtual waiting rooms, Twilio Video |
| 22 | Imaging & X-Ray Integration | 8 | DICOM viewer, Cobb angle tools, AI X-ray analysis |
| 23 | Patient Education & Home Care | 8 | Exercise library, home care instructions, progress tracking |
| 24 | Wearable & Device Integration | 8 | Apple Health, Google Fit, posture sensors |
| 25 | Multi-Location Enterprise | 8 | Multi-clinic management, consolidated reporting |
| 26 | Advanced Security & Compliance | 8 | MFA, encryption, BAA management, HIPAA |
| 27 | Mobile Applications | 8 | Native iOS/Android apps, offline mode, push notifications |

### Phase 3: Agentic AI Showcase (88 Stories)
*Epics 30-40 - Autonomous AI agents that run the practice*

| Epic | Title | Stories | AI Capabilities |
|------|-------|---------|-----------------|
| 30 | AI Receptionist Agent | 8 | 24/7 phone/chat, scheduling, FAQ |
| 31 | AI Billing Agent | 8 | Auto-submit claims, denial management, appeals |
| 32 | AI Documentation Agent | 8 | Real-time transcription, SOAP generation |
| 33 | AI Care Coordinator Agent | 8 | Treatment monitoring, engagement scoring |
| 34 | AI Insurance Agent | 8 | Eligibility verification, prior auth |
| 35 | AI Revenue Optimizer Agent | 8 | Leakage detection, fee optimization |
| 36 | AI Quality Assurance Agent | 8 | Documentation audits, compliance monitoring |
| 37 | AI Practice Growth Agent | 8 | Lead nurturing, reputation management |
| 38 | AI Staff Training Agent | 8 | **VIDEO PRACTICE with AI**, script training |
| 39 | AI Clinical Decision Support | 8 | Diagnosis suggestions, contraindication alerts |
| 40 | AI Predictive Analytics | 8 | Churn prediction, demand forecasting |

## PRD File Locations

All detailed PRDs with acceptance criteria are in:
```
roadmap/epics/
├── 07-billing-claims/prd.json
├── 08-clearinghouse/prd.json
├── 10-payment-processing/prd.json
├── 14-patient-portal/prd.json
├── 15-reporting/prd.json
├── 17-inventory-pos/prd.json
├── 18-marketing/prd.json
├── 19-chiropractic-clinical/prd.json
├── 20-posture-analysis/prd.json
├── 21-telehealth/prd.json
├── 22-imaging/prd.json
├── 23-patient-education/prd.json
├── 24-wearables/prd.json
├── 25-multi-location/prd.json
├── 26-security/prd.json
├── 27-mobile/prd.json
├── 30-ai-receptionist/prd.json
├── 31-ai-billing-agent/prd.json
├── 32-ai-documentation-agent/prd.json
├── 33-ai-care-coordinator/prd.json
├── 34-ai-insurance-agent/prd.json
├── 35-ai-revenue-optimizer/prd.json
├── 36-ai-quality-assurance/prd.json
├── 37-ai-practice-growth/prd.json
├── 38-ai-staff-training/prd.json
├── 39-ai-clinical-decision/prd.json
└── 40-ai-predictive-analytics/prd.json
```

## Highlight: AI Staff Training (Epic 38)

Per user request, this epic includes **AI video practice sessions** where staff:
- Practice customer interactions with AI playing patient/caller role
- Get real-time feedback on tone, empathy, script adherence
- Train on scheduling calls, billing questions, complaints
- Review recorded sessions with AI coaching
- Track improvement over time

## Running Ralph

To build these features autonomously:

```bash
# Run Ralph on a specific epic
cd scripts/ralph
./ralph.sh 10  # Run 10 iterations

# Or use the epic-specific PRD
cp roadmap/epics/38-ai-staff-training/prd.json ../../prd.json
./ralph.sh 20
```

## Technology Stack

- **Frontend**: Next.js 16, React, Tailwind CSS, shadcn/ui
- **Backend**: tRPC, Prisma, PostgreSQL
- **AI/ML**: OpenAI GPT-4, Whisper, MediaPipe, Twilio Voice
- **Video**: Twilio Video, WebRTC
- **Imaging**: Cornerstone.js (DICOM)
- **Mobile**: React Native
- **Integrations**: Apple Health, Google Fit, clearinghouses
