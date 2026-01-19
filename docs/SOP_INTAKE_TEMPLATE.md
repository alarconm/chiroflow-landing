# SOP Intake & Conversion Template
## Converting Human Procedures to Agent Instructions

---

## How to Use This Template

For each SOP document Kent provides:
1. Fill out the metadata section
2. Break down into discrete steps
3. Identify decision points
4. Map to automation potential
5. Note exceptions and edge cases

---

## SOP Metadata

| Field | Value |
|-------|-------|
| **SOP Title** | |
| **Category** | [ ] Billing [ ] AR [ ] Verification [ ] Front Desk [ ] Other |
| **Current Owner** | (Who does this task?) |
| **Frequency** | [ ] Daily [ ] Weekly [ ] Monthly [ ] As-needed |
| **Time per Execution** | _______ minutes |
| **Source Document** | (filename/location of Kent's original) |
| **Date Captured** | |
| **Captured By** | |

---

## Process Overview

### Purpose
*Why does this process exist? What business outcome does it achieve?*

```
[Write 1-2 sentences]
```

### Trigger
*What initiates this process?*

- [ ] Time-based (schedule): _______
- [ ] Event-based: _______
- [ ] Request-based: _______
- [ ] Other: _______

### Inputs Required
*What does the person need to start this task?*

| Input | Source | Format |
|-------|--------|--------|
| | | |
| | | |
| | | |

### Outputs Produced
*What is created/updated when this task is complete?*

| Output | Destination | Format |
|--------|-------------|--------|
| | | |
| | | |
| | | |

---

## Step-by-Step Breakdown

### Step 1: [Name]
**Action:** [What is done]
**System:** [Which software/tool is used]
**Decision Point:** [ ] Yes [ ] No

If yes, decision logic:
```
IF [condition] THEN [action A]
ELSE [action B]
```

**Automation Potential:** [ ] Full [ ] Partial [ ] Manual Only
**Notes:**

---

### Step 2: [Name]
**Action:** [What is done]
**System:** [Which software/tool is used]
**Decision Point:** [ ] Yes [ ] No

If yes, decision logic:
```
IF [condition] THEN [action A]
ELSE [action B]
```

**Automation Potential:** [ ] Full [ ] Partial [ ] Manual Only
**Notes:**

---

### Step 3: [Name]
**Action:** [What is done]
**System:** [Which software/tool is used]
**Decision Point:** [ ] Yes [ ] No

If yes, decision logic:
```
IF [condition] THEN [action A]
ELSE [action B]
```

**Automation Potential:** [ ] Full [ ] Partial [ ] Manual Only
**Notes:**

---

*(Copy and add more steps as needed)*

---

## Decision Tree

*For complex processes, map the decision flow:*

```
START
  │
  ▼
[Step 1]
  │
  ▼
[Decision?]──NO──► [Path A]
  │
  YES
  │
  ▼
[Step 2]
  │
  ▼
[Decision?]──NO──► [Path B]
  │
  YES
  │
  ▼
[Step 3]
  │
  ▼
END
```

---

## Exception Handling

### Known Exceptions

| Exception | How to Identify | Current Handling | Frequency |
|-----------|-----------------|------------------|-----------|
| | | | |
| | | | |
| | | | |

### Edge Cases

*Unusual situations that require special handling:*

1. **Case:**
   **Handling:**
   **Frequency:**

2. **Case:**
   **Handling:**
   **Frequency:**

---

## Automation Assessment

### Automation Readiness Score

| Criteria | Score (1-5) | Notes |
|----------|-------------|-------|
| Process is well-defined | | |
| Inputs are structured/digital | | |
| Decisions are rule-based | | |
| Exceptions are rare | | |
| No human judgment required | | |
| **Total** | **/25** | |

**Interpretation:**
- 20-25: Fully automatable
- 15-19: Mostly automatable with some human oversight
- 10-14: Partial automation, human-in-loop
- <10: Keep manual for now

### Recommended Automation Approach

- [ ] **Full Automation**: Agent handles end-to-end
- [ ] **Assisted Automation**: Agent does 80%, human reviews
- [ ] **Triggered Automation**: Human initiates, agent completes
- [ ] **Keep Manual**: Too complex or too rare to automate

### Required Integrations

| System | Integration Type | Complexity |
|--------|------------------|------------|
| | [ ] API [ ] Browser [ ] File | [ ] Easy [ ] Medium [ ] Hard |
| | [ ] API [ ] Browser [ ] File | [ ] Easy [ ] Medium [ ] Hard |
| | [ ] API [ ] Browser [ ] File | [ ] Easy [ ] Medium [ ] Hard |

---

## Agent Instructions Draft

*Translate this SOP into agent-readable instructions:*

```markdown
## Task: [SOP Title]

### Trigger
[When to execute]

### Prerequisites
- [What must be true before starting]
- [Required access/permissions]

### Steps
1. [Agent instruction 1]
2. [Agent instruction 2]
3. IF [condition]:
   - [Agent instruction 3a]
   ELSE:
   - [Agent instruction 3b]
4. [Agent instruction 4]

### Validation
- [ ] [Check 1]
- [ ] [Check 2]

### On Success
[What to do when complete]

### On Failure
[What to do if something goes wrong]

### Escalation
[When to involve a human]
```

---

## Quality Checklist

Before marking this SOP as "captured":

- [ ] All steps documented
- [ ] All decision points mapped
- [ ] All exceptions noted
- [ ] Systems/tools identified
- [ ] Time estimates included
- [ ] Automation potential assessed
- [ ] Agent instructions drafted
- [ ] Reviewed with Kent for accuracy

---

## Version History

| Date | Change | By |
|------|--------|-----|
| | Initial capture | |
| | | |

---

*Template Version 1.0 | ChiroFlow*
