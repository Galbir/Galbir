# Claude Code logs only exist on this machine, so this part runs locally (manually or via Task Scheduler).
# Pulls first so it never fights the daily GitHub Action, then refreshes docs/claude.json and the cards.
# git writes progress to stderr; keep that from being treated as a PowerShell error.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
"--- $(Get-Date -Format s)"
git -c core.safecrlf=false pull --rebase --autostash 2>&1 | ForEach-Object { "$_" }
node scripts/claude-usage.mjs 2>&1 | ForEach-Object { "$_" }
node scripts/render.mjs 2>&1 | ForEach-Object { "$_" }
git -c core.safecrlf=false add docs/claude.json assets 2>&1 | Out-Null
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -q -m "chore: update Claude Code usage" 2>&1 | ForEach-Object { "$_" }
  git push -q 2>&1 | ForEach-Object { "$_" }
  "pushed"
} else { "nothing to commit" }
exit 0
