# Ralph - Autonomous AI Agent Loop for ChiroFlow (PowerShell Edition)
# Runs Claude Code repeatedly until all PRD items are complete.
# Each iteration is a fresh context - memory persists via git, progress.txt, and prd.json
#
# Usage: .\ralph.ps1 [iterations]
# Example: .\ralph.ps1 100

param(
    [int]$MaxIterations = 50,
    [switch]$NoExit,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$PrdFile = Join-Path $ProjectRoot "prd.json"
$ProgressFile = Join-Path $ProjectRoot "progress.txt"
$PromptFile = Join-Path $ScriptDir "prompt.md"
$ArchiveDir = Join-Path $ProjectRoot "archive"
$LogFile = Join-Path $ProjectRoot "ralph.log"

# Colors
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Banner
$banner = @"

======================================================================
  RALPH - ChiroFlow Autonomous Builder
  Max iterations: $MaxIterations
  Project: $ProjectRoot
======================================================================

"@
Write-ColorOutput $banner -Color Cyan

# Check prerequisites
Write-ColorOutput "Checking prerequisites..." -Color Yellow

# Check for Claude CLI
$claudePath = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudePath) {
    Write-ColorOutput "Error: Claude Code CLI not found." -Color Red
    Write-ColorOutput "Install with: npm install -g @anthropic-ai/claude-code" -Color Yellow
    exit 1
}
Write-ColorOutput "  [OK] Claude Code CLI found" -Color Green

# Check for prd.json
if (-not (Test-Path $PrdFile)) {
    Write-ColorOutput "Error: No prd.json found at $PrdFile" -Color Red
    exit 1
}
Write-ColorOutput "  [OK] prd.json found" -Color Green

# Check for prompt.md
if (-not (Test-Path $PromptFile)) {
    Write-ColorOutput "Error: prompt.md not found at $PromptFile" -Color Red
    exit 1
}
Write-ColorOutput "  [OK] prompt.md found" -Color Green

Write-Host ""

# Helper functions
function Get-PrdData {
    $content = Get-Content $PrdFile -Raw
    return $content | ConvertFrom-Json
}

function Get-Branch {
    $prd = Get-PrdData
    if ($prd.branch) { return $prd.branch }
    return "feature/chiroflow-complete"
}

function Get-Progress {
    $prd = Get-PrdData
    $total = $prd.userStories.Count
    $complete = ($prd.userStories | Where-Object { $_.passes -eq $true }).Count
    return "$complete/$total"
}

function Test-AllComplete {
    $prd = Get-PrdData
    $incomplete = ($prd.userStories | Where-Object { $_.passes -ne $true }).Count
    return $incomplete -eq 0
}

function Get-NextStory {
    $prd = Get-PrdData
    $next = $prd.userStories | Where-Object { $_.passes -ne $true } | Select-Object -First 1
    return $next
}

function Get-RemainingCount {
    $prd = Get-PrdData
    return ($prd.userStories | Where-Object { $_.passes -ne $true }).Count
}

# Archive previous run if branch changed
function Invoke-ArchiveIfNeeded {
    $lastBranchFile = Join-Path $ProjectRoot ".ralph-last-branch"
    $currentBranch = Get-Branch

    if (Test-Path $lastBranchFile) {
        $lastBranch = Get-Content $lastBranchFile -Raw
        $lastBranch = $lastBranch.Trim()

        if ($lastBranch -and $lastBranch -ne $currentBranch) {
            $date = Get-Date -Format "yyyy-MM-dd"
            $archiveName = "$date-$lastBranch"
            $archivePath = Join-Path $ArchiveDir $archiveName

            if (-not (Test-Path $ArchiveDir)) {
                New-Item -ItemType Directory -Path $ArchiveDir | Out-Null
            }

            New-Item -ItemType Directory -Path $archivePath -Force | Out-Null

            if (Test-Path $PrdFile) {
                Copy-Item $PrdFile $archivePath
            }
            if (Test-Path $ProgressFile) {
                Copy-Item $ProgressFile $archivePath
            }

            Write-ColorOutput "Archived previous run to: $archivePath" -Color Yellow

            # Clear progress for new branch
            if (Test-Path $ProgressFile) {
                Remove-Item $ProgressFile
            }
        }
    }

    # Save current branch
    $currentBranch | Out-File $lastBranchFile -NoNewline
}

# Log to file and console
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $LogFile -Value $logMessage
    if ($Verbose) {
        Write-Host $logMessage
    }
}

# Main loop
Invoke-ArchiveIfNeeded

