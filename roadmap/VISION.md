# ChiroFlow Vision Document

## The Product

**ChiroFlow** is an AI-native, agentic-first practice management platform built specifically for small chiropractic businesses (1-3 providers, 1-15 staff). It's not just software with AI features bolted on—it's an **autonomous operations layer** where AI agents handle the back office while humans focus on patient care.

---

## The Problem

### The Small Practice Trap

Over 40,000 chiropractic practices in the US operate with 1-3 chiropractors. These practices face a brutal reality:

1. **Administrative Overload**: Practices lose 20-80 hours/month to routine tasks
2. **Software Fragmentation**: Average practice uses 4-7 different systems that don't talk to each other
3. **Cash Flow Bleeding**: 3%+ of insurance collections lost to delayed filing or rejected claims
4. **Retention Hemorrhaging**: Patient acquisition costs 5-25x more than retention, yet follow-up systems are broken
5. **Technology Hesitation**: Chiropractic profession historically underinvests in technology vs. other healthcare sectors

### The Current Software Landscape

| Software | Strength | Critical Gap |
|----------|----------|--------------|
| **ChiroTouch** | Market leader, AI SOAP notes | Expensive, complex, enterprise-focused |
| **ChiroFusion** | Affordable ($99-129/mo), integrated clearinghouse | Limited AI, basic automation |
| **Jane** | Beautiful UX, general wellness | Not chiropractic-specific, no billing depth |
| **zHealth** | Good documentation | Newer player, limited integrations |
| **Noterro** | Modern design, affordable | Missing advanced billing/claims |

**The Gap**: No one has built a platform that is:
- Truly **AI-native** (agents doing work, not just assisting)
- Designed for **small practices** (not scaled-down enterprise)
- **Agentic-first** (autonomous operations vs. human-assisted workflows)
- **2026-ready** (leveraging latest AI capabilities)

---

## The Solution: ChiroFlow

### Core Philosophy

> **"Your AI staff that never sleeps."**

ChiroFlow isn't software you use—it's a team of AI agents that work alongside your human staff:

| Agent | Role | Works On |
|-------|------|----------|
| **Intake Agent** | Handles new patient onboarding | Digital forms, insurance verification, eligibility |
| **Scheduling Agent** | Optimizes appointments | No-show prediction, waitlist management, recall |
| **Documentation Agent** | Creates clinical notes | Voice-to-SOAP, auto-coding, compliance checking |
| **Billing Agent** | Manages revenue cycle | Claims submission, denial management, payment posting |
| **Collections Agent** | Handles AR aging | Patient statements, follow-up sequences, payment plans |
| **Communication Agent** | Patient engagement | Reminders, birthday messages, reactivation campaigns |
| **Insights Agent** | Business intelligence | KPI tracking, anomaly detection, recommendations |
| **Marketing Agent** | Patient acquisition | Lead nurturing, referral programs, review requests |

### What Makes It Different

1. **Agentic Architecture**: Agents work autonomously with human oversight, not just AI-assisted tools
2. **Small Practice Economics**: Pricing that makes sense for 1-3 provider practices
3. **Everything Integrated**: One platform, one database, no sync issues
4. **HIPAA-Native**: Built for healthcare compliance from the foundation
5. **Learn From Your SOPs**: Upload your procedures, agents learn your way of working

---

## Feature Scope

### Module 1: Foundation & Platform
- Multi-tenant architecture (HIPAA-compliant)
- Role-based access control (providers, CAs, billers, admin)
- Audit logging for all actions
- SSO and 2FA authentication
- API-first design for extensibility

### Module 2: Patient Management
- Comprehensive patient profiles (demographics, insurance, history)
- Family/household linking
- Digital intake forms (customizable, pre-visit completion)
- Patient portal (appointments, forms, statements, messaging)
- Document storage (signed forms, X-rays, external records)

### Module 3: Scheduling & Calendar
- Multi-provider calendar with resource management
- Online self-scheduling (patient portal & website widget)
- Recurring appointments
- Waitlist management
- Room/equipment scheduling
- Block scheduling (new patients, adjustments, exams)

### Module 4: AI Scheduling Agent
- No-show prediction (ML model on patient history, weather, day patterns)
- Smart overbooking recommendations
- Automated recall sequences
- Reactivation campaigns for lapsed patients
- Optimal scheduling suggestions (reduce gaps, maximize revenue)

### Module 5: EHR & Clinical Documentation
- Chiropractic-specific SOAP notes
- Customizable templates and macros
- Body diagrams and spine charts
- Treatment plan creation and tracking
- Progress notes with outcome measures
- Integration with imaging (X-ray viewing)

