# ChiroFlow Agent Architecture
## AI-Native Multi-Agent System Design

*"The company that runs itself, maintained by humans"*

---

## Design Philosophy

### Core Principles

1. **Agents as Employees, Not Tools**
   - Each agent has a role, responsibilities, and autonomy
   - They communicate, hand off work, and escalate issues
   - Humans manage outcomes, not tasks

2. **Memory is Everything**
   - Every interaction teaches the system
   - Customer preferences, edge cases, solutions - all remembered
   - The system gets smarter with every practice onboarded

3. **Tools Over Training**
   - Give agents tools, not fine-tuned knowledge
   - MCP servers for real-time capabilities
   - Swap better models instantly without retraining

4. **Composition Over Monoliths**
   - Small, focused agents that do one thing well
   - Orchestration layer coordinates
   - Add/remove capabilities without breaking others

5. **Human-in-the-Loop by Default**
   - Agents propose, humans approve (initially)
   - Trust increases over time per customer
   - Always auditable, always reversible

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CHIROFLOW AGENT SWARM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         HUMAN LAYER                                  │   │
│  │  Mike (CEO) ←→ Kent (Domain Expert) ←→ Customers                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↕                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ORCHESTRATION LAYER                              │   │
│  │                                                                      │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │   │
│  │  │   QUEEN     │←──→│   MEMORY    │←──→│   ROUTER    │              │   │
│  │  │ Orchestrator│    │   CORTEX    │    │   Agent     │              │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘              │   │
│  │         ↕                  ↕                  ↕                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↕                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      SPECIALIST AGENTS                               │   │
│  │                                                                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │  INTAKE  │ │ BILLING  │ │   AR     │ │ VERIFY   │ │ REPORTS  │  │   │
│  │  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  │                                                                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ CUSTOMER │ │  SALES   │ │ CONTENT  │ │   DEV    │ │    QA    │  │   │
│  │  │ SUCCESS  │ │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↕                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         TOOL LAYER (MCP)                             │   │
│  │                                                                      │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │   │
│  │  │Browser │ │  EHR   │ │Billing │ │ Email  │ │  CRM   │ │  Docs  │ │   │
│  │  │  MCP   │ │  MCP   │ │  MCP   │ │  MCP   │ │  MCP   │ │  MCP   │ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↕                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       PERSISTENCE LAYER                              │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  PostgreSQL │  │   Qdrant    │  │    Redis    │  │ S3/Minio   │ │   │
│  │  │  (State)    │  │ (Vectors)   │  │  (Queue)    │  │ (Files)    │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Definitions

### Tier 1: Orchestration Agents

#### QUEEN - Master Orchestrator
```yaml
name: queen
model: claude-sonnet-4-20250514
role: Central coordinator and decision maker
responsibilities:
  - Route incoming work to appropriate agents
  - Coordinate multi-agent workflows
  - Escalate to humans when needed
  - Monitor system health and performance
  - Make strategic decisions about task priority

tools:
  - agent_dispatch      # Spawn and manage other agents
  - memory_cortex       # Read/write shared memory
  - approval_gate       # Request human approval
  - schedule            # Manage task timing
  - notify              # Alert humans

system_prompt: |
  You are the Queen - the central orchestrator for ChiroFlow's agent swarm.
  Your job is to understand incoming requests, route them to the right
  specialist agents, coordinate complex workflows, and ensure quality.

  You have access to all customer context via the Memory Cortex.
  You can spawn specialist agents and monitor their work.

  CRITICAL: For any action that affects customer data or money,
  require human approval through the approval_gate tool.

  Your goal is to make ChiroFlow run autonomously while maintaining
  perfect quality and compliance.
```

