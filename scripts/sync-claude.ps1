# Claude Code logs only exist on this machine, so this part runs locally (manually or via Task Scheduler).
# Pulls first so it never fights the daily GitHub Action, then refreshes docs/claude.json and the cards.
Set-Location (Split-Path $PSScriptRoot -Parent)
git pull --rebase --autostash
node scripts/claude-usage.mjs
node scripts/render.mjs
git add docs/claude.json assets
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m "chore: update Claude Code usage"; git push }