### Module 6: AI Documentation Agent
- Voice-to-SOAP transcription
- Auto-population from intake forms and outcomes assessments
- AI-assisted CPT/ICD-10 code suggestions
- Compliance checking (medical necessity documentation)
- 15-second SOAP note generation (like ChiroTouch's Rheo)

### Module 7: Billing & Claims
- Superbill generation
- Electronic claim submission (837P)
- ERA/EOB posting (835)
- Real-time eligibility verification
- Integrated clearinghouse
- Patient statements and invoices
- Payment processing (credit cards, HSA, FSA)
- Care plans and package management

### Module 8: AI Billing Agent
- Automated claim scrubbing before submission
- Denial prediction and prevention
- Auto-appeal generation for common denials
- Payment posting from EOB PDFs (OCR + AI extraction)
- Claim status batch checking overnight
- Underpayment detection and appeal triggers

### Module 9: Collections & AR Management
- AR aging reports (30/60/90/120+ days)
- Automated patient collection sequences
- Insurance follow-up task queues
- Payment plan management
- Write-off workflows
- Collection agency integration

### Module 10: AI Collections Agent
- Predictive prioritization (which accounts to pursue first)
- Automated follow-up sequences (SMS, email, portal)
- Appeal letter generation
- Payment arrangement suggestions based on patient history
- Overnight claim status checks with morning summary

### Module 11: Patient Communication
- Two-way SMS messaging (HIPAA-compliant)
- Email campaigns
- Appointment reminders (customizable timing)
- Birthday/anniversary messages
- Educational content delivery
- Review request automation

### Module 12: AI Communication Agent
- 24/7 chatbot for patient inquiries (website, portal)
- Natural language appointment booking
- Insurance coverage Q&A
- Pre-visit instruction delivery
- Post-visit satisfaction surveys with sentiment analysis
- Intelligent escalation to human staff

### Module 13: Reporting & Analytics
- Real-time dashboard (visits, revenue, collections)
- Provider production reports
- KPI tracking (retention, no-shows, collections rate)
- Comparative analytics (vs. benchmarks, vs. previous periods)
- Custom report builder
- Scheduled report delivery

### Module 14: AI Insights Agent
- Anomaly detection (unusual patterns in data)
- Revenue opportunity identification
- Patient churn prediction
- Staff productivity analysis
- Actionable recommendations with one-click implementation
- Natural language querying ("How did we do last month?")

### Module 15: Inventory & Retail
- Supplement and product inventory
- Barcode scanning
- Low stock alerts
- Auto-reorder suggestions
- POS integration
- Sales reporting by product/category

### Module 16: Marketing & Patient Acquisition
- Referral program management
- Lead capture forms
- Automated lead nurturing sequences
- Google/Facebook review solicitation
- Campaign tracking and ROI measurement
- Landing page builder for promotions

### Module 17: AI Marketing Agent
- Automated A/B testing of messages
- Optimal send time prediction
- Referral opportunity identification
- Lapsed patient reactivation
- Review response drafting
- Social media content suggestions

### Module 18: Staff Management
- Employee profiles and credentials tracking
- Time clock / attendance
- Schedule management
- Commission/bonus calculation
- Training documentation
- HIPAA training tracking

### Module 19: Telehealth
- HIPAA-compliant video visits
- Virtual waiting room
- Screen sharing for exercises/education
- Visit documentation integration
- Telehealth billing codes

### Module 20: Multi-Location Management
- Centralized reporting across locations
- Location-based access controls
- Shared patient records (with consent)
- Consolidated billing
- Staff floating between locations

### Module 21: Integrations Hub
- QuickBooks / Xero (accounting)
- Stripe / Square (payments)
- Change Healthcare / Trizetto (clearinghouse)
- Google Calendar / Outlook
- Mailchimp / Constant Contact
- Zapier for custom workflows
- Open API for custom integrations

---

## Technical Architecture

### AI-Native Design Principles

1. **Agent-First**: Every workflow has an AI agent that can execute it autonomously
2. **Human-in-the-Loop**: Approval gates for sensitive actions (payments, clinical decisions)
3. **Learn & Adapt**: Agents improve from corrections and feedback
4. **Audit Everything**: Complete transparency on what agents did and why
5. **Graceful Degradation**: System works without AI; AI makes it 10x better

### Technology Stack (2026)

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | React/Next.js 15 | Modern, fast, accessible |
| Mobile | React Native | Cross-platform, code sharing |
| Backend | Node.js/Bun | Fast, TypeScript-native |
| Database | PostgreSQL + pgvector | Relational + embeddings |
| AI | Claude API (Anthropic) | Best reasoning, tool use |
| Voice | OpenAI Whisper / Deepgram | Speech-to-text |
| Search | Typesense/Meilisearch | Fast, typo-tolerant |
| Queue | BullMQ/Redis | Background job processing |
| Storage | S3-compatible | Document/image storage |
| Hosting | AWS/GCP HIPAA | Healthcare compliance |

### Agentic Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CHIROFLOW PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Intake  │ │Schedule │ │  Docs   │ │ Billing │ │ Comms   │  │
│  │  Agent  │ │  Agent  │ │  Agent  │ │  Agent  │ │  Agent  │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       │           │           │           │           │        │
│  ┌────▼───────────▼───────────▼───────────▼───────────▼────┐  │
│  │                   ORCHESTRATION LAYER                    │  │
│  │    (Task routing, approval gates, human handoffs)        │  │
│  └────┬────────────────────────────────────────────────┬───┘  │
│       │                                                 │      │
│  ┌────▼─────────────────────┐ ┌─────────────────────────▼──┐  │
│  │     CORE SERVICES        │ │      AI SERVICES           │  │
│  │  • Patient records       │ │  • LLM inference           │  │
│  │  • Scheduling engine     │ │  • Voice transcription     │  │
│  │  • Billing processor     │ │  • Document extraction     │  │
│  │  • Communication hub     │ │  • Predictive models       │  │
│  └──────────────────────────┘ └────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    DATA LAYER                             │  │
│  │   PostgreSQL │ Redis │ S3 │ Vector DB │ Audit Logs       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Business Model

### Pricing Philosophy

**Small practice friendly**: A 3-provider practice with $500K revenue should be able to afford ChiroFlow comfortably.

### Proposed Tiers

| Tier | Price | Target | Includes |
|------|-------|--------|----------|
| **Starter** | $199/mo | Solo practitioners | 1 provider, core features, basic AI |
| **Practice** | $399/mo | Small practices | 3 providers, full AI agents, marketing |
| **Growth** | $699/mo | Growing practices | 5 providers, multi-location, API |
| **Enterprise** | Custom | Chains/franchises | Unlimited, custom integrations, SLA |

### Value Capture

- **Time Savings**: 38+ hours/week of automated work = $79K+ annual value
- **Revenue Recovery**: 98% claim acceptance vs. 85% industry average
- **Retention Improvement**: 20%+ improvement in patient retention
- **ROI**: Target 5-10x ROI on subscription cost

---

## Competitive Positioning

### vs. ChiroTouch ($300-500+/mo)
- **ChiroFlow**: Same AI capabilities at 40-60% lower cost
- **ChiroFlow**: Modern cloud-native vs. legacy architecture
- **ChiroFlow**: Designed for small practices, not scaled-down enterprise

### vs. ChiroFusion ($99-299/mo)
- **ChiroFlow**: Agentic AI vs. basic automation
- **ChiroFlow**: Voice-to-SOAP, not just templates
- **ChiroFlow**: Predictive analytics vs. basic reporting

### vs. Jane ($74-399/mo)
- **ChiroFlow**: Chiropractic-specific vs. generic wellness
- **ChiroFlow**: Full billing/claims vs. basic invoicing
- **ChiroFlow**: AI agents vs. manual workflows

---

## Success Metrics

### Product Metrics
- SOAP note creation time < 30 seconds
- Claim acceptance rate > 98%
- Patient no-show rate reduction > 25%
- Daily active usage > 80% of staff

### Business Metrics
- 100 paying practices in Year 1
- $1M ARR milestone
- Net Revenue Retention > 110%
- NPS > 50

---

## What's NOT In Scope

To maintain focus, ChiroFlow will NOT build:

1. **X-ray analysis AI** - Leave to specialized radiology tools
2. **Clinical decision support** - Stay in administrative/operational lane
3. **Workers' comp case management** - Complex specialty, future consideration
4. **Personal injury attorney portal** - Niche, not core
5. **Franchise management** - Beyond small practice focus initially

---

## The Vision in One Sentence

> **ChiroFlow is the AI staff that handles your back office while you focus on your patients—built for small practices, priced for small practices, and designed to give every chiropractor the operational capabilities of a large clinic.**

---

## References

Research Sources:
- [Capterra Chiropractic Software](https://www.capterra.com/chiropractic-software/)
- [Software Advice Chiropractic Reviews](https://www.softwareadvice.com/medical/chiropractic-emr-billing-software-comparison/)
- [zHealth Emerging Trends 2026](https://myzhealth.io/infographic/top-10-emerging-trends-in-chiropractic-practice-for-2026/)
- [ChiroTouch AI Documentation](https://www.chirotouch.com/article/chiropractic-ai-documentation-audit-readiness)
- [Noterro AI in Chiropractic](https://www.noterro.com/blog/how-ai-is-shaping-the-future-of-chiropractic-health-management)
- [zHealth KPIs for Practice](https://myzhealth.io/blog/kpis-for-chiropractic-practice/)
- [ChiroTouch Financial Metrics](https://www.chirotouch.com/article/how-to-assess-financial-health-chiropractic-practice)
- [HIPAA Compliance Guide](https://myzhealth.io/blog/is-your-chiropractic-practice-completely-hipaa-compliant/)

---

*Document created: January 2026*
*Version: 1.0*