#### MEMORY CORTEX - Unified Memory System
```yaml
name: memory_cortex
type: service  # Not an LLM agent, a service layer
responsibilities:
  - Maintain unified memory across all agents
  - Store and retrieve customer context
  - Track learned patterns and solutions
  - Manage conversation history
  - Index SOPs and procedures

storage:
  short_term: redis           # Current session, hot context
  working: postgresql         # Active tasks, state machines
  long_term: qdrant           # Embeddings, semantic search
  procedural: filesystem      # SOPs, workflows, skills

api:
  remember(fact, context, importance)
  recall(query, context, limit)
  learn(pattern, outcome, confidence)
  forget(fact_id, reason)  # GDPR compliance
  search_similar(embedding, threshold)
```

#### ROUTER - Intelligent Task Router
```yaml
name: router
model: claude-haiku-4-20250514  # Fast, cheap for routing
role: Classify and route incoming requests
responsibilities:
  - Parse incoming messages/events
  - Classify intent and urgency
  - Route to appropriate specialist
  - Handle simple queries directly

tools:
  - classify             # ML classification
  - memory_cortex        # Context lookup
  - agent_handoff        # Transfer to specialist

routing_rules:
  - pattern: "EOB|payment posting|remittance"
    agent: billing_agent
    priority: high

  - pattern: "AR|aging|outstanding|collections"
    agent: ar_agent
    priority: high

  - pattern: "eligibility|verification|insurance check"
    agent: verify_agent
    priority: medium

  - pattern: "report|summary|analytics"
    agent: reports_agent
    priority: low

  - pattern: "help|question|how do I"
    agent: customer_success_agent
    priority: medium

  - pattern: "bug|error|broken|not working"
    agent: dev_agent
    priority: high
    escalate: true
```

---

### Tier 2: Operations Agents (Revenue Generating)

#### BILLING AGENT - Payment Posting & Claims
```yaml
name: billing_agent
model: claude-sonnet-4-20250514
role: Process EOBs and post payments
responsibilities:
  - Parse EOB documents (PDF, 835 files)
  - Extract payment information
  - Post to practice management system
  - Flag discrepancies for review
  - Track claim status

tools:
  - browser_mcp          # Navigate EHR/billing systems
  - document_parser      # OCR and structured extraction
  - ehr_mcp              # Direct EHR integration (when available)
  - memory_cortex        # Customer-specific rules
  - approval_gate        # Confirm before posting

workflows:
  eob_processing:
    1. receive_eob(document)
    2. parse_and_extract(document) → payments[]
    3. for each payment:
       a. lookup_patient(payment.patient_id)
       b. lookup_claim(payment.claim_id)
       c. calculate_adjustment(payment, claim)
       d. if adjustment > threshold: request_approval()
       e. post_payment(payment)
       f. update_patient_balance()
    4. generate_summary()
    5. notify_completion()

learning:
  # System learns payer-specific patterns
  - payer_adjustment_codes: "Learn which codes mean what per payer"
  - denial_patterns: "Recognize common denial reasons"
  - posting_rules: "Customer-specific posting preferences"

metrics:
  - payments_posted_per_hour
  - accuracy_rate
  - exceptions_flagged
  - time_to_post
```

#### AR AGENT - Accounts Receivable Management
```yaml
name: ar_agent
model: claude-sonnet-4-20250514
role: Manage aging receivables and collections
responsibilities:
  - Monitor AR aging buckets
  - Identify claims needing follow-up
  - Generate collection workflows
  - Track payer performance
  - Suggest write-offs

tools:
  - browser_mcp          # Access billing systems
  - ehr_mcp              # Pull AR reports
  - email_mcp            # Send follow-up notices
  - phone_mcp            # (Future) Automated calls
  - memory_cortex        # Patient/payer history

workflows:
  daily_ar_review:
    1. pull_aging_report()
    2. segment_by_bucket(30, 60, 90, 120+)
    3. for each bucket:
       a. prioritize_by_value()
       b. check_payer_patterns()
       c. generate_action_plan()
    4. execute_follow_ups()
    5. update_tracking()
    6. report_to_queen()

  claim_follow_up:
    1. lookup_claim_history(claim_id)
    2. check_payer_portal(claim_id)
    3. determine_issue(denial, pending, lost)
    4. if correctable: resubmit_claim()
    5. if appeal_needed: prepare_appeal()
    6. if write_off_candidate: flag_for_review()

intelligence:
  - Learns which payers are slow vs problematic
  - Identifies patterns in denials by CPT code
  - Predicts likelihood of collection by age
```

