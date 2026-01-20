# ChiroFlow Epic Roadmap

## Overview

This roadmap breaks ChiroFlow into **18 epics** organized into **4 phases**. Each epic builds on previous ones, with clear dependencies.

---

## Phase 1: Foundation (Epics 01-04)
*The core platform that everything else builds on*

### Epic 01: Platform Foundation
**Priority**: P0 (Critical Path)
**Dependencies**: None
**Estimated Scope**: Large

Core infrastructure for the entire platform:
- Multi-tenant architecture (HIPAA-compliant)
- Authentication system (SSO, 2FA, role-based access)
- Database schema design
- API foundation (REST + GraphQL)
- Audit logging system
- Error handling and monitoring

**Why First**: Everything depends on this foundation.

---

### Epic 02: Patient Management Core
**Priority**: P0 (Critical Path)
**Dependencies**: Epic 01
**Estimated Scope**: Large

The heart of any practice management system:
- Patient profile CRUD
- Demographics, insurance, contacts
- Family/household linking
- Document storage
- Patient search (fuzzy, phonetic)
- Patient merge/deduplication

**Why Second**: Every other module references patients.

---

### Epic 03: Scheduling Engine
**Priority**: P0 (Critical Path)
**Dependencies**: Epic 01, Epic 02
**Estimated Scope**: Large

Appointment management is core to daily operations:
- Provider calendar management
- Appointment CRUD
- Recurring appointments
- Block scheduling
- Room/resource scheduling
- Waitlist management
- Calendar views (day, week, month)

**Why Third**: Scheduling is the backbone of practice operations.

---

### Epic 04: Digital Intake System
**Priority**: P1 (High)
**Dependencies**: Epic 01, Epic 02
**Estimated Scope**: Medium

Paperless patient onboarding:
- Form builder (drag-and-drop)
- Pre-built chiropractic templates
- E-signature capture
- Auto-populate patient record
- Kiosk mode for in-office
- Email/SMS form delivery

---

## Phase 2: Clinical & Billing (Epics 05-09)
*The revenue-generating core features*

### Epic 05: EHR & SOAP Notes
**Priority**: P0 (Critical Path)
**Dependencies**: Epic 02, Epic 03
**Estimated Scope**: Large

Clinical documentation:
- SOAP note creation
- Customizable templates
- Body diagrams/spine charts
- Treatment plan builder
- Progress notes
- Outcome assessments (PROMs)
- Visit linking to appointments

---

### Epic 06: AI Documentation Agent
**Priority**: P1 (High)
**Dependencies**: Epic 05
**Estimated Scope**: Large

AI-powered clinical documentation:
- Voice-to-SOAP transcription
- Auto-fill from intake forms
- CPT/ICD-10 code suggestions
- Medical necessity documentation
- Compliance checking
- Template learning from usage

---

### Epic 07: Billing & Claims Core
**Priority**: P0 (Critical Path)
**Dependencies**: Epic 02, Epic 05
**Estimated Scope**: Large

Revenue cycle management foundation:
- Superbill generation
- Charge capture
- CPT/ICD code management
- Fee schedule management
- Patient ledger
- Insurance policy management
- Claim generation (837P format)

---

### Epic 08: Clearinghouse Integration
**Priority**: P0 (Critical Path)
**Dependencies**: Epic 07
**Estimated Scope**: Medium

Electronic claims submission and remittance:
- Clearinghouse connection (Change Healthcare/Trizetto)
- Claim submission
- ERA/EOB processing (835)
- Eligibility verification (270/271)
- Claim status inquiry (276/277)
- Denial management workflow

---

### Epic 09: AI Billing Agent
**Priority**: P1 (High)
**Dependencies**: Epic 07, Epic 08
**Estimated Scope**: Large

Autonomous billing operations:
- Pre-submission claim scrubbing
- Denial prediction
- Auto-appeal generation
- EOB/remittance OCR extraction
- Automated payment posting
- Underpayment detection
- Overnight claim status checks

