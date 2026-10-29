// Renders data.json into themed SVGs in ./assets (no dependencies).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const data = JSON.parse(readFileSync('data.json', 'utf8'));
mkdirSync('assets', { recursive: true });

const THEMES = {
  dark: {
    bg: '#0d1117', card: '#151b23', stroke: '#2a313c', text: '#e6edf3', muted: '#8b949e', faint: '#6e7681',
    ramp: ['#1b222c', '#14505e', '#13838a', '#34d1a0', '#d9ff70'],
    add: '#34d1a0', del: '#ff7a6b', axis: '#2a313c',
  },
  light: {
    bg: '#ffffff', card: '#f6f8fa', stroke: '#d0d7de', text: '#1f2328', muted: '#59636e', faint: '#818b98',
    ramp: ['#e6eaef', '#b5e3e8', '#5ec6c9', '#1aa98a', '#0b6b4d'],
    add: '#1aa98a', del: '#e5534b', axis: '#d0d7de',
  },
};
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
const W = 900;

const fmt = (n) => n.toLocaleString('en-US');
const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : fmt(n));
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- derived numbers
const today = new Date(data.generatedAt.slice(0, 10) + 'T00:00:00Z');
const start = addDays(today, -today.getUTCDay() - 52 * 7); // Sunday, 53 columns
const win = [];
for (let d = start; d <= today; d = addDays(d, 1)) win.push({ date: iso(d), n: data.days[iso(d)] || 0, dow: d.getUTCDay() });
const yearTotal = win.reduce((s, x) => s + x.n, 0);
const activeDays = win.filter((x) => x.n > 0).length;
const best = win.reduce((a, b) => (b.n > a.n ? b : a));

const all = Object.keys(data.days).sort();
let longest = 0, run = 0;
for (let d = new Date(all[0] + 'T00:00:00Z'); d <= today; d = addDays(d, 1)) {
  run = (data.days[iso(d)] || 0) > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}
let current = 0;
for (let d = today; ; d = addDays(d, -1)) {
  if ((data.days[iso(d)] || 0) > 0) current++;
  else if (iso(d) !== iso(today)) break;
}
const byDow = [0, 0, 0, 0, 0, 0, 0];
win.forEach((x) => (byDow[x.dow] += x.n));
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const busiestDow = DOW[byDow.indexOf(Math.max(...byDow))];

const nz = win.filter((x) => x.n > 0).map((x) => x.n).sort((a, b) => a - b);
const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] || 1;
const cuts = [q(0.25), q(0.5), q(0.75)];
const level = (n) => (n === 0 ? 0 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4);