#### VERIFY AGENT - Insurance Eligibility
```yaml
name: verify_agent
model: claude-sonnet-4-20250514
role: Verify insurance eligibility and benefits
responsibilities:
  - Batch eligibility verification
  - Check benefits and coverage
  - Identify authorization requirements
  - Update patient records
  - Flag coverage issues before appointments

tools:
  - browser_mcp          # Payer portals
  - clearinghouse_mcp    # Real-time eligibility APIs
  - ehr_mcp              # Update patient records
  - calendar_mcp         # Check upcoming appointments

workflows:
  daily_batch_verify:
    1. get_tomorrow_appointments()
    2. for each patient:
       a. check_last_verification_date()
       b. if stale: verify_eligibility()
       c. compare_to_file(current_insurance)
       d. if changed: update_record()
       e. if issue: flag_for_front_desk()
    3. generate_verification_report()

  real_time_verify:
    1. receive_verification_request(patient_id)
    2. lookup_insurance(patient_id)
    3. query_clearinghouse(payer, subscriber_id)
    4. parse_response()
    5. update_patient_record()
    6. return_summary()
```

#### REPORTS AGENT - Analytics & Reporting
```yaml
name: reports_agent
model: claude-sonnet-4-20250514
role: Generate reports and analytics
responsibilities:
  - Daily/weekly/monthly reports
  - Production and collection analysis
  - Provider performance tracking
  - Custom report generation
  - Trend analysis and forecasting

tools:
  - ehr_mcp              # Pull report data
  - database_mcp         # Direct SQL queries
  - visualization        # Generate charts
  - email_mcp            # Distribute reports
  - memory_cortex        # Historical comparisons

report_types:
  daily_summary:
    metrics:
      - charges_entered
      - payments_posted
      - adjustments_made
      - claims_submitted
      - ar_change
    delivery: email, dashboard

  weekly_production:
    metrics:
      - production_by_provider
      - collection_rate
      - denial_rate
      - ar_aging_trend
    delivery: email, dashboard

  monthly_executive:
    metrics:
      - revenue_trend
      - expense_analysis
      - profitability_by_service
      - payer_mix_analysis
      - forecast_next_month
    delivery: email, presentation
```

---

### Tier 3: Business Operations Agents

#### CUSTOMER SUCCESS AGENT
```yaml
name: customer_success_agent
model: claude-sonnet-4-20250514
role: Support customers and ensure satisfaction
responsibilities:
  - Answer customer questions
  - Onboard new practices
  - Monitor customer health
  - Gather feedback
  - Identify upsell opportunities

tools:
  - email_mcp            # Respond to inquiries
  - memory_cortex        # Customer context
  - documentation        # Link to help articles
  - calendar_mcp         # Schedule calls
  - crm_mcp              # Update customer records

workflows:
  ticket_response:
    1. receive_ticket(email/chat)
    2. classify_intent()
    3. lookup_customer_context()
    4. if simple_question: answer_directly()
    5. if technical_issue: handoff_to_dev_agent()
    6. if billing_issue: handoff_to_billing_agent()
    7. log_interaction()
    8. check_satisfaction()

  health_monitoring:
    1. daily: check_all_customers()
    2. for each customer:
       a. check_automation_success_rate()
       b. check_login_activity()
       c. check_support_tickets()
       d. calculate_health_score()
    3. flag_at_risk_customers()
    4. suggest_interventions()
```

