// Aggregates local Claude Code usage into docs/claude.json. Runs on YOUR machine (transcripts live in ~/.claude/projects).
// Privacy by construction: only counts and model/tool names are kept. No prompts, no code, no paths, no project or MCP server names.
// Transcripts are cleaned up by Claude Code after a retention period, so days already in claude.json are kept (never shrunk).
import { createReadStream, readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = process.env.CLAUDE_PROJECTS_DIR || join(homedir(), '.claude', 'projects');
const OUT = 'docs/claude.json';
const TZ = (existsSync('docs/data.json') && JSON.parse(readFileSync('docs/data.json', 'utf8')).tz) || process.env.STATS_TZ || 'Europe/Bucharest';
const fmtr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
const local = (iso) => { const p = Object.fromEntries(fmtr.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 }; };

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) { const p = join(d, n), s = statSync(p); if (s.isDirectory()) walk(p); else if (n.endsWith('.jsonl')) files.push(p); }
})(ROOT);

const cleanModel = (m) => (m || 'unknown').replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[.*\]$/, '');
const msgs = [];          // every assistant usage line, counted like Claude Code's /usage does (streamed blocks included)
const first = new Map();  // sessionId -> {date, hour}
const days = {};
const day = (d) => (days[d] ||= { s: 0, p: 0, i: 0, o: 0, cr: 0, cc: 0, t: 0, m: {}, tl: {}, h: {}, th: {} });
const projects = new Set();

for (const file of files) {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    const isA = line.includes('"type":"assistant"'), isU = line.includes('"type":"user"');
    if (!isA && !isU) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!o.timestamp) continue;
    const when = local(o.timestamp);
    const sid = o.sessionId || o.session_id;
    if (sid && !o.isSidechain) { const f = first.get(sid); if (!f || o.timestamp < f.ts) first.set(sid, { ...when, ts: o.timestamp }); }
    if (o.cwd) projects.add(o.cwd);
    if (o.type === 'user' && !o.isSidechain && !o.isMeta) {
      const c = o.message?.content;
      const human = typeof c === 'string' ? c.trim() && !c.startsWith('<') : Array.isArray(c) && c.some((b) => b.type === 'text' && !b.text.trim().startsWith('<')) && !c.some((b) => b.type === 'tool_result');
      if (human) { const d = day(when.date); d.p++; d.h[when.hour] = (d.h[when.hour] || 0) + 1; }
    } else if (o.type === 'assistant' && o.message?.usage && o.message.model !== '<synthetic>') {
      const u = o.message.usage, id = o.message.id || o.uuid;
      const rec = { date: when.date, hour: when.hour, model: cleanModel(o.message.model), i: u.input_tokens || 0, o: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, cc: u.cache_creation_input_tokens || 0 };
      msgs.push(rec);
      for (const b of o.message.content || []) {
        if (b.type !== 'tool_use') continue;
        const name = b.name.startsWith('mcp__') ? 'MCP' : b.name;
        const d = day(when.date); d.tl[name] = (d.tl[name] || 0) + 1;
      }
    }
  }
}
for (const r of msgs) {
  const d = day(r.date), t = r.i + r.o + r.cr + r.cc;
  d.i += r.i; d.o += r.o; d.cr += r.cr; d.cc += r.cc; d.t += t; d.m[r.model] = (d.m[r.model] || 0) + t; d.th[r.hour] = (d.th[r.hour] || 0) + t;
}
for (const f of first.values()) day(f.date).s++;

// Claude Code's own lifetime stats also cover days whose transcripts were pruned: use them as a per-day floor
const SC = join(homedir(), '.claude', 'stats-cache.json');
if (existsSync(SC)) {
  try {
    const sc = JSON.parse(readFileSync(SC, 'utf8'));
    for (const x of sc.dailyModelTokens || []) {
      const d = day(x.date);
      for (const [m, v] of Object.entries(x.tokensByModel || {})) {
        const n = cleanModel(m), have = d.m[n] || 0;
        if (v > have) { d.m[n] = v; d.t += v - have; }
      }
    }
  } catch {}
}

// merge with the previous run: keep any day whose old numbers were larger (transcripts may have been pruned since)
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { days: {}, projects: 0 };
for (const [k, v] of Object.entries(prev.days)) if (!days[k] || v.t > days[k].t) days[k] = v;

const sum = (fn) => Object.values(days).reduce((s, d) => s + fn(d), 0);
const addMaps = (key) => { const m = {}; for (const d of Object.values(days)) for (const [k, v] of Object.entries(d[key] || {})) m[k] = (m[k] || 0) + v; return m; };
const models = Object.entries(addMaps('m')).map(([n, t]) => ({ n, t })).sort((a, b) => b.t - a.t);
const tools = Object.entries(addMaps('tl')).map(([n, c]) => ({ n, c })).sort((a, b) => b.c - a.c).slice(0, 10);
const hours = Array(24).fill(0); for (const [h, c] of Object.entries(addMaps('h'))) hours[+h] = c;
const keys = Object.keys(days).sort();

const out = {
  generatedAt: new Date().toISOString(), tz: TZ, since: keys[0], note: 'Aggregate counts only.',
  totals: {
    tokens: sum((d) => d.t), input: sum((d) => d.i), output: sum((d) => d.o), cacheRead: sum((d) => d.cr), cacheWrite: sum((d) => d.cc),
    sessions: sum((d) => d.s), prompts: sum((d) => d.p), toolCalls: tools.reduce((s, t) => s + t.c, 0) + 0, activeDays: keys.filter((k) => days[k].t || days[k].p).length,
    projects: Math.max(projects.size, prev.totals?.projects || 0),
  },
  models, tools, hours, days,
};
out.totals.toolCalls = sum((d) => Object.values(d.tl || {}).reduce((s, c) => s + c, 0));
mkdirSync('docs', { recursive: true });
// leave the file untouched when nothing changed, so hourly runs do not create empty commits
const strip = ({ generatedAt, ...rest }) => JSON.stringify(rest);
if (prev.generatedAt && strip(prev) === strip(out)) console.log('unchanged');
else writeFileSync(OUT, JSON.stringify(out));
console.log({ files: files.length, since: out.since, ...out.totals, models: models.slice(0, 5), tools: tools.slice(0, 5) });
