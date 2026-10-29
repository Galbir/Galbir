// Collects aggregate-only stats (no repo names) into data.json.
// Needs a token with `repo` scope: GH_TOKEN env var, or `gh auth token` locally.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'Galbir';
const TOKEN = process.env.GH_TOKEN || execSync('gh auth token').toString().trim();
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'profile-stats', Accept: 'application/vnd.github+json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (path) => {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`https://api.github.com${path}`, { headers: H });
    if (res.status === 202) { await sleep(2500); continue; } // stats still computing
    if (res.status === 204 || res.status === 409) return null; // empty repo
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }
  return null;
};
const gql = async (query) => {
  const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query }) });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
};

// ---- contribution calendar, one query per year (API limit: 1 year/span)
const { user } = await gql(`{ user(login:"${LOGIN}"){ createdAt } }`);
const firstYear = new Date(user.createdAt).getUTCFullYear();
const nowYear = new Date().getUTCFullYear();
const days = {};
const years = {};
for (let y = firstYear; y <= nowYear; y++) {
  const d = await gql(`{ user(login:"${LOGIN}"){ contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z"){
    contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }`);
  const cal = d.user.contributionsCollection.contributionCalendar;
  years[y] = cal.totalContributions;
  for (const w of cal.weeks) for (const x of w.contributionDays) if (x.date.startsWith(String(y))) days[x.date] = x.contributionCount;
}

// ---- repos (owned + collaborator + org), churn per week, languages
const repos = [];
for (let p = 1; ; p++) {
  const page = await rest(`/user/repos?per_page=100&page=${p}&affiliation=owner,collaborator,organization_member`);
  repos.push(...page);
  if (page.length < 100) break;
}
const churn = {}; // weekStart(unix) -> {a,d,c}
const langs = {};
let commits = 0, added = 0, deleted = 0, active = 0;
for (const r of repos) {
  if (r.fork || r.archived && false) continue;
  const stats = await rest(`/repos/${r.full_name}/stats/contributors`);
  const mine = Array.isArray(stats) && stats.find((s) => s.author?.login?.toLowerCase() === LOGIN.toLowerCase());
  if (mine) {
    active++;
    for (const w of mine.weeks) {
      if (!w.a && !w.d && !w.c) continue;
      const k = (churn[w.w] ||= { a: 0, d: 0, c: 0 });
      k.a += w.a; k.d += w.d; k.c += w.c;
      added += w.a; deleted += w.d; commits += w.c;
    }
    const l = await rest(`/repos/${r.full_name}/languages`);
    for (const [k, v] of Object.entries(l || {})) langs[k] = (langs[k] || 0) + v;
  }
  process.stderr.write('.');
}
process.stderr.write('\n');

writeFileSync('data.json', JSON.stringify({
  login: LOGIN, generatedAt: new Date().toISOString(), createdAt: user.createdAt,
  days, years, churn, langs, totals: { commits, added, deleted, repos: active },
}));
console.log({ repos: repos.length, active, commits, added, deleted, years, langs: Object.keys(langs).length });
