---
title: "GitHub profile stats generator (heatmap, churn, languages)"
author: GALBIR
date: 2026-10-29
branch: master
cost: { minutes: 5, tokens: 40718 }
touches:
  - ".github/workflows/update.yml"
  - README.md
  - assets/activity-dark.svg
  - assets/activity-light.svg
  - assets/churn-dark.svg
  - assets/churn-light.svg
  - assets/languages-dark.svg
  - assets/languages-light.svg
  - scripts/fetch.mjs
  - scripts/render.mjs
---

## Decided
- Project lives in C:\Users\Dell\galbir-profile (local git, 1 commit). Node-only, no deps: scripts/fetch.mjs (GraphQL calendar per year + REST stats/contributors + languages, aggregate-only into data.json, gitignored) and scripts/render.mjs (themed SVGs dark/light into assets/). README uses <picture> for theme switching; .github/workflows/update.yml runs daily.
- Stats are aggregates only: nearly all of the user's repos are private (client projects), so no repo names ever go in output.
- Sqrt scale on the churn chart so one huge week does not flatten the rest.

## Tried and ruled out
- Per-repo breakdowns or top-repos card: would leak private client project names.
- Single label() helper with extra attrs string: produced duplicate SVG attributes (invalid XML); replaced with an options object.

## Watch out
- Nothing is published yet. Waiting on the user to choose: public vs private Galbir/Galbir repo, and token for the STATS_TOKEN secret (gh token vs dedicated PAT). Default GITHUB_TOKEN cannot read other private repos.
- Lines added/removed include lockfiles and generated files, so they are inflated.
- Preview: Edge headless screenshot of .cache/preview.html (msedge at Program Files (x86)).