Write-ColorOutput "Starting Ralph loop..." -Color Cyan
Write-ColorOutput "Total stories to complete: $(Get-RemainingCount)" -Color Yellow
Write-Log "Ralph started with max $MaxIterations iterations"

$startTime = Get-Date

for ($i = 1; $i -le $MaxIterations; $i++) {
    Write-Host ""
    Write-ColorOutput "===============================================================" -Color Green
    Write-ColorOutput "  Iteration $i of $MaxIterations | Progress: $(Get-Progress)" -Color Green

    $nextStory = Get-NextStory
    if ($nextStory) {
        Write-ColorOutput "  Epic: $($nextStory.epic)" -Color Cyan
        Write-ColorOutput "  Story: $($nextStory.id) - $($nextStory.title)" -Color Green
    }
    Write-ColorOutput "===============================================================" -Color Green

    # Check if already complete
    if (Test-AllComplete) {
        Write-Host ""
        Write-ColorOutput "[COMPLETE] ALL STORIES DONE! ChiroFlow is feature complete!" -Color Green
        $duration = (Get-Date) - $startTime
        Write-ColorOutput "Total time: $($duration.ToString('hh\:mm\:ss'))" -Color Cyan
        Write-Log "Ralph completed all stories in $i iterations"

        if (-not $NoExit) {
            exit 0
        }
        return
    }

    # Read the prompt
    $prompt = Get-Content $PromptFile -Raw

    # Run Claude Code with the prompt
    Write-ColorOutput "Starting Claude Code iteration..." -Color Blue
    Write-Log "Iteration $i started - Story: $($nextStory.id)"

    try {
        # Change to project directory for Claude
        Push-Location $ProjectRoot

        # Write prompt to temp file (more reliable than stdin piping on Windows)
        $tempPromptFile = Join-Path $env:TEMP "ralph-prompt-$i.txt"
        [System.IO.File]::WriteAllText($tempPromptFile, $prompt, [System.Text.Encoding]::UTF8)

        # Run Claude with --print and --dangerously-skip-permissions for autonomous operation
        # Use cmd.exe to pipe file contents to claude (more reliable on Windows)
        $output = & cmd /c "type `"$tempPromptFile`" | claude --print --dangerously-skip-permissions" 2>&1 | Out-String

        # Clean up temp file
        Remove-Item $tempPromptFile -ErrorAction SilentlyContinue

        Pop-Location

        # Dual-condition exit detection
        $hasCompletePromise = $output -match "<promise>COMPLETE</promise>"
        $hasExitSignalTrue = $output -match "EXIT_SIGNAL:\s*true"

        if ($hasCompletePromise -or $hasExitSignalTrue) {
            Write-Host ""
            Write-ColorOutput "[COMPLETE] All stories done! ChiroFlow is feature complete!" -Color Green
            $duration = (Get-Date) - $startTime
            Write-ColorOutput "Total time: $($duration.ToString('hh\:mm\:ss'))" -Color Cyan
            Write-Log "Ralph received completion signal at iteration $i"

            if (-not $NoExit) {
                exit 0
            }
            return
        }

        # Check for explicit EXIT_SIGNAL: false (work remaining, continue loop)
        if ($output -match "EXIT_SIGNAL:\s*false") {
            if ($output -match "STORIES_REMAINING:\s*(\d+)") {
                $remaining = $matches[1]
                Write-ColorOutput "  Stories remaining: $remaining" -Color Yellow
            }
        }

        # Log iteration complete
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $ProgressFile -Value "--- Iteration $i completed at $timestamp ---"
        Add-Content -Path $ProgressFile -Value "Story: $($nextStory.id) - $($nextStory.title)"
        Add-Content -Path $ProgressFile -Value ""
        Write-Log "Iteration $i completed"

    } catch {
        Write-ColorOutput "Error in iteration $i`: $_" -Color Red
        Write-Log "Error in iteration $i`: $_"
        Pop-Location -ErrorAction SilentlyContinue
        # Continue to next iteration despite error
    }

    # Brief pause between iterations
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-ColorOutput "Max iterations ($MaxIterations) reached. Run again to continue." -Color Yellow
Write-ColorOutput "Progress: $(Get-Progress)" -Color Cyan
Write-ColorOutput "Stories remaining: $(Get-RemainingCount)" -Color Yellow

$duration = (Get-Date) - $startTime
Write-ColorOutput "Total time: $($duration.ToString('hh\:mm\:ss'))" -Color Cyan
Write-Log "Ralph stopped at max iterations. Progress: $(Get-Progress)"

if (-not $NoExit) {
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
