# Ralph - Autonomous AI Builder for ChiroFlow

Ralph is an autonomous loop that runs Claude Code CLI repeatedly, implementing one user story at a time until all features are complete.

## Quick Start

```bash
# Run the full orchestrator (all 220 stories across 28 epics)
.\epic-orchestrator.ps1         # Windows
./epic-orchestrator.sh          # Mac/Linux

# Or run a single epic
cp roadmap/epics/19-chiropractic-clinical/prd.json prd.json
.\ralph.ps1 -MaxIterations 30   # Windows
./ralph.sh 30                   # Mac/Linux
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EPIC ORCHESTRATOR                               │
│   Processes 28 epics in dependency order                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │
│   │   Epic 07   │───▶│   Epic 08   │───▶│   Epic 10   │───▶ ...   │
│   │  Billing    │    │ Clearinghouse│    │  Payments   │           │
│   └─────────────┘    └─────────────┘    └─────────────┘           │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────────────────────────────────────────────────┐      │
│   │                     RALPH LOOP                          │      │
│   │  For each story in epic:                               │      │
│   │    1. Start fresh Claude Code session                  │      │
│   │    2. Load prompt.md with context                      │      │
│   │    3. Claude implements ONE story                      │      │
│   │    4. Updates prd.json passes: true                    │      │
│   │    5. Commits changes                                  │      │
│   │    6. Next iteration                                   │      │
│   └─────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `ralph.ps1` | Main Ralph loop (PowerShell) |
| `ralph.sh` | Main Ralph loop (Bash) |
| `epic-orchestrator.ps1` | Orchestrates all epics (PowerShell) |
| `epic-orchestrator.sh` | Orchestrates all epics (Bash) |
| `prompt.md` | Context prompt given to each Claude session |

## How It Works

### 1. Epic Orchestrator

The orchestrator processes epics in dependency order:

```
Phase 1: Core EHR (7 epics, 60 stories)
├── 07-billing-claims
├── 08-clearinghouse
├── 10-payment-processing
├── 14-patient-portal
├── 15-reporting
├── 17-inventory-pos
└── 18-marketing

Phase 2: World-Class Features (9 epics, 72 stories)
├── 19-chiropractic-clinical
├── 20-posture-analysis
├── 21-telehealth
├── 22-imaging
├── 23-patient-education
├── 24-wearables
├── 25-multi-location
├── 26-security
└── 27-mobile

Phase 3: Agentic AI (11 epics, 88 stories)
├── 30-ai-receptionist
├── 31-ai-billing-agent
├── 32-ai-documentation-agent
├── 33-ai-care-coordinator
├── 34-ai-insurance-agent
├── 35-ai-revenue-optimizer
├── 36-ai-quality-assurance
├── 37-ai-practice-growth
├── 38-ai-staff-training
├── 39-ai-clinical-decision
└── 40-ai-predictive-analytics
```

### 2. Ralph Loop

For each epic, Ralph:

1. **Copies** the epic's `prd.json` to project root
2. **Runs** Claude Code with `prompt.md` as input
3. **Claude** finds first story where `passes: false`
4. **Implements** that story following acceptance criteria
5. **Updates** `prd.json` to mark `passes: true`
6. **Commits** changes with `feat: [story-id] - [title]`
7. **Repeats** until all stories complete
8. **Saves** progress back to epic folder

### 3. Context Persistence

Each Claude session is fresh, but context persists via:

- **prd.json** - Which stories are done
- **progress.txt** - Log of completed work
- **Git history** - All code changes
- **prompt.md** - Project context and guidelines

## Usage

### Full Build (Recommended)

```powershell
# Windows - run everything
.\epic-orchestrator.ps1

# Start from a specific epic
.\epic-orchestrator.ps1 -StartFromEpic "30-ai-receptionist"

# Dry run to see what would happen
.\epic-orchestrator.ps1 -DryRun

# More iterations per story for complex features
.\epic-orchestrator.ps1 -MaxIterationsPerStory 5
```

```bash
# Mac/Linux - run everything
./epic-orchestrator.sh