const frame = (t, w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${SANS}">
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="14" fill="${t.bg}" stroke="${t.stroke}"/>
${body}
</svg>`;
const label = (t, x, y, s, { size = 11, anchor = 'start', color = t.muted } = {}) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" letter-spacing=".08em" text-anchor="${anchor}">${s}</text>`;

// ---------- 1. activity heatmap
function activity(t) {
  const L = 48, T = 92, step = (W - 32 - L) / 53, C = step - 3, G = 3;
  const cells = [], months = [];
  let lastMonth = -1, lastCol = -9;
  win.forEach((x, i) => {
    const col = Math.floor(i / 7);
    const cx = L + col * step, cy = T + x.dow * step;
    const m = +x.date.slice(5, 7) - 1;
    if (x.dow === 0 && m !== lastMonth && col >= lastCol + 3 && col < 51) { months.push(`<text x="${cx}" y="${T - 10}" fill="${t.muted}" font-size="11">${MONTHS[m]}</text>`); lastMonth = m; lastCol = col; }
    cells.push(`<rect x="${cx}" y="${cy}" width="${C}" height="${C}" rx="3.5" fill="${t.ramp[level(x.n)]}"><title>${x.date}: ${x.n}</title></rect>`);
  });
  const dowLabels = [1, 3, 5].map((d) => `<text x="${L - 10}" y="${T + d * step + 10}" fill="${t.faint}" font-size="10" text-anchor="end">${DOW[d].slice(0, 3)}</text>`).join('');
  const gridBottom = T + 7 * step;
  const legendX = W - 32 - 5 * (C + 4) - 52;
  const legend = `${label(t, legendX, gridBottom + 18, 'LESS', { anchor: 'end' })}` +
    t.ramp.map((c, i) => `<rect x="${legendX + 8 + i * (C + 4)}" y="${gridBottom + 7}" width="${C}" height="${C}" rx="3.5" fill="${c}"/>`).join('') +
    label(t, legendX + 8 + 5 * (C + 4) + 4, gridBottom + 18, 'MORE');
  const stats = [
    [fmt(activeDays), 'active days'], [`${current}d`, 'current streak'], [`${longest}d`, 'longest streak'],
    [fmt(best.n), `best day · ${MONTHS[+best.date.slice(5, 7) - 1]} ${+best.date.slice(8)}`], [busiestDow, 'busiest weekday'],
  ];
  const sy = gridBottom + 52, colW = (W - 2 * 32) / stats.length;
  const statEls = stats.map(([v, l], i) => {
    const x = 32 + i * colW;
    return `<text x="${x}" y="${sy}" fill="${t.text}" font-family="${MONO}" font-size="20" font-weight="600">${v}</text>${label(t, x, sy + 18, l.toUpperCase(), { size: 10 })}`;
  }).join('');
  const sep = `<line x1="32" x2="${W - 32}" y1="${gridBottom + 24}" y2="${gridBottom + 24}" stroke="${t.stroke}" stroke-dasharray="2 4"/>`;
  const H = sy + 40;
  return frame(t, W, H, `
<text x="32" y="42" fill="${t.text}" font-size="18" font-weight="600">Activity</text>
<text x="32" y="64" fill="${t.muted}" font-size="12.5"><tspan fill="${t.text}" font-family="${MONO}" font-weight="600">${fmt(yearTotal)}</tspan> contributions in the last year · private work included</text>
${months.join('')}${dowLabels}${cells.join('')}${legend}${sep}${statEls}`);
}

// ---------- 2. code churn
function churn(t) {
  const weeks = [];
  for (let i = 51; i >= 0; i--) {
    const ws = Math.floor((start.getTime() + (52 - i) * 7 * 864e5) / 1000);
    weeks.push({ ws, ...(data.churn[ws] || { a: 0, d: 0, c: 0 }) });
  }
  const { added, deleted, commits, repos } = data.totals;
  const net = added - deleted;
  const bigs = [
    [`+${fmt(added)}`, 'lines added', t.add], [`−${fmt(deleted)}`, 'lines removed', t.del],
    [`${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}`, 'net lines', t.text], [fmt(commits), `commits · ${repos} repos`, t.text],
  ];
  const colW = (W - 64) / 4;
  const bigEls = bigs.map(([v, l, c], i) => `<text x="${32 + i * colW}" y="104" fill="${c}" font-family="${MONO}" font-size="22" font-weight="600">${v}</text>${label(t, 32 + i * colW, 124, l.toUpperCase(), { size: 10 })}`).join('');
  // chart: sqrt scale so one huge week doesn't flatten everything
  const top = 170, mid = 252, bot = 334, bw = 12, gap = 4, x0 = 32 + (W - 64 - 52 * (bw + gap) + gap) / 2;
  const mx = Math.sqrt(Math.max(1, ...weeks.map((w) => Math.max(w.a, w.d))));
  const bars = weeks.map((w, i) => {
    const x = x0 + i * (bw + gap);
    const ha = (Math.sqrt(w.a) / mx) * (mid - top), hd = (Math.sqrt(w.d) / mx) * (bot - mid);
    return (w.a ? `<rect x="${x}" y="${mid - ha - 1}" width="${bw}" height="${Math.max(2, ha)}" rx="3" fill="${t.add}"><title>+${fmt(w.a)}</title></rect>` : '') +
      (w.d ? `<rect x="${x}" y="${mid + 1}" width="${bw}" height="${Math.max(2, hd)}" rx="3" fill="${t.del}"><title>−${fmt(w.d)}</title></rect>` : '') +
      (!w.a && !w.d ? `<rect x="${x}" y="${mid - 1}" width="${bw}" height="2" rx="1" fill="${t.axis}"/>` : '');
  }).join('');
  return frame(t, W, 372, `
<text x="32" y="42" fill="${t.text}" font-size="18" font-weight="600">Code churn</text>
<text x="32" y="64" fill="${t.muted}" font-size="12.5">Lines written and deleted per week, all-time totals above · private repos included</text>
${bigEls}
<line x1="32" x2="${W - 32}" y1="${mid}" y2="${mid}" stroke="${t.axis}"/>
${bars}
${label(t, 32, mid - 12, 'ADDED ↑', { color: t.add })}
${label(t, 32, mid + 22, 'REMOVED ↓', { color: t.del })}
<text x="${W - 32}" y="350" fill="${t.faint}" font-size="10" text-anchor="end">last 52 weeks · square-root scale</text>`);
}

// ---------- 3. languages
const LANG_COLORS = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#4b8bbe', Astro: '#ff5d01', HTML: '#e34c26', CSS: '#7b5ea7',
  PHP: '#8892bf', SCSS: '#c6538c', Shell: '#89e051', MDX: '#fcb32c', Vue: '#41b883', Dockerfile: '#384d54', PLpgSQL: '#336790',
};
function languages(t) {
  const SKIP = new Set(['Dockerfile', 'Batchfile', 'PowerShell', 'Makefile']);
  const entries = Object.entries(data.langs).filter(([k]) => !SKIP.has(k)).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const top = entries.slice(0, 8);
  const rest = total - top.reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push(['Other', rest]);
  const barX = 32, barW = W - 64, barY = 84, barH = 14;
  let x = barX;
  const segs = top.map(([k, v], i) => {
    const w = (v / total) * barW;
    const el = `<rect x="${x.toFixed(2)}" y="${barY}" width="${Math.max(0, w - 2).toFixed(2)}" height="${barH}" rx="${i === 0 || i === top.length - 1 ? 7 : 3}" fill="${LANG_COLORS[k] || t.faint}"/>`;
    x += w;
    return el;
  }).join('');
  const colW = (W - 64) / 3;
  const items = top.map(([k, v], i) => {
    const cx = 32 + (i % 3) * colW, cy = 140 + Math.floor(i / 3) * 30;
    return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${LANG_COLORS[k] || t.faint}"/>
<text x="${cx + 18}" y="${cy}" fill="${t.text}" font-size="13" font-weight="500">${k}</text>
<text x="${cx + colW - 24}" y="${cy}" fill="${t.muted}" font-family="${MONO}" font-size="12" text-anchor="end">${((v / total) * 100).toFixed(1)}%</text>`;
  }).join('');
  const H = 140 + Math.ceil(top.length / 3) * 30 + 14;
  return frame(t, W, H, `
<text x="32" y="42" fill="${t.text}" font-size="18" font-weight="600">Languages</text>
<text x="32" y="64" fill="${t.muted}" font-size="12.5">Share of code by bytes across every repo I commit to</text>
${segs}${items}`);
}

for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(`assets/activity-${name}.svg`, activity(t));
  writeFileSync(`assets/churn-${name}.svg`, churn(t));
  writeFileSync(`assets/languages-${name}.svg`, languages(t));
}
console.log({ yearTotal, activeDays, current, longest, best, busiestDow, cuts });
