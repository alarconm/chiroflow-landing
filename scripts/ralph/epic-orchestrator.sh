#!/bin/bash
# Epic Orchestrator - Runs Ralph through all epics in dependency order
# Usage: ./epic-orchestrator.sh [--start-from EPIC] [--max-iterations N] [--dry-run]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROADMAP_DIR="$PROJECT_ROOT/roadmap/epics"
MASTER_PRD="$PROJECT_ROOT/prd.json"
PROGRESS_FILE="$PROJECT_ROOT/progress.txt"
LOG_FILE="$PROJECT_ROOT/orchestrator.log"

# Defaults
START_FROM=""
MAX_ITERATIONS_PER_STORY=3
DRY_RUN=false

# Epic execution order (respecting dependencies)
EPIC_ORDER=(
    # Phase 1: Core EHR
    "07-billing-claims"
    "08-clearinghouse"
    "10-payment-processing"
    "14-patient-portal"
    "15-reporting"
    "17-inventory-pos"
    "18-marketing"

    # Phase 2: World-Class Features
    "19-chiropractic-clinical"
    "20-posture-analysis"
    "21-telehealth"
    "22-imaging"
    "23-patient-education"
    "24-wearables"
    "25-multi-location"
    "26-security"
    "27-mobile"

    # Phase 3: Agentic AI
    "30-ai-receptionist"
    "31-ai-billing-agent"
    "32-ai-documentation-agent"
    "33-ai-care-coordinator"
    "34-ai-insurance-agent"
    "35-ai-revenue-optimizer"
    "36-ai-quality-assurance"
    "37-ai-practice-growth"
    "38-ai-staff-training"
    "39-ai-clinical-decision"
    "40-ai-predictive-analytics"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $1" >> "$LOG_FILE"
}

print_color() {
    echo -e "${2}${1}${NC}"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --start-from)
            START_FROM="$2"
            shift 2
            ;;
        --max-iterations)
            MAX_ITERATIONS_PER_STORY="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Banner
cat << 'EOF'

================================================================================
  EPIC ORCHESTRATOR - ChiroFlow World-Class Build
================================================================================

EOF
echo "Total Epics: ${#EPIC_ORDER[@]}"
echo "Max iterations per story: $MAX_ITERATIONS_PER_STORY"
echo ""

# Helper functions
get_epic_prd() {
    echo "$ROADMAP_DIR/$1/prd.json"
}

epic_exists() {
    [[ -f "$(get_epic_prd $1)" ]]
}

get_story_count() {
    local prd=$(get_epic_prd $1)
    if [[ -f "$prd" ]]; then
        jq '.userStories | length' "$prd"
    else
        echo 0
    fi
}

get_incomplete_count() {
    local prd=$(get_epic_prd $1)
    if [[ -f "$prd" ]]; then
        jq '[.userStories[] | select(.passes != true)] | length' "$prd"
    else
        echo 0
    fi
}

is_epic_complete() {
    [[ $(get_incomplete_count $1) -eq 0 ]]
}

set_active_epic() {
    local epic=$1
    local epic_prd=$(get_epic_prd $epic)

    if [[ ! -f "$epic_prd" ]]; then
        print_color "ERROR: PRD not found for epic: $epic" "$RED"
        return 1
    fi

    # Backup current prd.json
    if [[ -f "$MASTER_PRD" ]]; then
        cp "$MASTER_PRD" "$PROJECT_ROOT/prd.json.backup"
    fi

    # Copy epic PRD to project root
    cp "$epic_prd" "$MASTER_PRD"
    log "Set active epic: $epic"
    return 0
}

save_epic_progress() {
    local epic=$1
    local epic_prd=$(get_epic_prd $epic)

    if [[ -f "$MASTER_PRD" ]]; then
        cp "$MASTER_PRD" "$epic_prd"
        log "Saved progress for epic: $epic"
    fi
}

run_ralph_for_epic() {
    local epic=$1
    local story_count=$(get_story_count $epic)
    local total_iterations=$((story_count * MAX_ITERATIONS_PER_STORY))

    print_color "\nRunning Ralph for $epic ($story_count stories, max $total_iterations iterations)..." "$CYAN"

    if $DRY_RUN; then
        print_color "[DRY RUN] Would run: ./ralph.sh $total_iterations" "$YELLOW"
        return 0
    fi

    cd "$SCRIPT_DIR"
    ./ralph.sh $total_iterations || true
    cd "$PROJECT_ROOT"

    # Save progress back
    save_epic_progress $epic
}

