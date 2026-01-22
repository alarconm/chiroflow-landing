# Epic Orchestrator - Runs Ralph through all epics in dependency order
# Usage: .\epic-orchestrator.ps1 [-StartFromEpic "19-chiropractic-clinical"] [-MaxIterationsPerStory 3]

param(
    [string]$StartFromEpic = "",
    [int]$MaxIterationsPerStory = 3,
    [switch]$DryRun,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RoadmapDir = Join-Path $ProjectRoot "roadmap\epics"
$MasterPrdFile = Join-Path $ProjectRoot "prd.json"
$ProgressFile = Join-Path $ProjectRoot "progress.txt"
$OrchestratorLog = Join-Path $ProjectRoot "orchestrator.log"

# Define epic execution order (respecting dependencies)
$EpicOrder = @(
    # Phase 1: Core EHR (already in master prd.json - can skip if done)
    "07-billing-claims",
    "08-clearinghouse",
    "10-payment-processing",
    "14-patient-portal",
    "15-reporting",
    "17-inventory-pos",
    "18-marketing",

    # Phase 2: World-Class Features
    "19-chiropractic-clinical",      # Depends on 05-ehr-soap-notes (done)
    "20-posture-analysis",           # Depends on 19
    "21-telehealth",                 # Depends on 03, 11 (done)
    "22-imaging",                    # Depends on 05 (done)
    "23-patient-education",          # Depends on 05, 14
    "24-wearables",                  # Depends on 02 (done)
    "25-multi-location",             # Depends on 01 (done)
    "26-security",                   # Depends on 01 (done)
    "27-mobile",                     # Depends on 14

    # Phase 3: Agentic AI
    "30-ai-receptionist",            # Depends on 03, 11 (done)
    "31-ai-billing-agent",           # Depends on 07, 08
    "32-ai-documentation-agent",     # Depends on 05, 06 (done)
    "33-ai-care-coordinator",        # Depends on 05, 11 (done)
    "34-ai-insurance-agent",         # Depends on 07, 08
    "35-ai-revenue-optimizer",       # Depends on 07, 15
    "36-ai-quality-assurance",       # Depends on 05, 07
    "37-ai-practice-growth",         # Depends on 18, 11 (done)
    "38-ai-staff-training",          # Depends on 01 (done)
    "39-ai-clinical-decision",       # Depends on 05, 19
    "40-ai-predictive-analytics"     # Depends on 15
)

# Colors
function Write-Color {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $OrchestratorLog -Value $logMessage
    if ($Verbose) { Write-Host $logMessage }
}

# Banner
$banner = @"

================================================================================
  EPIC ORCHESTRATOR - ChiroFlow World-Class Build
  Total Epics: $($EpicOrder.Count)
  Max iterations per story: $MaxIterationsPerStory
================================================================================

"@
Write-Color $banner -Color Cyan

# Get epic PRD path
function Get-EpicPrdPath {
    param([string]$Epic)
    return Join-Path $RoadmapDir "$Epic\prd.json"
}

# Check if epic PRD exists
function Test-EpicExists {
    param([string]$Epic)
    $prdPath = Get-EpicPrdPath $Epic
    return Test-Path $prdPath
}

# Get story count for epic
function Get-EpicStoryCount {
    param([string]$Epic)
    $prdPath = Get-EpicPrdPath $Epic
    if (-not (Test-Path $prdPath)) { return 0 }
    $prd = Get-Content $prdPath -Raw | ConvertFrom-Json
    return $prd.userStories.Count
}

# Get incomplete story count
function Get-IncompleteCount {
    param([string]$Epic)
    $prdPath = Get-EpicPrdPath $Epic
    if (-not (Test-Path $prdPath)) { return 0 }
    $prd = Get-Content $prdPath -Raw | ConvertFrom-Json
    return ($prd.userStories | Where-Object { $_.passes -ne $true }).Count
}

# Check if epic is complete
function Test-EpicComplete {
    param([string]$Epic)
    return (Get-IncompleteCount $Epic) -eq 0
}

# Copy epic PRD to project root
function Set-ActiveEpic {
    param([string]$Epic)
    $epicPrd = Get-EpicPrdPath $Epic

    if (-not (Test-Path $epicPrd)) {
        Write-Color "ERROR: PRD not found for epic: $Epic" -Color Red
        return $false
    }

    # Backup current prd.json if exists
    if (Test-Path $MasterPrdFile) {
        $backupPath = Join-Path $ProjectRoot "prd.json.backup"
        Copy-Item $MasterPrdFile $backupPath -Force
    }

    # Copy epic PRD to project root
    Copy-Item $epicPrd $MasterPrdFile -Force
    Write-Log "Set active epic: $Epic"
    return $true
}

# Save epic PRD back from project root
function Save-EpicProgress {
    param([string]$Epic)
    $epicPrd = Get-EpicPrdPath $Epic

    if (Test-Path $MasterPrdFile) {
        Copy-Item $MasterPrdFile $epicPrd -Force
        Write-Log "Saved progress for epic: $Epic"
    }
}

# Run Ralph for current epic
function Invoke-RalphForEpic {
    param(
        [string]$Epic,
        [int]$MaxIterations
    )

    $storyCount = Get-EpicStoryCount $Epic
    $totalIterations = $storyCount * $MaxIterationsPerStory

    Write-Color "`nRunning Ralph for $Epic ($storyCount stories, max $totalIterations iterations)..." -Color Cyan

    if ($DryRun) {
        Write-Color "[DRY RUN] Would run: .\ralph.ps1 -MaxIterations $totalIterations" -Color Yellow
        return $true
    }

    Push-Location $ScriptDir
    try {
        & .\ralph.ps1 -MaxIterations $totalIterations -NoExit
        $success = $LASTEXITCODE -eq 0
    } catch {
        Write-Color "Ralph error: $_" -Color Red
        $success = $false
    }
    Pop-Location

    # Save progress back to epic PRD
    Save-EpicProgress $Epic

    return $success
}

# Find starting index
$startIndex = 0
if ($StartFromEpic) {
    $startIndex = $EpicOrder.IndexOf($StartFromEpic)
    if ($startIndex -lt 0) {
        Write-Color "ERROR: Epic '$StartFromEpic' not found in order list" -Color Red
        exit 1
    }
    Write-Color "Starting from epic: $StartFromEpic (index $startIndex)" -Color Yellow
}

# Show epic status
Write-Color "`n=== Epic Status ===" -Color Cyan
$totalStories = 0
$completedStories = 0
$remainingEpics = @()

foreach ($epic in $EpicOrder) {
    $exists = Test-EpicExists $epic
    $total = Get-EpicStoryCount $epic
    $incomplete = Get-IncompleteCount $epic
    $complete = $total - $incomplete
    $totalStories += $total
    $completedStories += $complete

    if ($exists) {
        $status = if ($incomplete -eq 0) { "[DONE]" } else { "[$complete/$total]" }
        $color = if ($incomplete -eq 0) { "Green" } else { "Yellow" }
        Write-Color "  $status $epic" -Color $color

        if ($incomplete -gt 0) {
            $remainingEpics += $epic
        }
    } else {
        Write-Color "  [MISSING] $epic" -Color Red
    }
}

Write-Color "`nTotal: $completedStories/$totalStories stories complete" -Color Cyan
Write-Color "Remaining epics: $($remainingEpics.Count)" -Color Yellow

if ($DryRun) {
    Write-Color "`n[DRY RUN MODE - No changes will be made]" -Color Magenta
}

# Confirm before starting
Write-Host "`nPress Enter to start, or Ctrl+C to cancel..."
$null = Read-Host

# Main orchestration loop
$startTime = Get-Date
$epicsProcessed = 0
$epicsFailed = @()

Write-Log "Orchestrator started. Processing $($EpicOrder.Count - $startIndex) epics."

for ($i = $startIndex; $i -lt $EpicOrder.Count; $i++) {
    $epic = $EpicOrder[$i]
    $epicNum = $i + 1

    Write-Host "`n"
    Write-Color "================================================================" -Color Green
    Write-Color "  EPIC $epicNum/$($EpicOrder.Count): $epic" -Color Green
    Write-Color "================================================================" -Color Green

    # Check if exists
    if (-not (Test-EpicExists $epic)) {
        Write-Color "  Skipping - PRD not found" -Color Yellow
        continue
    }

    # Check if already complete
    if (Test-EpicComplete $epic) {
        Write-Color "  Already complete - Skipping" -Color Green
        continue
    }

    # Set as active epic
    if (-not (Set-ActiveEpic $epic)) {
        Write-Color "  Failed to set active epic" -Color Red
        $epicsFailed += $epic
        continue
    }

    # Run Ralph
    $success = Invoke-RalphForEpic -Epic $epic
    $epicsProcessed++

    if (-not $success) {
        Write-Color "  Epic may not be complete - check progress" -Color Yellow
    }

    # Check completion
    if (Test-EpicComplete $epic) {
        Write-Color "  [COMPLETE] $epic finished!" -Color Green
        Write-Log "Epic complete: $epic"

        # Git commit for epic completion
        if (-not $DryRun) {
            Push-Location $ProjectRoot
            & git add -A
            & git commit -m "feat: Complete $epic"
            Pop-Location
        }
    } else {
        $remaining = Get-IncompleteCount $epic
        Write-Color "  [PARTIAL] $remaining stories remaining" -Color Yellow
        $epicsFailed += $epic
    }
}

# Summary
$duration = (Get-Date) - $startTime
Write-Host "`n"
Write-Color "================================================================" -Color Cyan
Write-Color "  ORCHESTRATOR COMPLETE" -Color Cyan
Write-Color "================================================================" -Color Cyan
Write-Color "  Epics processed: $epicsProcessed" -Color White
Write-Color "  Epics with issues: $($epicsFailed.Count)" -Color $(if ($epicsFailed.Count -gt 0) { "Yellow" } else { "Green" })
Write-Color "  Total time: $($duration.ToString('hh\:mm\:ss'))" -Color White

if ($epicsFailed.Count -gt 0) {
    Write-Color "`n  Epics needing attention:" -Color Yellow
    foreach ($epic in $epicsFailed) {
        $remaining = Get-IncompleteCount $epic
        Write-Color "    - $epic ($remaining stories remaining)" -Color Yellow
    }
}

Write-Log "Orchestrator finished. Processed: $epicsProcessed, Failed: $($epicsFailed.Count)"
