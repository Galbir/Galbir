// One-time Spotify setup. Run it on your machine:  node scripts/spotify-auth.mjs
// It asks for your app's Client ID/Secret (typed here, never sent anywhere except Spotify),
// opens the Spotify consent page, catches the redirect on 127.0.0.1:8888, then stores the three
// values straight into GitHub Actions secrets with `gh secret set`. Nothing is written to disk.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const REPO = process.env.GH_REPO || 'Galbir/Galbir';
const REDIRECT = 'http://127.0.0.1:8888/callback';
const SCOPE = 'user-read-recently-played';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const id = (process.env.SPOTIFY_CLIENT_ID || await rl.question('Spotify Client ID: ')).trim();
const secret = (process.env.SPOTIFY_CLIENT_SECRET || await rl.question('Spotify Client Secret: ')).trim();
rl.close();
if (!id || !secret) { console.error('Need both values.'); process.exit(1); }

const state = randomBytes(8).toString('hex');
const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE, state });

const code = await new Promise((resolve, reject) => {
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1:8888');
    if (u.pathname !== '/callback') { res.end(); return; }
    const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(ok ? '<h2>Gata. Poti inchide fereastra.</h2>' : '<h2>Eroare: ' + (u.searchParams.get('error') || 'cod lipsa') + '</h2>');
    srv.close();
    ok ? resolve(u.searchParams.get('code')) : reject(new Error(u.searchParams.get('error') || 'no code'));
  }).listen(8888, '127.0.0.1', () => {
    console.log('\nDeschid pagina Spotify. Daca nu se deschide singura, intra pe:\n' + url + '\n');
    try { spawnSync('cmd', ['/c', 'start', '', url.replace(/&/g, '^&')], { stdio: 'ignore' }); } catch {}
  });
});

const tok = await (await fetch('https://accounts.spotify.com/api/token', {
  method: 'POST',
  headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
})).json();
if (!tok.refresh_token) { console.error('Spotify nu a returnat refresh token:', tok.error_description || tok.error); process.exit(1); }

for (const [name, value] of [['SPOTIFY_CLIENT_ID', id], ['SPOTIFY_CLIENT_SECRET', secret], ['SPOTIFY_REFRESH_TOKEN', tok.refresh_token]]) {
  execSync(`gh secret set ${name} --repo ${REPO}`, { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
}
console.log('\nSetat: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN. Ruleaza workflow-ul "update" din tab-ul Actions.');