# Find starting index
start_index=0
if [[ -n "$START_FROM" ]]; then
    for i in "${!EPIC_ORDER[@]}"; do
        if [[ "${EPIC_ORDER[$i]}" == "$START_FROM" ]]; then
            start_index=$i
            break
        fi
    done
    print_color "Starting from epic: $START_FROM (index $start_index)" "$YELLOW"
fi

# Show epic status
print_color "\n=== Epic Status ===" "$CYAN"
total_stories=0
completed_stories=0
remaining_epics=()

for epic in "${EPIC_ORDER[@]}"; do
    if epic_exists "$epic"; then
        total=$(get_story_count $epic)
        incomplete=$(get_incomplete_count $epic)
        complete=$((total - incomplete))
        total_stories=$((total_stories + total))
        completed_stories=$((completed_stories + complete))

        if [[ $incomplete -eq 0 ]]; then
            print_color "  [DONE] $epic" "$GREEN"
        else
            print_color "  [$complete/$total] $epic" "$YELLOW"
            remaining_epics+=("$epic")
        fi
    else
        print_color "  [MISSING] $epic" "$RED"
    fi
done

echo ""
print_color "Total: $completed_stories/$total_stories stories complete" "$CYAN"
print_color "Remaining epics: ${#remaining_epics[@]}" "$YELLOW"

if $DRY_RUN; then
    print_color "\n[DRY RUN MODE - No changes will be made]" "$YELLOW"
fi

# Confirm
echo ""
read -p "Press Enter to start, or Ctrl+C to cancel..."

# Main loop
start_time=$(date +%s)
epics_processed=0
epics_failed=()

log "Orchestrator started. Processing $((${#EPIC_ORDER[@]} - start_index)) epics."

for ((i=start_index; i<${#EPIC_ORDER[@]}; i++)); do
    epic="${EPIC_ORDER[$i]}"
    epic_num=$((i + 1))

    echo ""
    print_color "================================================================" "$GREEN"
    print_color "  EPIC $epic_num/${#EPIC_ORDER[@]}: $epic" "$GREEN"
    print_color "================================================================" "$GREEN"

    # Check if exists
    if ! epic_exists "$epic"; then
        print_color "  Skipping - PRD not found" "$YELLOW"
        continue
    fi

    # Check if complete
    if is_epic_complete "$epic"; then
        print_color "  Already complete - Skipping" "$GREEN"
        continue
    fi

    # Set active
    if ! set_active_epic "$epic"; then
        epics_failed+=("$epic")
        continue
    fi

    # Run Ralph
    run_ralph_for_epic "$epic"
    epics_processed=$((epics_processed + 1))

    # Check completion
    if is_epic_complete "$epic"; then
        print_color "  [COMPLETE] $epic finished!" "$GREEN"
        log "Epic complete: $epic"

        if ! $DRY_RUN; then
            cd "$PROJECT_ROOT"
            git add -A
            git commit -m "feat: Complete $epic" || true
        fi
    else
        remaining=$(get_incomplete_count $epic)
        print_color "  [PARTIAL] $remaining stories remaining" "$YELLOW"
        epics_failed+=("$epic")
    fi
done

# Summary
end_time=$(date +%s)
duration=$((end_time - start_time))
hours=$((duration / 3600))
minutes=$(((duration % 3600) / 60))
seconds=$((duration % 60))

echo ""
print_color "================================================================" "$CYAN"
print_color "  ORCHESTRATOR COMPLETE" "$CYAN"
print_color "================================================================" "$CYAN"
echo "  Epics processed: $epics_processed"
echo "  Epics with issues: ${#epics_failed[@]}"
printf "  Total time: %02d:%02d:%02d\n" $hours $minutes $seconds

if [[ ${#epics_failed[@]} -gt 0 ]]; then
    print_color "\n  Epics needing attention:" "$YELLOW"
    for epic in "${epics_failed[@]}"; do
        remaining=$(get_incomplete_count $epic)
        echo "    - $epic ($remaining stories remaining)"
    done
fi

log "Orchestrator finished. Processed: $epics_processed, Failed: ${#epics_failed[@]}"
