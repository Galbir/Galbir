// Collects aggregate-only stats into docs/data.json. No repo names, no commit messages, no SHAs.
// Needs a token that can read repos: GH_TOKEN env var, or `gh auth token` locally.
// Incremental: commits already in docs/data.json are kept; only newer ones are fetched.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'Galbir';
const TOKEN = process.env.GH_TOKEN || execSync('gh auth token').toString().trim();
const TZ = process.env.STATS_TZ || 'Europe/Bucharest';
const OUT = 'docs/data.json';
const H = { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'profile-stats', Accept: 'application/vnd.github+json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rest = async (path) => {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`https://api.github.com${path}`, { headers: H });
    if (res.status === 204 || res.status === 409) return null; // empty repo
    if (res.status === 403 || res.status === 429) { // rate limited: wait it out
      const wait = Number(res.headers.get('retry-after')) * 1000 ||
        Math.max(2000, (Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now()) + 1000) || 5000;
      await sleep(Math.min(wait, 120000));
      continue;
    }
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }
  throw new Error(`${path} -> gave up`);
};
const gql = async (query) => {
  const res = await fetch('https://api.github.com/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query }) });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
};
const pool = async (items, n, fn) => {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
};

// ---- classification helpers
const TYPES = ['feat', 'fix', 'refactor', 'docs', 'style', 'test', 'chore', 'perf', 'build', 'ci', 'revert', 'other'];
const typeOf = (msg) => {
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(msg.split('\n')[0]);
  const k = m && m[1].toLowerCase();
  return TYPES.indexOf(TYPES.includes(k) ? k : 'other');
};
const GENERATED = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|go\.sum|Gemfile\.lock)$/,
  /\.(min\.(js|css)|map)$/,
  /(^|\/)(node_modules|dist|build|\.next|\.astro|\.output|vendor|coverage|__pycache__|\.venv)\//,
];
const isGenerated = (f) => GENERATED.some((re) => re.test(f));
const EXT = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', astro: 'Astro', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'SCSS', php: 'PHP',
  sql: 'SQL', md: 'Markdown', mdx: 'Markdown', json: 'JSON', yml: 'YAML', yaml: 'YAML', sh: 'Shell', vue: 'Vue',
};
const langOf = (f) => EXT[(f.split('.').pop() || '').toLowerCase()] || null;

// ---- previous run (incremental)
mkdirSync('docs', { recursive: true });
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const projects = prev?.projects || []; // {rid, id:'P01', lang}
const L = prev?.L || [];               // language names used by commit records
const commits = prev?.commits || [];   // [t, proj, a, d, ca, cd, files, type, [[lang, changes]...]]

// ---- contribution calendar, one query per year (API limit: 1 year/span)
const { user } = await gql(`{ user(login:"${LOGIN}"){ createdAt } }`);
const firstYear = new Date(user.createdAt).getUTCFullYear();
const nowYear = new Date().getUTCFullYear();
const calendar = {};
const years = {};
for (let y = firstYear; y <= nowYear; y++) {
  const d = await gql(`{ user(login:"${LOGIN}"){ contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z"){
    contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } } }`);
  const cal = d.user.contributionsCollection.contributionCalendar;
  years[y] = cal.totalContributions;
  for (const w of cal.weeks) for (const x of w.contributionDays) if (x.date.startsWith(String(y)) && x.contributionCount) calendar[x.date] = x.contributionCount;
}

// ---- repos
const repos = [];
for (let p = 1; ; p++) {
  const page = await rest(`/user/repos?per_page=100&page=${p}&affiliation=owner,collaborator,organization_member`);
  repos.push(...page);
  if (page.length < 100) break;
}
const mine = repos.filter((r) => !r.fork);

let fresh = 0;
const langBytes = {};
for (const r of mine) {
  let pi = projects.findIndex((p) => p.rid === r.id);
  const lastT = commits.reduce((m, c) => (c[1] === pi && c[0] > m ? c[0] : m), 0);
  const since = lastT ? `&since=${new Date((lastT + 1) * 1000).toISOString()}` : '';
  const shas = [];
  for (let p = 1; ; p++) {
    // the API's `author=` filter silently drops commits, so list everything and match the linked login
    const page = await rest(`/repos/${r.full_name}/commits?per_page=100&page=${p}${since}`);
    if (!page?.length) break;
    shas.push(...page.filter((c) => c.author?.login?.toLowerCase() === LOGIN.toLowerCase()).map((c) => c.sha));
    if (page.length < 100) break;
  }
  if (shas.length && pi < 0) {
    pi = projects.length;
    projects.push({ rid: r.id, id: 'P' + String(pi + 1).padStart(2, '0'), lang: r.language || null });
  }
  await pool(shas, 6, async (sha) => {
    const c = await rest(`/repos/${r.full_name}/commits/${sha}`);
    const files = c.files || [];
    let ga = 0, gd = 0;
    const perLang = {};
    for (const f of files) {
      if (isGenerated(f.filename)) { ga += f.additions; gd += f.deletions; continue; }
      const l = langOf(f.filename);
      if (l) perLang[l] = (perLang[l] || 0) + f.changes;
    }
    const a = c.stats?.additions || 0, d = c.stats?.deletions || 0;
    commits.push([
      Math.floor(new Date(c.commit.author.date).getTime() / 1000), pi, a, d, Math.max(0, a - ga), Math.max(0, d - gd),
      files.length, typeOf(c.commit.message || ''),
      Object.entries(perLang).map(([l, n]) => { let i = L.indexOf(l); if (i < 0) i = L.push(l) - 1; return [i, n]; }),
    ]);
    fresh++;
  });
  if (pi >= 0) {
    const l = await rest(`/repos/${r.full_name}/languages`);
    for (const [k, v] of Object.entries(l || {})) langBytes[k] = (langBytes[k] || 0) + v;
  }
  process.stderr.write('.');
}
process.stderr.write('\n');
commits.sort((a, b) => a[0] - b[0]);

// ---- optional: recently played on Spotify (needs SPOTIFY_CLIENT_ID / _SECRET / _REFRESH_TOKEN, else skipped)
let spotify = prev?.spotify || [];
const { SPOTIFY_CLIENT_ID: sid, SPOTIFY_CLIENT_SECRET: ssec, SPOTIFY_REFRESH_TOKEN: sref } = process.env;
if (sid && ssec && sref) {
  try {
    const tok = await (await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${ssec}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: sref }),
    })).json();
    const rp = await (await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
    const seen = new Set(spotify.map((x) => x.t));
    for (const it of rp.items || []) {
      const t = Math.floor(new Date(it.played_at).getTime() / 1000);
      if (seen.has(t)) continue;
      spotify.push({ t, title: it.track.name, artist: it.track.artists.map((a) => a.name).join(', '), album: it.track.album.name,
        art: it.track.album.images?.[1]?.url || it.track.album.images?.[0]?.url || null, url: it.track.external_urls?.spotify || null });
    }
    spotify.sort((a, b) => b.t - a.t);
    spotify = spotify.slice(0, 300);
  } catch (e) { console.error('spotify skipped:', e.message); }
}

const sum = (i) => commits.reduce((s, c) => s + c[i], 0);
writeFileSync(OUT, JSON.stringify({
  login: LOGIN, tz: TZ, generatedAt: new Date().toISOString(), createdAt: user.createdAt,
  calendar, years, langs: langBytes, types: TYPES, L, projects, commits, spotify,
}));
console.log({ repos: mine.length, projects: projects.length, commits: commits.length, fresh, added: sum(2), deleted: sum(3), cleanAdded: sum(4), cleanDeleted: sum(5), years });