---

## Phase 3: Engagement & Automation (Epics 10-14)
*Patient engagement and operational automation*

### Epic 10: Payment Processing
**Priority**: P1 (High)
**Dependencies**: Epic 07
**Estimated Scope**: Medium

Accept payments and manage AR:
- Credit card processing (Stripe)
- HSA/FSA cards
- Patient statements
- Payment plans
- Auto-pay enrollment
- Refund processing
- QuickBooks sync

---

### Epic 11: Patient Communication Hub
**Priority**: P1 (High)
**Dependencies**: Epic 02, Epic 03
**Estimated Scope**: Medium

Multi-channel patient communication:
- Two-way SMS (HIPAA-compliant)
- Email templates and campaigns
- Appointment reminders
- Custom sequences
- Broadcast messaging
- Communication history

---

### Epic 12: AI Communication Agent
**Priority**: P2 (Medium)
**Dependencies**: Epic 11
**Estimated Scope**: Medium

Automated patient engagement:
- 24/7 chatbot (website, portal)
- Natural language booking
- Insurance FAQ answering
- Recall sequences
- Reactivation campaigns
- Sentiment analysis on feedback

---

### Epic 13: AI Scheduling Agent
**Priority**: P2 (Medium)
**Dependencies**: Epic 03, Epic 11
**Estimated Scope**: Medium

Intelligent scheduling optimization:
- No-show prediction model
- Smart overbooking
- Gap filling recommendations
- Optimal scheduling suggestions
- Automated recall sequences
- Provider utilization optimization

---

### Epic 14: Patient Portal
**Priority**: P1 (High)
**Dependencies**: Epic 02, Epic 03, Epic 04, Epic 10, Epic 11
**Estimated Scope**: Medium

Self-service patient experience:
- Appointment booking/management
- Form completion
- Statement viewing/payment
- Secure messaging
- Document downloads
- Treatment plan viewing

---

## Phase 4: Growth & Intelligence (Epics 15-18)
*Advanced features for scaling practices*

### Epic 15: Reporting & Analytics
**Priority**: P1 (High)
**Dependencies**: Epic 02, Epic 03, Epic 05, Epic 07
**Estimated Scope**: Medium

Business intelligence:
- Real-time dashboard
- Provider production reports
- Collections reports
- AR aging
- KPI tracking
- Custom report builder
- Scheduled report delivery

---

### Epic 16: AI Insights Agent
**Priority**: P2 (Medium)
**Dependencies**: Epic 15
**Estimated Scope**: Medium

Proactive business intelligence:
- Anomaly detection
- Revenue opportunity identification
- Churn prediction
- Benchmark comparisons
- Natural language querying
- Actionable recommendations

---

### Epic 17: Inventory & POS
**Priority**: P3 (Lower)
**Dependencies**: Epic 02, Epic 10
**Estimated Scope**: Medium

Product sales management:
- Product catalog
- Inventory tracking
- Barcode scanning
- Low stock alerts
- POS interface
- Sales reporting
- Vendor management

---

### Epic 18: Marketing & Referrals
**Priority**: P3 (Lower)
**Dependencies**: Epic 02, Epic 11, Epic 15
**Estimated Scope**: Medium

Patient acquisition and retention:
- Referral program management
- Lead capture forms
- Nurture sequences
- Review solicitation (Google, Yelp)
- Campaign tracking
- Landing page builder

---

## Epic Dependency Graph

