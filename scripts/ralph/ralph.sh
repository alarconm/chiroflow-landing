#!/bin/bash
# Ralph - Autonomous AI Agent Loop for ChiroFlow
# Runs Claude Code repeatedly until all PRD items are complete.
# Each iteration is a fresh context - memory persists via git, progress.txt, and prd.json
#
# Usage: ./ralph.sh [iterations]
# Example: ./ralph.sh 100

set -e

# Configuration
MAX_ITERATIONS=${1:-50}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Files
PRD_FILE="$PROJECT_ROOT/prd.json"
PROGRESS_FILE="$PROJECT_ROOT/progress.txt"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
ARCHIVE_DIR="$PROJECT_ROOT/archive"
LOG_FILE="$PROJECT_ROOT/ralph.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🏥 RALPH - ChiroFlow Autonomous Builder                      ║${NC}"
echo -e "${CYAN}║  Max iterations: $MAX_ITERATIONS                                           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"

# Check prerequisites
if ! command -v claude &> /dev/null; then
    echo -e "${RED}Error: Claude Code CLI not found. Install with: npm install -g @anthropic-ai/claude-code${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq not found. Install with your package manager.${NC}"
    exit 1
fi

if [ ! -f "$PRD_FILE" ]; then
    echo -e "${YELLOW}No prd.json found at $PRD_FILE${NC}"
    exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
    echo -e "${RED}Error: prompt.md not found at $PROMPT_FILE${NC}"
    exit 1
fi

# Get current branch from prd.json
get_branch() {
    jq -r '.branch // "feature/chiroflow-complete"' "$PRD_FILE"
}

# Archive previous run if branch changed
archive_if_needed() {
    local current_branch=$(get_branch)
    local last_branch=""

    if [ -f "$PROJECT_ROOT/.ralph-last-branch" ]; then
        last_branch=$(cat "$PROJECT_ROOT/.ralph-last-branch")
    fi

    if [ -n "$last_branch" ] && [ "$last_branch" != "$current_branch" ]; then
        local archive_name="$(date +%Y-%m-%d)-$last_branch"
        mkdir -p "$ARCHIVE_DIR/$archive_name"

        if [ -f "$PRD_FILE" ]; then
            cp "$PRD_FILE" "$ARCHIVE_DIR/$archive_name/"
        fi
        if [ -f "$PROGRESS_FILE" ]; then
            cp "$PROGRESS_FILE" "$ARCHIVE_DIR/$archive_name/"
        fi

        echo -e "${YELLOW}Archived previous run to: $ARCHIVE_DIR/$archive_name${NC}"
        rm -f "$PROGRESS_FILE"
    fi

    echo "$current_branch" > "$PROJECT_ROOT/.ralph-last-branch"
}

# Check if all stories are complete
all_complete() {
    local incomplete=$(jq '[.userStories[] | select(.passes != true)] | length' "$PRD_FILE")
    [ "$incomplete" -eq 0 ]
}

# Get progress summary
get_progress() {
    local total=$(jq '.userStories | length' "$PRD_FILE")
    local complete=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE")
    echo "$complete/$total"
}

# Get remaining count
get_remaining() {
    jq '[.userStories[] | select(.passes != true)] | length' "$PRD_FILE"
}

# Get next story info
get_next_story() {
    jq -r '.userStories[] | select(.passes != true) | "\(.id) - \(.title) [\(.epic)]"' "$PRD_FILE" | head -1
}

# Main loop
archive_if_needed

echo ""
echo -e "${CYAN}Total stories to complete: $(get_remaining)${NC}"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Ralph started with max $MAX_ITERATIONS iterations" >> "$LOG_FILE"

START_TIME=$(date +%s)

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Iteration $i of $MAX_ITERATIONS | Progress: $(get_progress)${NC}"
    echo -e "${CYAN}  Next: $(get_next_story)${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"

    # Check if already complete
    if all_complete; then
        echo -e "${GREEN}🎉 ALL STORIES COMPLETE! ChiroFlow is feature complete!${NC}"
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        echo -e "${CYAN}Total time: $(date -u -d @$DURATION +'%H:%M:%S')${NC}"
        exit 0
    fi

    # Read the prompt
    PROMPT=$(cat "$PROMPT_FILE")

    # Run Claude Code with the prompt
    echo -e "${BLUE}Starting Claude Code iteration...${NC}"

    cd "$PROJECT_ROOT"
    OUTPUT=$(echo "$PROMPT" | claude --print --dangerously-skip-permissions 2>&1) || true

    # Dual-condition exit detection
    HAS_COMPLETE=$(echo "$OUTPUT" | grep -c "<promise>COMPLETE</promise>" || true)
    HAS_EXIT_TRUE=$(echo "$OUTPUT" | grep -c "EXIT_SIGNAL: true" || true)

    if [ "$HAS_COMPLETE" -gt 0 ] || [ "$HAS_EXIT_TRUE" -gt 0 ]; then
        echo -e "${GREEN}🎉 COMPLETE signal received! ChiroFlow is feature complete!${NC}"
        exit 0
    fi

    # Check for stories remaining
    if echo "$OUTPUT" | grep -q "EXIT_SIGNAL: false"; then
        REMAINING=$(echo "$OUTPUT" | grep -oP "STORIES_REMAINING:\s*\K\d+" || echo "?")
        echo -e "${YELLOW}  Stories remaining: $REMAINING${NC}"
    fi

    # Log iteration
    echo "--- Iteration $i completed at $(date) ---" >> "$PROGRESS_FILE"

    # Brief pause between iterations
    sleep 3
done

echo -e "${YELLOW}Max iterations ($MAX_ITERATIONS) reached. Run again to continue.${NC}"
echo -e "Progress: $(get_progress)"
echo -e "Stories remaining: $(get_remaining)"
