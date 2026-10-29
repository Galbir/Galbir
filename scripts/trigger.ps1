# Starts the "update" workflow (GitHub's own cron is unreliable). Run hidden via hidden.vbs.
Set-Location (Split-Path $PSScriptRoot -Parent)
"--- $(Get-Date -Format s)" | Add-Content .cache\trigger.log
& 'C:\Program Files\GitHub CLI\gh.exe' workflow run update.yml --repo Galbir/Galbir 2>&1 | ForEach-Object { "$_" } | Add-Content .cache\trigger.log
exit 0