#### SALES AGENT
```yaml
name: sales_agent
model: claude-sonnet-4-20250514
role: Generate and nurture leads
responsibilities:
  - Research prospects
  - Personalize outreach
  - Qualify leads
  - Schedule demos
  - Track pipeline

tools:
  - browser_mcp          # Research prospects
  - email_mcp            # Outreach campaigns
  - linkedin_mcp         # Social selling
  - crm_mcp              # Pipeline management
  - calendar_mcp         # Book demos
  - memory_cortex        # Prospect intelligence

workflows:
  prospect_research:
    1. receive_lead(practice_name, source)
    2. research_practice():
       - website, reviews, social media
       - practice size, specialties
       - current software (if visible)
       - pain points (from reviews)
    3. create_prospect_profile()
    4. personalize_outreach_template()
    5. queue_for_campaign()

  nurture_sequence:
    day_1: personalized_intro_email
    day_3: value_content_share
    day_7: case_study_email
    day_14: soft_ask_for_call
    day_21: final_attempt
    ongoing: monthly_newsletter
```

#### CONTENT AGENT
```yaml
name: content_agent
model: claude-sonnet-4-20250514
role: Create marketing and educational content
responsibilities:
  - Blog posts and articles
  - Social media content
  - Email newsletters
  - Case studies
  - Documentation

tools:
  - browser_mcp          # Research topics
  - image_gen            # Create visuals
  - memory_cortex        # Brand voice, past content
  - cms_mcp              # Publish to website
  - social_mcp           # Post to social media

content_calendar:
  weekly:
    - 2x LinkedIn posts (tips, insights)
    - 1x blog post (SEO, educational)
    - 1x email newsletter segment
  monthly:
    - 1x case study or success story
    - 1x industry analysis
    - 1x product update announcement
```

---

### Tier 4: Internal Operations Agents

#### DEV AGENT
```yaml
name: dev_agent
model: claude-sonnet-4-20250514
role: Build and maintain the platform
responsibilities:
  - Implement new features
  - Fix bugs
  - Create integrations
  - Optimize performance
  - Code review

tools:
  - filesystem           # Read/write code
  - bash                 # Execute commands
  - git                  # Version control
  - browser_mcp          # Test UIs
  - database_mcp         # Schema changes

workflows:
  feature_development:
    1. receive_spec(feature_request)
    2. analyze_requirements()
    3. design_solution()
    4. request_approval(design)
    5. implement_code()
    6. write_tests()
    7. submit_for_qa()
    8. deploy_to_staging()
    9. monitor_for_issues()

  bug_fix:
    1. receive_bug_report()
    2. reproduce_issue()
    3. identify_root_cause()
    4. implement_fix()
    5. verify_fix()
    6. deploy_hotfix()
    7. notify_reporter()
```

#### QA AGENT
```yaml
name: qa_agent
model: claude-sonnet-4-20250514
role: Ensure quality and compliance
responsibilities:
  - Test automations before deployment
  - Audit outputs for accuracy
  - HIPAA compliance checks
  - Security monitoring
  - Performance testing

tools:
  - browser_mcp          # UI testing
  - database_mcp         # Data validation
  - filesystem           # Log analysis
  - security_scanner     # Vulnerability checks
  - compliance_checker   # HIPAA audit

workflows:
  automation_qa:
    1. receive_automation(workflow_id)
    2. run_test_cases(workflow_id)
    3. validate_outputs()
    4. check_edge_cases()
    5. verify_compliance()
    6. generate_report()
    7. approve_or_reject()

  daily_compliance_audit:
    1. check_access_logs()
    2. verify_encryption()
    3. audit_data_access()
    4. check_retention_policies()
    5. generate_compliance_report()
```

---

## MCP Server Architecture

### Core MCP Servers