# Start from a specific epic
./epic-orchestrator.sh --start-from "30-ai-receptionist"

# Dry run
./epic-orchestrator.sh --dry-run
```

### Single Epic

```powershell
# Windows
cp roadmap/epics/38-ai-staff-training/prd.json prd.json
.\ralph.ps1 -MaxIterations 30
```

```bash
# Mac/Linux
cp roadmap/epics/38-ai-staff-training/prd.json prd.json
./ralph.sh 30
```

### Resume After Failure

If Ralph stops mid-epic:

```powershell
# It auto-resumes from where it left off
.\epic-orchestrator.ps1

# Or manually continue a specific epic
.\ralph.ps1 -MaxIterations 50
```

## Prerequisites

1. **Claude Code CLI** installed:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Logged in** to Claude Code:
   ```bash
   claude login
   ```

3. **jq** installed (for bash scripts):
   ```bash
   # Mac
   brew install jq

   # Ubuntu/Debian
   apt install jq

   # Windows
   choco install jq
   ```

## Configuration

### Iterations Per Story

Default is 3 iterations per story. Increase for complex features:

```powershell
.\epic-orchestrator.ps1 -MaxIterationsPerStory 5
```

### Prompt Customization

Edit `prompt.md` to add:
- Additional project context
- Coding standards
- Specific patterns to follow

## Monitoring Progress

### Real-time

```bash
# Watch progress.txt
tail -f progress.txt

# Watch Ralph log
tail -f ralph.log

# Watch orchestrator log
tail -f orchestrator.log
```

### Check Status

```powershell
# See which stories are done in current epic
Get-Content prd.json | ConvertFrom-Json |
  Select -Expand userStories |
  Format-Table id, title, passes
```

```bash
# Bash equivalent
jq '.userStories[] | {id, title, passes}' prd.json
```

## Current Status

**Completed Epics (7):**
- 01-platform-foundation
- 02-patient-management
- 03-patient-scheduling
- 04-patient-intake-forms
- 05-ehr-soap-notes
- 06-ai-documentation
- 11-patient-communication

**Remaining: 220 stories across 28 epics**

See `roadmap/WORLD_CLASS_ROADMAP.md` for full breakdown.

## Troubleshooting

### Story Not Completing

1. Check `progress.txt` for errors
2. Increase iterations: `-MaxIterationsPerStory 5`
3. Review the story's acceptance criteria
4. Manually complete and mark `passes: true`

### Claude Session Hanging

1. Kill the process and restart
2. Ralph will resume from where it left off
3. Check if story requires human decision

### Git Conflicts

```bash
# If Ralph makes conflicting changes
git status
git diff
git checkout -- path/to/conflicting/file
```

### Claude CLI not found

```bash
npm install -g @anthropic-ai/claude-code
```

### API key not set

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
```

## Time Estimates

Based on ~3 minutes per story:

| Phase | Stories | Estimated Time |
|-------|---------|----------------|
| Phase 1 (Core) | 60 | ~3 hours |
| Phase 2 (World-Class) | 72 | ~3.5 hours |
| Phase 3 (AI Agents) | 88 | ~4.5 hours |
| **Total** | **220** | **~11 hours** |

*Actual time varies based on story complexity and iterations needed.*

## Exit Signals

Claude outputs these signals for Ralph to detect:

```
# All done
<promise>COMPLETE</promise>
EXIT_SIGNAL: true

# More work remaining
EXIT_SIGNAL: false
STORIES_REMAINING: 5
```

## PRD Structure

Each epic PRD follows this structure:

```json
{
  "branch": "feature/epic-name",
  "title": "Epic Title",
  "description": "What this epic does",
  "epic": "epic-folder-name",
  "dependencies": ["other-epics"],
  "userStories": [
    {
      "id": "US-XXX",
      "title": "Story title",
      "description": "What to implement",
      "acceptanceCriteria": [
        "Specific testable criterion 1",
        "Specific testable criterion 2"
      ],
      "priority": 1,
      "passes": false
    }
  ]
}
```

---

Built for ChiroFlow - World-Class Chiropractic EHR
