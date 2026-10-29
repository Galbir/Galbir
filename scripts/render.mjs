// Renders docs/data.json (+ docs/claude.json when present) into animated, themed SVGs for the profile README.
// GitHub strips JS and hover from README images, but CSS animations survive, so everything here is CSS-only.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';

const D = JSON.parse(readFileSync('docs/data.json', 'utf8'));
const CL = existsSync('docs/claude.json') ? JSON.parse(readFileSync('docs/claude.json', 'utf8')) : null;
mkdirSync('assets', { recursive: true });

const THEMES = {
  dark: { bg: '#0d1117', stroke: '#30363d', text: '#e6edf3', muted: '#8b949e', faint: '#6e7681', track: '#21262d',
    ramp: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'], add: '#3fb950', del: '#f85149' },
  light: { bg: '#ffffff', stroke: '#d0d7de', text: '#1f2328', muted: '#59636e', faint: '#818b98', track: '#eaeef2',
    ramp: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'], add: '#1a7f37', del: '#cf222e' },
};
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
const W = 900;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LANGC = { TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572a5', Astro: '#ff5a03', HTML: '#e34c26', CSS: '#7b5ea7', SCSS: '#c6538c',
  PHP: '#4f5d95', SQL: '#e38c00', Markdown: '#6a9fd8', JSON: '#8b949e', YAML: '#cb171e', Shell: '#89e051', Vue: '#41b883', Other: '#6e7681' };

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const cmp = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : fmt(n));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hrs = (m) => (m / 60 >= 10 ? Math.round(m / 60) : (m / 60).toFixed(1)) + ' h';
const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (s) => new Date(s + 'T00:00:00Z').getUTCDay();
const wkStart = (s) => addD(s, -dowOf(s));

// ---------- prepare commits in the configured timezone
const f = new Intl.DateTimeFormat('en-CA', { timeZone: D.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const loc = (t) => Object.fromEntries(f.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
const C = D.commits.map((r) => {
  const p = loc(r[0]);
  return { t: r[0], p: r[1], ca: r[4], cd: r[5], y: r[7], l: r[8], date: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24 };
}).sort((a, b) => a.t - b.t);
C.forEach((c, i) => { const g = i ? (c.t - C[i - 1].t) / 60 : Infinity; c.mins = g <= 120 ? Math.max(g, 1) : 30; });
const g0 = loc(Date.parse(D.generatedAt) / 1000);
const today = `${g0.year}-${g0.month}-${g0.day}`;
const from = addD(today, -364);
const win = C.filter((c) => c.date >= from);
const part = (h) => (h >= 5 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 22 ? 2 : 3);

// ---------- shared SVG bits
const CSS = (t) => `<style>
@keyframes pop{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}
@keyframes growY{from{transform:scaleY(0)}to{transform:none}}
@keyframes growX{from{transform:scaleX(0)}to{transform:none}}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{stroke-opacity:.15}50%{stroke-opacity:1}}
.c{transform-box:fill-box;transform-origin:center;animation:pop .5s cubic-bezier(.2,.8,.2,1) both}
.bu{transform-box:fill-box;transform-origin:50% 100%;animation:growY .7s cubic-bezier(.2,.8,.2,1) both}
.bd{transform-box:fill-box;transform-origin:50% 0;animation:growY .7s cubic-bezier(.2,.8,.2,1) both}
.bx{transform-box:fill-box;transform-origin:0 50%;animation:growX .8s cubic-bezier(.2,.8,.2,1) both}
.r{animation:rise .6s ease-out both}
.now{fill:none;stroke:${t.text};stroke-width:1.5;animation:pulse 2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`;
const frame = (t, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" font-family="${SANS}">${CSS(t)}
<rect x=".5" y=".5" width="${W - 1}" height="${h - 1}" rx="14" fill="${t.bg}" stroke="${t.stroke}"/>
${body}
</svg>`;
const title = (t, h, sub) => `<text class="r" x="32" y="42" fill="${t.text}" font-size="18" font-weight="600">${h}</text><text class="r" x="32" y="64" fill="${t.muted}" font-size="12.5" style="animation-delay:.1s">${sub}</text>`;
const label = (t, x, y, s, { size = 10, anchor = 'start', color = t.muted } = {}) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" letter-spacing=".08em" text-anchor="${anchor}">${s}</text>`;
const big = (t, x, y, v, l, color = t.text, delay = 0) =>
  `<g class="r" style="animation-delay:${delay}s"><text x="${x}" y="${y}" fill="${color}" font-family="${MONO}" font-size="22" font-weight="600">${v}</text>${label(t, x, y + 20, l.toUpperCase())}</g>`;

// ---------- 1. activity
function activity(t) {
  const L = 44, T = 92, step = (W - 32 - L) / 53, S = step - 3;
  const start = addD(today, -dowOf(today) - 52 * 7);
  const cal = (d) => D.calendar[d] || 0;
  const wind = []; for (let d = start; d <= today; d = addD(d, 1)) wind.push(d);
  const nz = wind.map(cal).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] || 1, cuts = [q(0.25), q(0.5), q(0.75)];
  const lvl = (n) => (n === 0 ? 0 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4);
  let cells = '', months = '', lastC = -9, lastM = -1, nowCell = '';
  wind.forEach((d, i) => {
    const col = Math.floor(i / 7), row = dowOf(d), x = L + col * step, y = T + row * step, m = +d.slice(5, 7);
    if (row === 0 && m !== lastM && col >= lastC + 3 && col < 51) { months += `<text x="${x}" y="${T - 10}" fill="${t.muted}" font-size="11">${MONTHS[m - 1]}</text>`; lastM = m; lastC = col; }
    cells += `<rect class="c" style="animation-delay:${(col * 14 + row * 8) / 1000}s" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${S.toFixed(1)}" height="${S.toFixed(1)}" rx="3" fill="${t.ramp[lvl(cal(d))]}"/>`;
    if (d === today) nowCell = `<rect class="now" x="${(x - 1.5).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="${(S + 3).toFixed(1)}" height="${(S + 3).toFixed(1)}" rx="4.5"/>`;
  });
  const dowL = [1, 3, 5].map((r) => `<text x="${L - 10}" y="${T + r * step + 10}" fill="${t.faint}" font-size="10" text-anchor="end">${DOWS[r]}</text>`).join('');
  const gb = T + 7 * step;
  const lx = W - 32 - 5 * (S + 4) - 52;
  const legend = label(t, lx, gb + 18, 'LESS', { size: 11, anchor: 'end' }) + t.ramp.map((c, i) => `<rect x="${lx + 8 + i * (S + 4)}" y="${gb + 7}" width="${S}" height="${S}" rx="3" fill="${c}"/>`).join('') + label(t, lx + 8 + 5 * (S + 4) + 4, gb + 18, 'MORE', { size: 11 });
  const total = wind.reduce((s, d) => s + cal(d), 0), active = wind.filter(cal).length;
  const best = wind.reduce((a, b) => (cal(b) > cal(a) ? b : a));
  let longest = 0, run = 0; for (let d = Object.keys(D.calendar).sort()[0]; d <= today; d = addD(d, 1)) { run = cal(d) ? run + 1 : 0; longest = Math.max(longest, run); }
  let cur = 0; for (let d = today; ; d = addD(d, -1)) { if (cal(d)) cur++; else if (d !== today) break; }
  const stats = [[fmt(active), 'active days'], [`${cur}d`, 'current streak'], [`${longest}d`, 'longest streak'], [fmt(cal(best)), `best day · ${MONTHS[+best.slice(5, 7) - 1]} ${+best.slice(8)}`], [fmt(total / active), 'avg per active day']];
  const sy = gb + 56, cw = (W - 64) / stats.length;
  const els = stats.map(([v, l], i) => `<g class="r" style="animation-delay:${0.6 + i * 0.08}s"><text x="${32 + i * cw}" y="${sy}" fill="${t.text}" font-family="${MONO}" font-size="20" font-weight="600">${v}</text>${label(t, 32 + i * cw, sy + 18, l.toUpperCase())}</g>`).join('');
  return frame(t, sy + 40, `${title(t, 'Activity', `<tspan fill="${t.text}" font-family="${MONO}" font-weight="600">${fmt(total)}</tspan> contributions in the last year · private work included`)}
${months}${dowL}${cells}${nowCell}${legend}<line x1="32" x2="${W - 32}" y1="${gb + 26}" y2="${gb + 26}" stroke="${t.stroke}" stroke-dasharray="2 4"/>${els}`);
}

// ---------- 2. code churn (lockfiles & generated files excluded)
function churn(t) {
  const start = wkStart(addD(today, -51 * 7));
  const weeks = []; for (let i = 0; i < 52; i++) weeks.push({ k: addD(start, i * 7), a: 0, d: 0, n: 0 });
  const idx = Object.fromEntries(weeks.map((w, i) => [w.k, i]));
  win.forEach((c) => { const w = weeks[idx[wkStart(c.date)]]; if (w) { w.a += c.ca; w.d += c.cd; w.n++; } });
  const A = win.reduce((s, c) => s + c.ca, 0), Dl = win.reduce((s, c) => s + c.cd, 0), mins = win.reduce((s, c) => s + c.mins, 0);
  const net = A - Dl, colW = (W - 64) / 4;
  const bigs = [
    big(t, 32, 104, '+' + fmt(A), 'lines added', t.add), big(t, 32 + colW, 104, '−' + fmt(Dl), 'lines removed', t.del, 0.1),
    big(t, 32 + 2 * colW, 104, (net >= 0 ? '+' : '−') + fmt(Math.abs(net)), 'net lines', t.text, 0.2),
    big(t, 32 + 3 * colW, 104, fmt(win.length), `commits · ≈ ${hrs(mins)} coding`, t.text, 0.3)].join('');
  const top = 170, mid = 246, bot = 322, bw = 12, gap = 4, x0 = 32 + (W - 64 - 52 * (bw + gap) + gap) / 2;
  const mx = Math.sqrt(Math.max(1, ...weeks.map((w) => Math.max(w.a, w.d))));
  const bars = weeks.map((w, i) => {
    const x = x0 + i * (bw + gap), ha = (Math.sqrt(w.a) / mx) * (mid - top), hd = (Math.sqrt(w.d) / mx) * (bot - mid), dl = (0.3 + i * 0.015).toFixed(3);
    return (w.a ? `<rect class="bu" style="animation-delay:${dl}s" x="${x}" y="${(mid - ha - 1).toFixed(1)}" width="${bw}" height="${Math.max(2, ha).toFixed(1)}" rx="3" fill="${t.add}"/>` : '') +
      (w.d ? `<rect class="bd" style="animation-delay:${dl}s" x="${x}" y="${mid + 1}" width="${bw}" height="${Math.max(2, hd).toFixed(1)}" rx="3" fill="${t.del}"/>` : '') +
      (!w.a && !w.d ? `<rect x="${x}" y="${mid - 1}" width="${bw}" height="2" rx="1" fill="${t.stroke}"/>` : '');
  }).join('');
  return frame(t, 366, `${title(t, 'Code churn', 'Lines written and deleted per week · lockfiles and generated files excluded · private repos included')}${bigs}
<line x1="32" x2="${W - 32}" y1="${mid}" y2="${mid}" stroke="${t.stroke}"/>${bars}
${label(t, 32, mid - 12, 'ADDED ↑', { color: t.add })}${label(t, 32, mid + 22, 'REMOVED ↓', { color: t.del })}
<text x="${W - 32}" y="346" fill="${t.faint}" font-size="10" text-anchor="end">last 52 weeks · square-root scale</text>`);
}

// ---------- 3. rhythm: morning / daytime / evening / night + hours
function rhythm(t) {
  const P = [['Morning', '05–11'], ['Daytime', '11–17'], ['Evening', '17–22'], ['Night', '22–05']];
  const cnt = [0, 0, 0, 0], hh = Array(24).fill(0), wd = Array(7).fill(0);
  win.forEach((c) => { cnt[part(c.h)]++; hh[c.h]++; wd[dowOf(c.date)]++; });
  const tot = win.length || 1, pm = Math.max(...cnt, 1), colW = (W - 64) / 4;
  const tiles = P.map(([n, r], i) => {
    const x = 32 + i * colW, pct = Math.round((cnt[i] / tot) * 100), w = colW - 16;
    return `<g class="r" style="animation-delay:${0.1 + i * 0.1}s"><text x="${x}" y="100" fill="${t.text}" font-family="${MONO}" font-size="26" font-weight="600">${pct}%</text>
${label(t, x, 120, `${n.toUpperCase()} · ${r}H`)}${label(t, x, 138, `${fmt(cnt[i])} COMMITS`, { color: t.faint })}
<rect x="${x}" y="148" width="${w}" height="6" rx="3" fill="${t.track}"/><rect class="bx" style="animation-delay:${0.3 + i * 0.1}s" x="${x}" y="148" width="${(cnt[i] / pm) * w}" height="6" rx="3" fill="${t.ramp[3]}"/></g>`;
  }).join('');
  const hm = Math.max(...hh, 1), cw = (W - 64) / 24, cy = 232;
  const hbars = hh.map((v, h) => {
    const ht = (v / hm) * 54, x = 32 + h * cw;
    return (v ? `<rect class="bu" style="animation-delay:${0.4 + h * 0.03}s" x="${(x + 1.5).toFixed(1)}" y="${(cy - ht).toFixed(1)}" width="${(cw - 3).toFixed(1)}" height="${Math.max(2, ht).toFixed(1)}" rx="3" fill="${t.ramp[3]}"/>` : `<rect x="${(x + 1.5).toFixed(1)}" y="${cy - 1.5}" width="${(cw - 3).toFixed(1)}" height="1.5" rx=".75" fill="${t.stroke}"/>`) +
      (h % 3 === 0 ? `<text x="${(x + cw / 2).toFixed(1)}" y="${cy + 15}" fill="${t.muted}" font-size="10" text-anchor="middle">${String(h).padStart(2, '0')}</text>` : '');
  }).join('');
  const order = [1, 2, 3, 4, 5, 6, 0], wm = Math.max(...wd, 1), ww = (W - 64) / 7;
  const wbars = order.map((d, i) => {
    const x = 32 + i * ww;
    return `<g class="r" style="animation-delay:${0.6 + i * 0.05}s">${label(t, x, 292, DOWS[d].toUpperCase())}<text x="${x}" y="312" fill="${t.text}" font-family="${MONO}" font-size="14" font-weight="600">${wd[d]}</text>
<rect x="${x}" y="320" width="${ww - 16}" height="5" rx="2.5" fill="${t.track}"/><rect class="bx" style="animation-delay:${0.7 + i * 0.05}s" x="${x}" y="320" width="${(wd[d] / wm) * (ww - 16)}" height="5" rx="2.5" fill="${t.ramp[3]}"/></g>`;
  }).join('');
  const peak = hh.indexOf(Math.max(...hh));
  return frame(t, 352, `${title(t, 'When I code', `Last 12 months · peak hour <tspan fill="${t.text}" font-family="${MONO}" font-weight="600">${String(peak).padStart(2, '0')}:00</tspan> · times in ${esc(D.tz.replace('_', ' '))}`)}${tiles}
<line x1="32" x2="${W - 32}" y1="${cy}" y2="${cy}" stroke="${t.stroke}"/>${hbars}${wbars}`);
}

// ---------- 4. time by language
function languages(t) {
  const m = {};
  win.forEach((c) => {
    const tot = c.l.reduce((s, x) => s + x[1], 0);
    if (!tot) { m.Other = (m.Other || 0) + c.mins; return; }
    c.l.forEach(([li, ch]) => { const k = D.L[li]; m[k] = (m[k] || 0) + c.mins * (ch / tot); });
  });
  const entries = Object.entries(m).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const head = entries.filter(([k]) => k !== 'Other').slice(0, 8);
  const other = total - head.reduce((s, [, v]) => s + v, 0);
  const rows = other > 0 ? [...head, ['Other', other]] : head;
  const barX = 32, barW = W - 64, barY = 84;
  let x = barX;
  const segs = rows.map(([k, v], i) => {
    const w = (v / total) * barW;
    const el = `<rect class="bx" style="animation-delay:${i * 0.08}s" x="${x.toFixed(1)}" y="${barY}" width="${Math.max(0, w - 2).toFixed(1)}" height="14" rx="${i === 0 || i === rows.length - 1 ? 7 : 3}" fill="${LANGC[k] || t.faint}"/>`;
    x += w; return el;
  }).join('');
  const colW = (W - 64) / 3;
  const items = rows.map(([k, v], i) => {
    const cx = 32 + (i % 3) * colW, cy = 140 + Math.floor(i / 3) * 30;
    return `<g class="r" style="animation-delay:${0.3 + i * 0.05}s"><circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${LANGC[k] || t.faint}"/><text x="${cx + 18}" y="${cy}" fill="${t.text}" font-size="13" font-weight="500">${esc(k)}</text>
<text x="${cx + colW - 24}" y="${cy}" fill="${t.muted}" font-family="${MONO}" font-size="12" text-anchor="end">${hrs(v)} · ${((v / total) * 100).toFixed(0)}%</text></g>`;
  }).join('');
  return frame(t, 140 + Math.ceil(rows.length / 3) * 30 + 14, `${title(t, 'Languages', 'Estimated coding time per language · last 12 months')}${segs}${items}`);
}

// ---------- 5. Claude Code usage (aggregates from docs/claude.json, only when present)
function claude(t) {
  if (!CL) return null;
  const T = CL.totals, colW = (W - 64) / 4;
  const days = CL.days; // {date: {s: sessions, p: prompts, t: total tokens}}
  const s0 = CL.since > addD(today, -363) ? CL.since : addD(today, -363);
  const win2 = []; for (let d = s0; d <= today; d = addD(d, 1)) win2.push({ d, ...(days[d] || { s: 0, p: 0, t: 0 }) });
  const mx = Math.sqrt(Math.max(1, ...win2.map((x) => x.t)));
  const bw = (W - 64) / win2.length;
  const spark = win2.map((x, i) => {
    const h = (Math.sqrt(x.t) / mx) * 46;
    return x.t ? `<rect class="bu" style="animation-delay:${0.3 + i * 0.002}s" x="${(32 + i * bw).toFixed(2)}" y="${(256 - h).toFixed(1)}" width="${Math.max(1, bw - (bw > 6 ? 2 : 0.8)).toFixed(2)}" height="${Math.max(1.5, h).toFixed(1)}" rx="${bw > 6 ? 2 : 1}" fill="${t.ramp[3]}"/>` : '';
  }).join('');
  const bigs = [
    big(t, 32, 104, cmp(T.tokens), 'tokens processed'), big(t, 32 + colW, 104, fmt(T.sessions), 'sessions', t.text, 0.1),
    big(t, 32 + 2 * colW, 104, fmt(T.prompts), 'prompts sent', t.text, 0.2), big(t, 32 + 3 * colW, 104, fmt(T.activeDays), 'active days', t.text, 0.3)].join('');
  const mt = CL.models.slice(0, 4), tot = mt.reduce((s, m) => s + m.t, 0) || 1;
  let x = 32;
  const mbar = mt.map((m, i) => { const w = (m.t / tot) * (W - 64); const el = `<rect class="bx" style="animation-delay:${0.2 + i * 0.1}s" x="${x.toFixed(1)}" y="152" width="${Math.max(0, w - 2).toFixed(1)}" height="10" rx="5" fill="${t.ramp[4 - i % 4]}"/>`; x += w; return el; }).join('');
  const mleg = mt.map((m, i) => `<g class="r" style="animation-delay:${0.4 + i * 0.05}s"><circle cx="${37 + i * 215}" cy="180" r="4.5" fill="${t.ramp[4 - i % 4]}"/><text x="${48 + i * 215}" y="184" fill="${t.text}" font-size="12">${esc(m.n)}<tspan fill="${t.muted}"> ${Math.round((m.t / tot) * 100)}%</tspan></text></g>`).join('');
  return frame(t, 290, `${title(t, 'Building with Claude Code', `Since ${esc(CL.since)} · aggregate counts only, no prompts, code or project names`)}${bigs}${mbar}${mleg}${spark}
<text x="32" y="276" fill="${t.faint}" font-size="10">${esc(s0)} → ${esc(today)} · tokens per day · square-root scale</text>`);
}

// ---------- 6. recently played (only when Spotify credentials were provided)
function spotify(t) {
  if (!(D.spotify || []).length) return null;
  // header only: the track list itself is real HTML in the README, so covers and links work
  const logo = `<g transform="translate(${W - 32 - 36} 24)"><g class="r"><circle cx="18" cy="18" r="18" fill="#1DB954"/>
<path d="M9.3 13.8c5.7-1.7 12.4-1.1 17.7 2" stroke="#000" stroke-width="2.7" fill="none" stroke-linecap="round"/>
<path d="M10.4 18.8c4.8-1.4 10.3-.8 14.7 1.8" stroke="#000" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<path d="M11.4 23.2c3.9-1.1 8-.6 11.5 1.5" stroke="#000" stroke-width="1.8" fill="none" stroke-linecap="round"/></g></g>`;
  return frame(t, 84, `${title(t, 'Recently played', 'Last tracks on Spotify · click a cover to open the song')}${logo}`);
}
const spotifyList = () => {
  const s = (D.spotify || []).slice(0, 7);
  if (!s.length) return '';
  const when = (ts) => { const p = loc(ts); return `${MONTHS[+p.month - 1]} ${+p.day}, ${p.hour}:${p.minute}`; };
  const rows = s.map((x, i) => {
    const href = x.url ? ` href="${esc(x.url)}"` : '';
    const cover = x.art ? `<a${href}><img src="${esc(x.art)}" width="44" height="44" align="absmiddle" alt=""></a>&nbsp;&nbsp;` : '';
    return `${cover}<a${href}><b>${esc(x.title)}</b></a>&nbsp;&nbsp;<sub>${esc(x.artist)}</sub>${i === 0 ? '&nbsp;&nbsp;<sub>last played · ' + when(x.t) + '</sub>' : '&nbsp;&nbsp;<sub>' + when(x.t) + '</sub>'}`;
  }).join('<br><sub>&nbsp;</sub><br>');
  return `<div align="left">

${rows}

</div>

<sub>Listening data and cover art from <a href="https://open.spotify.com">Spotify</a> · times in ${esc(D.tz.replace('_', ' '))} · updates every 30 minutes</sub>`;
};

// ---------- shared helpers for the remaining cards
const sumBy = (a, fn) => a.reduce((s, x) => s + fn(x), 0);
const MONTHF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (k) => `${MONTHF[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
const fmtDate = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${+s.slice(8)}, ${s.slice(0, 4)}`;
const PARTS = ['Morning', 'Daytime', 'Evening', 'Night'];
const kpiRow = (t, y, items, delay = 0) => {
  const cw = (W - 64) / items.length;
  return items.map(([v, l, col, sub], i) => `<g class="r" style="animation-delay:${delay + i * 0.07}s"><text x="${32 + i * cw}" y="${y}" fill="${col || t.text}" font-family="${MONO}" font-size="22" font-weight="600">${v}</text>${label(t, 32 + i * cw, y + 20, l.toUpperCase())}${sub ? label(t, 32 + i * cw, y + 36, sub, { color: t.faint }) : ''}</g>`).join('');
};
// horizontal bar rows: items [{name, v, label, color?}]
const hrows = (t, x, y, w, items, { nameW = 120, labelW = 100, step = 28, delay = 0.2 } = {}) => {
  const mx = Math.max(1, ...items.map((r) => r.v)), tx = x + nameW, tw = Math.max(20, w - nameW - labelW);
  return items.map((r, i) => {
    const yy = y + i * step, col = r.color || t.ramp[3];
    return `<g class="r" style="animation-delay:${delay + i * 0.05}s"><text x="${x}" y="${yy + 4}" fill="${t.text}" font-size="12.5">${esc(r.name)}</text>
<rect x="${tx}" y="${yy - 4}" width="${tw}" height="8" rx="4" fill="${t.track}"/><rect class="bx" style="animation-delay:${delay + 0.2 + i * 0.05}s" x="${tx}" y="${yy - 4}" width="${Math.max(3, (r.v / mx) * tw).toFixed(1)}" height="8" rx="4" fill="${col}"/>
<text x="${x + w}" y="${yy + 4}" fill="${t.muted}" font-family="${MONO}" font-size="12" text-anchor="end">${esc(r.label)}</text></g>`;
  }).join('');
};
const langMins = (cs) => {
  const m = {};
  cs.forEach((c) => {
    const tot = c.l.reduce((s, x) => s + x[1], 0);
    if (!tot) { m.Other = (m.Other || 0) + c.mins; return; }
    c.l.forEach(([li, ch]) => { const k = D.L[li]; m[k] = (m[k] || 0) + c.mins * (ch / tot); });
  });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const projMins = (cs) => {
  const m = {};
  cs.forEach((c) => { const o = (m[c.p] ||= { n: 0, mins: 0, a: 0, d: 0 }); o.n++; o.mins += c.mins; o.a += c.ca; o.d += c.cd; });
  return Object.entries(m).map(([p, o]) => ({ id: D.projects[p].id, lang: D.projects[p].lang, ...o })).sort((a, b) => b.mins - a.mins);
};
const longestStreak = (dates) => {
  const s = [...new Set(dates)].sort(); let best = 0, run = 0;
  s.forEach((d, i) => { run = i && addD(s[i - 1], 1) === d ? run + 1 : 1; best = Math.max(best, run); });
  return best;
};

// ---------- 7. overview (the dashboard's KPI row)
function overview(t) {
  const s = (cs) => ({ n: cs.length, a: sumBy(cs, (c) => c.ca), d: sumBy(cs, (c) => c.cd), m: sumBy(cs, (c) => c.mins), days: new Set(cs.map((c) => c.date)).size, pr: new Set(cs.map((c) => c.p)).size });
  const w = s(win), a = s(C), net = (o) => (o.a - o.d >= 0 ? '+' : '−') + cmp(Math.abs(o.a - o.d));
  const r1 = [[fmt(w.n), 'commits', t.text, `ALL TIME ${fmt(a.n)}`], ['+' + fmt(w.a), 'lines added', t.add, `ALL TIME +${cmp(a.a)}`], ['−' + fmt(w.d), 'lines removed', t.del, `ALL TIME −${cmp(a.d)}`], [net(w), 'net lines', t.text, `ALL TIME ${net(a)}`]];
  const r2 = [[hrs(w.m), 'est. coding time', t.text, `ALL TIME ${hrs(a.m)}`], [fmt(w.days), 'active days', t.text, `ALL TIME ${fmt(a.days)}`], [fmt(w.pr), 'projects', t.text, `ALL TIME ${fmt(a.pr)}`], [(w.n / Math.max(1, w.days)).toFixed(1), 'commits per active day', t.text, `ALL TIME ${(a.n / Math.max(1, a.days)).toFixed(1)}`]];
  return frame(t, 248, `${title(t, 'Overview', 'Last 12 months · lines exclude lockfiles and generated files · all-time totals underneath')}${kpiRow(t, 104, r1)}
<line x1="32" x2="${W - 32}" y1="158" y2="158" stroke="${t.stroke}" stroke-dasharray="2 4"/>${kpiRow(t, 190, r2, 0.3)}`);
}

// ---------- 8. punchcard: weekday x hour
function punchcard(t) {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  win.forEach((c) => m[dowOf(c.date)][c.h]++);
  const all = m.flat().filter(Boolean).sort((a, b) => a - b), mx = Math.max(1, ...all);
  const q = (p) => all[Math.min(all.length - 1, Math.floor(p * all.length))] || 1, cuts = [q(0.25), q(0.5), q(0.75)];
  const x0 = 80, cw = (W - 32 - x0) / 24, rh = 26, T = 92, order = [1, 2, 3, 4, 5, 6, 0];
  let dots = '';
  order.forEach((d, r) => {
    dots += `<text x="32" y="${T + r * rh + 4}" fill="${t.muted}" font-size="11">${DOWS[d]}</text>`;
    for (let h = 0; h < 24; h++) {
      const v = m[d][h], cx = x0 + h * cw + cw / 2, cy = T + r * rh;
      if (!v) { dots += `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="1.6" fill="${t.stroke}"/>`; continue; }
      const lv = v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4;
      dots += `<circle class="c" style="animation-delay:${(h * 18 + r * 40) / 1000}s" cx="${cx.toFixed(1)}" cy="${cy}" r="${Math.max(3, Math.sqrt(v / mx) * (rh / 2 - 1)).toFixed(1)}" fill="${t.ramp[lv]}"/>`;
    }
  });
  const hl = Array.from({ length: 8 }, (_, i) => `<text x="${(x0 + i * 3 * cw + cw / 2).toFixed(1)}" y="${T + 7 * rh + 6}" fill="${t.muted}" font-size="10" text-anchor="middle">${String(i * 3).padStart(2, '0')}</text>`).join('');
  return frame(t, T + 7 * rh + 28, `${title(t, 'Punchcard', 'Commits by weekday and hour · last 12 months · dot size and shade = how many')}${dots}${hl}`);
}

// ---------- 9. time by project (anonymised)
function projectsCard(t) {
  const rows = projMins(win).slice(0, 10).map((p) => ({ name: `${p.id}${p.lang ? ' · ' + p.lang : ''}`, v: p.mins, label: `${hrs(p.mins)} · ${p.n}` }));
  return frame(t, 100 + rows.length * 28 + 8, `${title(t, 'Time by project', 'Estimated hours · commits · last 12 months · project names are anonymised')}${hrows(t, 32, 100, W - 64, rows, { nameW: 170, labelW: 110 })}`);
}

// ---------- 10. commit types + sizes
function styleCard(t) {
  const cnt = Array(D.types.length).fill(0); win.forEach((c) => cnt[c.y]++);
  const types = cnt.map((v, i) => ({ name: D.types[i], v, label: String(v) })).filter((r) => r.v).sort((a, b) => b.v - a.v).slice(0, 8);
  const B = [['1–10', 1, 10], ['11–50', 11, 50], ['51–200', 51, 200], ['201–1k', 201, 1000], ['1k–5k', 1001, 5000], ['5k+', 5001, 1e12]];
  const sizes = B.map(([n, lo, hi]) => { const v = win.filter((c) => { const s = c.ca + c.cd; return s >= lo && s <= hi; }).length; return { name: n + ' lines', v, label: String(v) }; });
  const sorted = win.map((c) => c.ca + c.cd).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 0;
  const cw = (W - 64 - 40) / 2;
  return frame(t, 130 + Math.max(types.length, sizes.length) * 28 + 4, `${title(t, 'How I commit', 'Last 12 months · only conventional-commit prefixes are kept, never the messages')}
${label(t, 32, 100, 'COMMIT TYPES')}${hrows(t, 32, 128, cw, types, { nameW: 80, labelW: 44 })}
${label(t, 32 + cw + 40, 100, `COMMIT SIZE · MEDIAN ${fmt(med)} LINES`)}${hrows(t, 32 + cw + 40, 128, cw, sizes, { nameW: 90, labelW: 44, delay: 0.4 })}`);
}

// ---------- 11. highlights + records
function insights(t) {
  const cs = win; if (!cs.length) return null;
  const cnt = (fn, n) => { const a = Array(n).fill(0); cs.forEach((c) => a[fn(c)]++); return a; };
  const top = (a) => a.indexOf(Math.max(...a));
  const hh = cnt((c) => c.h, 24), wd = cnt((c) => dowOf(c.date), 7), pt = cnt((c) => part(c.h), 4);
  const byD = {}; cs.forEach((c) => (byD[c.date] ||= []).push(c));
  const busiest = Object.entries(byD).sort((a, b) => b[1].length - a[1].length)[0];
  const bigC = [...cs].sort((a, b) => b.ca + b.cd - (a.ca + a.cd))[0];
  const ses = []; let cur = [cs[0]];
  for (let i = 1; i < cs.length; i++) { if ((cs[i].t - cs[i - 1].t) / 60 <= 120) cur.push(cs[i]); else { ses.push(cur); cur = [cs[i]]; } }
  ses.push(cur);
  const dur = (s) => (s[s.length - 1].t - s[0].t) / 60 + 30, long = [...ses].sort((a, b) => dur(b) - dur(a))[0];
  const mth = {}; cs.forEach((c) => (mth[c.date.slice(0, 7)] = (mth[c.date.slice(0, 7)] || 0) + 1));
  const bm = Object.entries(mth).sort((a, b) => b[1] - a[1])[0], nd = Object.keys(byD).length;
  const b = (s) => `<tspan fill="${t.text}" font-weight="600">${s}</tspan>`;
  const lines = [
    `Most commits happen in the ${b(PARTS[top(pt)].toLowerCase())} (${Math.round((Math.max(...pt) / cs.length) * 100)}%), peaking around ${b(String(top(hh)).padStart(2, '0') + ':00')}.`,
    `Busiest weekday is ${b(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][top(wd)])}.`,
    `${b(Math.round((pt[3] / cs.length) * 100) + '%')} of commits land between 22:00 and 05:00.`,
    `A typical active day has ${b((cs.length / nd).toFixed(1))} commits across ${b((sumBy(cs, (c) => c.mins) / 60 / nd).toFixed(1) + ' h')}.`,
    bm && Object.keys(mth).length > 1 ? `Biggest month: ${b(monthName(bm[0]))} with ${b(bm[1])} commits.` : null,
  ].filter(Boolean);
  const list = lines.map((l, i) => `<g class="r" style="animation-delay:${0.1 + i * 0.08}s"><circle cx="38" cy="${96 + i * 26}" r="3" fill="${t.ramp[3]}"/><text x="52" y="${100 + i * 26}" fill="${t.muted}" font-size="13">${l}</text></g>`).join('');
  const y0 = 100 + lines.length * 26 + 26;
  const st = longestStreak(cs.map((c) => c.date));
  const rec = [[busiest[1].length + ' commits', 'busiest day', fmtDate(busiest[0])], [fmt(bigC.ca + bigC.cd) + ' lines', 'biggest commit', `${fmtDate(bigC.date)} · ${D.projects[bigC.p].id}`],
    [hrs(dur(long)), 'longest session', `${fmtDate(long[0].date)} · ${long.length} commits`], [st + (st === 1 ? ' day' : ' days'), 'longest commit streak', 'consecutive days with commits']];
  return frame(t, y0 + 78, `${title(t, 'Highlights &amp; records', 'Last 12 months')}${list}
<line x1="32" x2="${W - 32}" y1="${y0 - 14}" y2="${y0 - 14}" stroke="${t.stroke}" stroke-dasharray="2 4"/>${kpiRow(t, y0 + 12, rec.map(([v, l, s]) => [v, l, t.text, s]), 0.5)}`);
}

// ---------- 12. month by month (last 12 months)
function monthsCard(t) {
  const ks = []; for (let i = 11; i >= 0; i--) { const d = new Date(today + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i, 1); ks.push(d.toISOString().slice(0, 7)); }
  const m = Object.fromEntries(ks.map((k) => [k, { n: 0, a: 0, d: 0, mins: 0, days: new Set() }]));
  C.forEach((c) => { const o = m[c.date.slice(0, 7)]; if (o) { o.n++; o.a += c.ca; o.d += c.cd; o.mins += c.mins; o.days.add(c.date); } });
  const mx = Math.max(1, ...ks.map((k) => m[k].n)), T = 110, rh = 26;
  const head = [[32, 'MONTH', 'start'], [150, 'COMMITS', 'start'], [560, 'ADDED', 'end'], [680, 'REMOVED', 'end'], [770, 'EST. TIME', 'end'], [868, 'ACTIVE DAYS', 'end']].map(([x, s, a]) => label(t, x, 90, s, { anchor: a, color: t.faint })).join('');
  const rows = ks.slice().reverse().map((k, i) => {
    const o = m[k], y = T + i * rh, dim = o.n ? t.text : t.faint;
    return `<g class="r" style="animation-delay:${0.1 + i * 0.04}s"><text x="32" y="${y + 4}" fill="${dim}" font-size="12.5">${monthName(k)}</text>
<text x="150" y="${y + 4}" fill="${dim}" font-family="${MONO}" font-size="12">${o.n}</text><rect class="bx" style="animation-delay:${0.3 + i * 0.04}s" x="200" y="${y - 4}" width="${Math.max(o.n ? 3 : 0, (o.n / mx) * 280).toFixed(1)}" height="8" rx="4" fill="${t.ramp[3]}"/>
<text x="560" y="${y + 4}" fill="${o.n ? t.add : t.faint}" font-family="${MONO}" font-size="12" text-anchor="end">+${fmt(o.a)}</text><text x="680" y="${y + 4}" fill="${o.n ? t.del : t.faint}" font-family="${MONO}" font-size="12" text-anchor="end">−${fmt(o.d)}</text>
<text x="770" y="${y + 4}" fill="${dim}" font-family="${MONO}" font-size="12" text-anchor="end">${o.n ? hrs(o.mins) : '—'}</text><text x="868" y="${y + 4}" fill="${dim}" font-family="${MONO}" font-size="12" text-anchor="end">${o.days.size}</text></g>`;
  }).join('');
  return frame(t, T + 12 * rh + 6, `${title(t, 'Month by month', 'Commits, lines and estimated time per month · last 12 months')}${head}${rows}`);
}

// ---------- 13. one period (a year or a month): the dashboard's filtered view, pre-rendered
function periodCard(t, name, cs, kind, from, to) {
  const n = cs.length, days = new Set(cs.map((c) => c.date)).size, m = sumBy(cs, (c) => c.mins);
  const kp = kpiRow(t, 104, [[fmt(n), 'commits'], ['+' + cmp(sumBy(cs, (c) => c.ca)), 'added', t.add], ['−' + cmp(sumBy(cs, (c) => c.cd)), 'removed', t.del], [hrs(m), 'est. time'], [fmt(days), 'active days'], [fmt(new Set(cs.map((c) => c.p)).size), 'projects']]);
  const month = kind === 'month', keyOf = month ? (d) => d : wkStart;
  const keys = []; for (let k = month ? from : wkStart(from); k <= to; k = addD(k, month ? 1 : 7)) keys.push(k);
  const cnt = {}; cs.forEach((c) => { const k = keyOf(c.date); cnt[k] = (cnt[k] || 0) + 1; });
  const mx = Math.sqrt(Math.max(1, ...keys.map((k) => cnt[k] || 0))), bw = (W - 64) / keys.length, base = 218;
  let prevM = '', axis = '', lastLab = -9;
  const bs = keys.map((k, i) => {
    const v = cnt[k] || 0, h = (Math.sqrt(v) / mx) * 56, x = 32 + i * bw;
    const labelIt = month ? i % 5 === 0 : addD(k, 3).slice(5, 7) !== prevM && addD(k, 3).slice(0, 4) === from.slice(0, 4) && i - lastLab >= 3;
    if (labelIt) lastLab = i;
    if (labelIt) axis += `<text x="${(x + bw / 2).toFixed(1)}" y="${base + 16}" fill="${t.muted}" font-size="10" text-anchor="middle">${month ? +k.slice(8) : MONTHS[+addD(k, 3).slice(5, 7) - 1]}</text>`;
    prevM = addD(k, 3).slice(5, 7);
    return v ? `<rect class="bu" style="animation-delay:${0.3 + i * 0.012}s" x="${(x + 1).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${Math.max(1.5, bw - 2).toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="${bw > 8 ? 3 : 1.5}" fill="${t.ramp[3]}"/>` : `<rect x="${(x + 1).toFixed(1)}" y="${base - 1.5}" width="${Math.max(1.5, bw - 2).toFixed(1)}" height="1.5" rx=".75" fill="${t.stroke}"/>`;
  }).join('');
  const pt = [0, 0, 0, 0]; cs.forEach((c) => pt[part(c.h)]++);
  const cw = (W - 64 - 48) / 3, x1 = 32, x2 = 32 + cw + 24, x3 = 32 + 2 * (cw + 24), Y = 282;
  const parts = PARTS.map((p, i) => ({ name: p, v: pt[i], label: Math.round((pt[i] / Math.max(1, n)) * 100) + '%' }));
  const pr = projMins(cs).slice(0, 4).map((p) => ({ name: p.id, v: p.mins, label: hrs(p.mins) }));
  const lg = langMins(cs).slice(0, 4).map(([k, v]) => ({ name: k, v, label: hrs(v), color: LANGC[k] || t.faint }));
  const sub = `${fmt(n)} commits across ${days} active days · ${month ? 'daily' : 'weekly'} commits below`;
  return frame(t, Y + 4 * 28 + 18, `${title(t, esc(name), sub)}${kp}${bs}${axis}
<line x1="32" x2="${W - 32}" y1="${base}" y2="${base}" stroke="${t.stroke}"/>
${label(t, x1, Y - 14, 'TIME OF DAY', { color: t.faint })}${hrows(t, x1, Y + 8, cw, parts, { nameW: 70, labelW: 44 })}
${label(t, x2, Y - 14, 'TOP PROJECTS · HOURS', { color: t.faint })}${hrows(t, x2, Y + 8, cw, pr, { nameW: 70, labelW: 52, delay: 0.4 })}
${label(t, x3, Y - 14, 'TOP LANGUAGES · HOURS', { color: t.faint })}${hrows(t, x3, Y + 8, cw, lg, { nameW: 84, labelW: 52, delay: 0.5 })}`);
}

// ---------- write everything
for (const f of readdirSync('assets')) if (f.startsWith('period-')) rmSync(`assets/${f}`);
const lastDay = (k) => { const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)); return d.toISOString().slice(0, 10); };
const monthsWith = [...new Set(C.map((c) => c.date.slice(0, 7)))].sort().reverse();
const yearsWith = [...new Set(C.map((c) => c.date.slice(0, 4)))].sort().reverse();
const CARDS = { overview, activity, churn, rhythm, punchcard, projects: projectsCard, languages, style: styleCard, insights, months: monthsCard, claude, 'spotify-head': spotify };
const have = new Set();
for (const [name, t] of Object.entries(THEMES)) {
  for (const [k, fn] of Object.entries(CARDS)) { const s = fn(t); if (s) { writeFileSync(`assets/${k}-${name}.svg`, s); have.add(k); } }
  for (const y of yearsWith) writeFileSync(`assets/period-${y}-${name}.svg`, periodCard(t, y, C.filter((c) => c.date.startsWith(y)), 'year', `${y}-01-01`, y === today.slice(0, 4) ? today : `${y}-12-31`));
  for (const k of monthsWith) writeFileSync(`assets/period-${k}-${name}.svg`, periodCard(t, monthName(k), C.filter((c) => c.date.startsWith(k)), 'month', `${k}-01`, k === today.slice(0, 7) ? today : lastDay(k)));
}

// ---------- README (generated, so the period selector always matches the data)
const pic = (k, alt) => `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="assets/${k}-dark.svg">\n  <img alt="${alt}" src="assets/${k}-light.svg" width="100%">\n</picture>`;
const ALT = { overview: 'Overview', activity: 'Activity heatmap', churn: 'Code churn', rhythm: 'When I code', punchcard: 'Punchcard', projects: 'Time by project', languages: 'Languages', style: 'How I commit', insights: 'Highlights and records', months: 'Month by month', claude: 'Building with Claude Code', 'spotify-head': 'Recently played' };
const order = ['overview', 'activity', 'churn', 'rhythm', 'punchcard', 'projects', 'languages', 'style', 'insights', 'months', 'claude', 'spotify-head'].filter((k) => have.has(k));
const yearBlocks = yearsWith.map((y) => {
  const ms = monthsWith.filter((k) => k.startsWith(y)), n = C.filter((c) => c.date.startsWith(y)).length;
  const inner = ms.map((k) => `<details>\n<summary>${monthName(k)} · ${fmt(C.filter((c) => c.date.startsWith(k)).length)} commits</summary>\n<br>\n\n${pic('period-' + k, monthName(k))}\n\n</details>`).join('\n\n');
  return `<details>\n<summary><b>${y}</b> · ${fmt(n)} commits</summary>\n<br>\n\n${pic('period-' + y, y)}\n\n${inner}\n\n</details>`;
}).join('\n\n');
writeFileSync('README.md', `<div align="center">

${order.map((k) => pic(k, ALT[k]) + (k === 'spotify-head' ? '\n\n' + spotifyList() : '')).join('\n\n')}

### Zoom into a period
<sub>click a year, then a month</sub>

${yearBlocks}

<sub>Generated from the GitHub API, private repos included (aggregates only, no repo names). Source in <code>scripts/</code> · <a href="https://galbir.github.io/Galbir/">live filterable version</a></sub>

</div>
`);
console.log({ commits: win.length, today, claude: !!CL, cards: order.length, periods: yearsWith.length + monthsWith.length });