```typescript
// mcp-servers/browser/index.ts
// Chrome automation for any web-based system
{
  name: "browser-mcp",
  tools: [
    "navigate",
    "click",
    "type",
    "screenshot",
    "read_page",
    "execute_js",
    "wait_for",
    "extract_table"
  ],
  config: {
    headless: true,
    proxy: "rotating",  // Avoid detection
    session_persistence: true
  }
}

// mcp-servers/ehr/index.ts
// Unified interface for EHR systems
{
  name: "ehr-mcp",
  supported_systems: [
    "chirotouch",
    "genesis",
    "jane",
    "zhealth",
    "chirospring"
  ],
  tools: [
    "get_patient",
    "search_patients",
    "get_appointments",
    "get_claims",
    "post_payment",
    "update_patient",
    "get_ar_aging",
    "submit_claim"
  ],
  adapters: {
    // Each EHR gets an adapter that normalizes to common interface
    chirotouch: "adapters/chirotouch.ts",
    genesis: "adapters/genesis.ts",
    // ...
  }
}

// mcp-servers/clearinghouse/index.ts
// Insurance eligibility and claims
{
  name: "clearinghouse-mcp",
  providers: ["availity", "trizetto", "office_ally"],
  tools: [
    "verify_eligibility",
    "submit_claim",
    "check_claim_status",
    "get_era",
    "get_denial_reasons"
  ]
}

// mcp-servers/email/index.ts
// Email operations
{
  name: "email-mcp",
  providers: ["gmail", "outlook", "generic_imap"],
  tools: [
    "send_email",
    "read_inbox",
    "search_emails",
    "get_attachments",
    "create_draft",
    "reply_to"
  ]
}

// mcp-servers/documents/index.ts
// Document processing
{
  name: "documents-mcp",
  tools: [
    "parse_pdf",
    "parse_image",
    "extract_table",
    "extract_form_fields",
    "convert_835_to_json",  // EDI parsing
    "convert_837_to_json"
  ],
  engines: {
    ocr: "tesseract",
    pdf: "pdf.js",
    edi: "custom_parser"
  }
}

// mcp-servers/memory/index.ts
// Unified memory interface
{
  name: "memory-mcp",
  tools: [
    "remember",
    "recall",
    "search",
    "forget",
    "get_context",
    "update_entity",
    "get_relationships"
  ],
  backends: {
    graph: "postgresql",
    vectors: "qdrant",
    cache: "redis"
  }
}
```

### Customer-Specific MCP Instances

```yaml
# Each customer gets configured MCP servers
customer_123:
  ehr_mcp:
    system: chirotouch
    credentials: vault://customer_123/chirotouch
    base_url: https://customer123.chirotouch.cloud

  email_mcp:
    provider: gmail
    credentials: vault://customer_123/gmail

  clearinghouse_mcp:
    provider: office_ally
    credentials: vault://customer_123/office_ally
```

---

## Agent SDK Implementation

### Base Agent Class

```typescript
// lib/agents/base-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { MCPClient } from "@modelcontextprotocol/sdk";

interface AgentConfig {
  name: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  mcpServers: string[];
  maxTurns?: number;
  approvalRequired?: string[];
}

class BaseAgent {
  private client: Anthropic;
  private config: AgentConfig;
  private mcpClients: Map<string, MCPClient>;
  private memory: MemoryCortex;

  constructor(config: AgentConfig) {
    this.client = new Anthropic();
    this.config = config;
    this.mcpClients = new Map();
    this.memory = new MemoryCortex();
  }

  async initialize() {
    // Connect to MCP servers
    for (const server of this.config.mcpServers) {
      const client = await MCPClient.connect(server);
      this.mcpClients.set(server, client);
    }

    // Load context from memory
    await this.loadContext();
  }

  async run(task: Task): Promise<AgentResult> {
    const messages = [
      { role: "user", content: task.prompt }
    ];

    let turns = 0;
    const maxTurns = this.config.maxTurns || 20;

    while (turns < maxTurns) {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 4096,
        system: this.buildSystemPrompt(task),
        tools: await this.getTools(),
        messages
      });

      // Check for completion
      if (response.stop_reason === "end_turn") {
        return this.extractResult(response);
      }

      // Process tool calls
      if (response.stop_reason === "tool_use") {
        const toolResults = await this.executeTools(response, task);
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });
      }

      turns++;
    }

    throw new Error("Max turns exceeded");
  }

  private async executeTools(response: any, task: Task) {
    const results = [];

    for (const block of response.content) {
      if (block.type === "tool_use") {
        // Check if approval required
        if (this.requiresApproval(block.name, block.input)) {
          const approved = await this.requestApproval(block, task);
          if (!approved) {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "Action not approved by human reviewer"
            });
            continue;
          }
        }

        // Execute tool via MCP
        const result = await this.executeTool(block.name, block.input);

        // Learn from result
        await this.memory.learn({
          action: block.name,
          input: block.input,
          result: result,
          context: task.context
        });

        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      }
    }

    return results;
  }

  private async requestApproval(toolCall: any, task: Task): Promise<boolean> {
    // Send to approval queue
    const approval = await ApprovalGate.request({
      agent: this.config.name,
      action: toolCall.name,
      input: toolCall.input,
      context: task.context,
      customer: task.customerId
    });

    return approval.approved;
  }
}
```