```
                    ┌──────────────────┐
                    │  01: Foundation  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              │
    ┌─────────────┐  ┌─────────────┐       │
    │ 02: Patient │  │ 03: Schedule│       │
    └──────┬──────┘  └──────┬──────┘       │
           │                │              │
     ┌─────┴────┬───────────┼──────────────┤
     │          │           │              │
     ▼          ▼           ▼              │
┌────────┐ ┌────────┐ ┌──────────┐        │
│04:Intake│ │05: EHR │ │11: Comms │        │
└────────┘ └───┬────┘ └────┬─────┘        │
               │           │              │
          ┌────┴───┐  ┌────┴────┐         │
          │        │  │         │         │
          ▼        ▼  ▼         ▼         │
     ┌────────┐ ┌────────┐ ┌────────┐     │
     │06:AI Doc│ │07:Billing│ │12:AI Comm│    │
     └────────┘ └───┬────┘ └────────┘     │
                    │                     │
               ┌────┴────┬────────┐       │
               │         │        │       │
               ▼         ▼        ▼       │
          ┌────────┐ ┌────────┐ ┌────────┐
          │08:Clear│ │09:AI Bill│ │10:Pay │
          └────────┘ └────────┘ └────────┘
               │                    │
               └──────────┬─────────┘
                          ▼
                    ┌──────────┐
                    │14: Portal│
                    └──────────┘

        ┌────────────────────────────────┐
        │        15: Reporting           │
        └────────────────┬───────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │16:AI Ins│ │17:Invent│ │18:Market│
         └────────┘ └────────┘ └────────┘
```

---

## Implementation Timeline

### Milestone 1: MVP (Epics 01-05, 07-08)
**Goal**: Core practice management without AI

Features:
- Patient management
- Scheduling
- Digital intake
- Basic EHR/SOAP notes
- Billing & claims
- Clearinghouse integration

**Outcome**: Functional practice management system

---

### Milestone 2: AI Layer (Epics 06, 09)
**Goal**: Add AI agents for documentation and billing

Features:
- Voice-to-SOAP
- AI code suggestions
- Automated claim scrubbing
- EOB extraction
- Denial management

**Outcome**: Differentiated AI capabilities

---

### Milestone 3: Engagement (Epics 10-14)
**Goal**: Complete patient engagement suite

Features:
- Payment processing
- Patient portal
- Communication hub
- AI scheduling
- AI communication

**Outcome**: Full patient lifecycle management

---

### Milestone 4: Intelligence (Epics 15-18)
**Goal**: Business intelligence and growth tools

Features:
- Reporting dashboard
- AI insights
- Inventory/POS
- Marketing automation

**Outcome**: Complete platform

---

## Epic Status Tracking

| Epic | Name | Status | Dependencies Met |
|------|------|--------|------------------|
| 01 | Platform Foundation | Not Started | - |
| 02 | Patient Management | Not Started | Blocked by 01 |
| 03 | Scheduling Engine | Not Started | Blocked by 01, 02 |
| 04 | Digital Intake | Not Started | Blocked by 01, 02 |
| 05 | EHR & SOAP Notes | Not Started | Blocked by 02, 03 |
| 06 | AI Documentation | Not Started | Blocked by 05 |
| 07 | Billing & Claims | Not Started | Blocked by 02, 05 |
| 08 | Clearinghouse | Not Started | Blocked by 07 |
| 09 | AI Billing Agent | Not Started | Blocked by 07, 08 |
| 10 | Payment Processing | Not Started | Blocked by 07 |
| 11 | Communication Hub | Not Started | Blocked by 02, 03 |
| 12 | AI Communication | Not Started | Blocked by 11 |
| 13 | AI Scheduling | Not Started | Blocked by 03, 11 |
| 14 | Patient Portal | Not Started | Blocked by 02-04, 10-11 |
| 15 | Reporting | Not Started | Blocked by 02, 03, 05, 07 |
| 16 | AI Insights | Not Started | Blocked by 15 |
| 17 | Inventory & POS | Not Started | Blocked by 02, 10 |
| 18 | Marketing | Not Started | Blocked by 02, 11, 15 |

---

## Next Steps

1. **Review this roadmap** - Confirm epic scope and priorities
2. **Start Epic 01** - Platform Foundation
3. **Create detailed PRDs** - Break each epic into user stories

---

*Document created: January 2026*
*Version: 1.0*