### Specialist Agent Example

```typescript
// lib/agents/billing-agent.ts
import { BaseAgent } from "./base-agent";

const BILLING_AGENT_CONFIG = {
  name: "billing_agent",
  model: "claude-sonnet-4-20250514",
  systemPrompt: `You are the Billing Agent for ChiroFlow, responsible for
processing EOBs and posting payments to practice management systems.

Your core responsibilities:
1. Parse EOB documents to extract payment information
2. Match payments to existing claims in the EHR
3. Post payments with proper adjustments
4. Flag discrepancies for human review
5. Track your work for audit purposes

CRITICAL RULES:
- ALWAYS verify patient and claim before posting
- NEVER post without proper matching
- Flag any adjustment over $500 for review
- Document every action in the audit log

You have access to:
- browser_mcp: Navigate EHR systems
- documents_mcp: Parse PDFs and images
- memory_mcp: Customer-specific rules and history
- approval_gate: Request human approval when needed`,

  tools: [
    "parse_eob",
    "search_patient",
    "search_claim",
    "post_payment",
    "flag_discrepancy",
    "log_action"
  ],

  mcpServers: [
    "browser-mcp",
    "documents-mcp",
    "memory-mcp"
  ],

  approvalRequired: [
    "post_payment:amount>500",
    "write_off",
    "adjustment:amount>100"
  ]
};

class BillingAgent extends BaseAgent {
  constructor() {
    super(BILLING_AGENT_CONFIG);
  }

  async processEOB(eobDocument: Document, customerId: string) {
    return this.run({
      prompt: `Process this EOB document and post payments:

Document ID: ${eobDocument.id}
Document Type: ${eobDocument.type}
Customer: ${customerId}

Steps:
1. Parse the EOB to extract all payment information
2. For each payment line:
   - Find the matching patient in the EHR
   - Find the matching claim
   - Calculate any adjustments
   - Post the payment
3. Generate a summary of actions taken

If you encounter any issues or discrepancies, flag them for review.`,
      context: {
        customerId,
        documentId: eobDocument.id
      },
      customerId
    });
  }
}
```

### Queen Orchestrator

```typescript
// lib/agents/queen.ts
import { BaseAgent } from "./base-agent";
import { BillingAgent } from "./billing-agent";
import { ARAgent } from "./ar-agent";
import { VerifyAgent } from "./verify-agent";
// ... other agents

class QueenOrchestrator extends BaseAgent {
  private agents: Map<string, BaseAgent>;

  constructor() {
    super({
      name: "queen",
      model: "claude-sonnet-4-20250514",
      systemPrompt: QUEEN_SYSTEM_PROMPT,
      tools: ["dispatch_agent", "get_status", "escalate", "schedule"],
      mcpServers: ["memory-mcp"]
    });

    this.agents = new Map([
      ["billing", new BillingAgent()],
      ["ar", new ARAgent()],
      ["verify", new VerifyAgent()],
      ["reports", new ReportsAgent()],
      ["customer_success", new CustomerSuccessAgent()],
      // ...
    ]);
  }

  async handleEvent(event: SystemEvent) {
    // Route based on event type
    const routing = await this.classifyAndRoute(event);

    if (routing.parallel) {
      // Execute multiple agents in parallel
      const results = await Promise.all(
        routing.agents.map(agentName =>
          this.agents.get(agentName)?.run(routing.tasks[agentName])
        )
      );
      return this.aggregateResults(results);
    } else {
      // Sequential execution
      const agent = this.agents.get(routing.agent);
      return agent?.run(routing.task);
    }
  }

  async dailyOperations(customerId: string) {
    // Orchestrate daily workflow for a customer
    const workflow = [
      { agent: "verify", task: "batch_eligibility_check" },
      { agent: "billing", task: "process_pending_eobs" },
      { agent: "ar", task: "daily_ar_review" },
      { agent: "reports", task: "daily_summary" }
    ];

    const results = [];
    for (const step of workflow) {
      const agent = this.agents.get(step.agent);
      const result = await agent?.run({
        prompt: `Execute ${step.task} for customer ${customerId}`,
        customerId
      });
      results.push(result);

      // Check for issues that need escalation
      if (result.issues?.length > 0) {
        await this.escalate(result.issues, customerId);
      }
    }

    return results;
  }
}
```

---

## Memory Architecture

### Unified Memory Schema

```sql
-- PostgreSQL schema for agent memory

-- Entities (patients, payers, claims, etc.)
CREATE TABLE entities (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Facts about entities
CREATE TABLE facts (
  id UUID PRIMARY KEY,
  entity_id UUID REFERENCES entities(id),
  fact_type VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0,
  source VARCHAR(100),
  learned_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Relationships between entities
CREATE TABLE relationships (
  id UUID PRIMARY KEY,
  from_entity UUID REFERENCES entities(id),
  to_entity UUID REFERENCES entities(id),
  relationship_type VARCHAR(100) NOT NULL,
  attributes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Learned patterns
CREATE TABLE patterns (
  id UUID PRIMARY KEY,
  customer_id UUID,
  pattern_type VARCHAR(100) NOT NULL,
  pattern_data JSONB NOT NULL,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  confidence FLOAT GENERATED ALWAYS AS (
    success_count::float / NULLIF(success_count + failure_count, 0)
  ) STORED,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit log
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY,
  agent_name VARCHAR(100) NOT NULL,
  customer_id UUID,
  action_type VARCHAR(100) NOT NULL,
  input JSONB,
  output JSONB,
  status VARCHAR(20),
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX idx_entities_customer ON entities(customer_id);
CREATE INDEX idx_facts_entity ON facts(entity_id);
CREATE INDEX idx_patterns_customer ON patterns(customer_id);
CREATE INDEX idx_actions_customer ON agent_actions(customer_id);
```

### Vector Storage (Qdrant)

```typescript
// lib/memory/vectors.ts

interface VectorCollections {
  // SOPs and procedures
  procedures: {
    embedding: float[1536],
    payload: {
      customer_id: string,
      title: string,
      content: string,
      category: string,
      version: number
    }
  },

  // Past interactions and solutions
  interactions: {
    embedding: float[1536],
    payload: {
      customer_id: string,
      query: string,
      solution: string,
      outcome: "success" | "failure",
      agent: string
    }
  },

  // Customer context
  customer_context: {
    embedding: float[1536],
    payload: {
      customer_id: string,
      fact_type: string,
      fact: string,
      importance: number
    }
  }
}

// Semantic search for similar situations
async function findSimilarSolutions(
  query: string,
  customerId: string
): Promise<Solution[]> {
  const embedding = await embed(query);

  const results = await qdrant.search("interactions", {
    vector: embedding,
    filter: {
      must: [
        { key: "customer_id", match: { value: customerId } },
        { key: "outcome", match: { value: "success" } }
      ]
    },
    limit: 5
  });

  return results.map(r => r.payload as Solution);
}
```

---

## Deployment Architecture

```yaml
# docker-compose.yml

version: '3.8'

services:
  # Core API
  api:
    build: ./api
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - qdrant
      - redis

  # Queen Orchestrator (always running)
  queen:
    build: ./agents/queen
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - API_URL=http://api:3000
    depends_on:
      - api

  # Agent Worker Pool
  workers:
    build: ./agents/worker
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
    deploy:
      replicas: 3
    depends_on:
      - redis
      - api

  # MCP Servers
  browser-mcp:
    build: ./mcp-servers/browser
    environment:
      - DISPLAY=:99
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix

  # Databases
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=chiroflow
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  qdrant:
    image: qdrant/qdrant
    volumes:
      - qdrant_data:/qdrant/storage

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  qdrant_data:
  redis_data:
```

---

## Future-Proofing: Riding the AI Wave

### Model Upgrade Path

```typescript
// lib/config/models.ts

// Central model configuration - change once, update everywhere
export const MODEL_CONFIG = {
  // Orchestration (needs best reasoning)
  orchestrator: "claude-sonnet-4-20250514",

  // Specialists (balance of cost/capability)
  specialist: "claude-sonnet-4-20250514",

  // Routing/classification (fast, cheap)
  router: "claude-haiku-4-20250514",

  // Embedding
  embedding: "text-embedding-3-large",

  // Vision (for document processing)
  vision: "claude-sonnet-4-20250514"
};

// When Claude 5 drops, change ONE file:
// orchestrator: "claude-5-opus-20260601"
// specialist: "claude-5-sonnet-20260601"
// etc.
```

### Capability Evolution

```
2026 Q1 (NOW)
├── Browser automation for all EHRs
├── Document parsing (EOBs, statements)
├── Email-based workflows
└── Human approval for all actions

2026 Q2
├── Direct API integrations (ChiroTouch, Jane)
├── Voice agents for phone follow-up
├── Reduced approval thresholds (trust earned)
└── Predictive analytics

2026 Q3
├── Patient communication (appointment reminders)
├── Multi-location coordination
├── Real-time claim status monitoring
└── Autonomous exception handling

2026 Q4
├── Full autonomous operations (select customers)
├── Cross-customer learning (anonymized)
├── Proactive revenue optimization
└── Self-improving workflows
```

### The Flywheel Effect

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE CHIROFLOW FLYWHEEL                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│         ┌──────────────┐                                        │
│         │  More SOPs   │                                        │
│         │  Processed   │                                        │
│         └──────┬───────┘                                        │
│                │                                                │
│                ▼                                                │
│    ┌───────────────────────┐                                    │
│    │  Smarter Agents       │◄────────────────┐                  │
│    │  (learned patterns)   │                 │                  │
│    └───────────┬───────────┘                 │                  │
│                │                             │                  │
│                ▼                             │                  │
│    ┌───────────────────────┐                 │                  │
│    │  Better Automations   │                 │                  │
│    │  (higher accuracy)    │                 │                  │
│    └───────────┬───────────┘                 │                  │
│                │                             │                  │
│                ▼                             │                  │
│    ┌───────────────────────┐                 │                  │
│    │  Happier Customers    │                 │                  │
│    │  (more referrals)     │                 │                  │
│    └───────────┬───────────┘                 │                  │
│                │                             │                  │
│                ▼                             │                  │
│    ┌───────────────────────┐                 │                  │
│    │  More Customers       │─────────────────┘                  │
│    │  (more data)          │                                    │
│    └───────────────────────┘                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Every new customer makes the system smarter.
Every SOP processed becomes reusable.
Every edge case solved is solved forever.
```

---

## Summary

This architecture is designed to:

1. **Scale with AI improvements** - Swap models, add capabilities, no rewrites
2. **Learn continuously** - Every interaction makes the system smarter
3. **Run autonomously** - Humans approve, agents execute
4. **Stay compliant** - Full audit trail, HIPAA-ready
5. **Grow efficiently** - Same infrastructure, more customers

**Cost to run at scale:**
- 100 customers: ~$2K/month infrastructure + ~$3K/month AI APIs = **$5K/month**
- That's **$50/customer/month** in COGS
- At **$500/customer/month** revenue = **90% gross margin**

This is the playbook. Let's build it.

---

*Document Version: 1.0*
*Last Updated: January 2026*
