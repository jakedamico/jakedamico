// Counts lines of code across every repo I own (private included) and draws
// the two README panels — "lines of code" by language, and largest projects —
// as ascii-bar SVGs in the jakedami.co style (monospace, lowercase, mono
// palette, light/dark variants).
//
//   node scripts/loc-stats.js
//
// Auth: GH_TOKEN env if set (CI: the METRICS_TOKEN PAT), else `gh auth token`.
// Shallow-clones each repo to a temp dir, counts non-blank lines in known
// code extensions with vendored/generated paths skipped, writes dist/*.svg
// plus dist/loc-data.json for inspection.
'use strict';
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OWNER = 'jakedamico';
// Repos that aren't really written code (generated dumps, asset piles).
const EXCLUDE_REPOS = new Set(['forkful-screenshots']);

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'vendor', 'venv', '.venv',
  'env', '__pycache__', 'target', '.next', '.nuxt', 'coverage', 'Pods',
  'DerivedData', 'bower_components', '.idea', '.vscode', 'site-packages',
]);
const SKIP_FILES = /(\.min\.(js|css)$|\.map$|-lock\.json$|^yarn\.lock$|^pnpm-lock\.yaml$|^Cargo\.lock$|^poetry\.lock$|^Gemfile\.lock$|^composer\.lock$)/;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // bigger text files are data, not code

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', swift: 'swift', html: 'html', htm: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  c: 'c', h: 'c', cpp: 'c++', cc: 'c++', cxx: 'c++', hpp: 'c++',
  cs: 'c#', java: 'java', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
  kt: 'kotlin', kts: 'kotlin', sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'powershell', sql: 'sql', vue: 'vue', svelte: 'svelte',
  dart: 'dart', lua: 'lua', r: 'r',
};

function token() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  return execSync('gh auth token', { encoding: 'utf8' }).trim();
}

async function listRepos(tok) {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?affiliation=owner&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${tok}`, 'User-Agent': OWNER } });
    if (!res.ok) throw new Error(`repo list failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter(r => !r.fork && !r.archived && !EXCLUDE_REPOS.has(r.name));
}

function countDir(dir, into) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) countDir(path.join(dir, ent.name), into);
      continue;
    }
    if (!ent.isFile() || SKIP_FILES.test(ent.name)) continue;
    const ext = path.extname(ent.name).slice(1).toLowerCase();
    const lang = EXT_LANG[ext];
    if (!lang) continue;
    const fp = path.join(dir, ent.name);
    let stat;
    try { stat = fs.statSync(fp); } catch { continue; }
    if (stat.size > MAX_FILE_BYTES || stat.size === 0) continue;
    const buf = fs.readFileSync(fp);
    if (buf.subarray(0, 8192).includes(0)) continue; // binary
    let lines = 0;
    const s = buf.toString('utf8');
    for (let i = 0; i < s.length;) {
      let j = s.indexOf('\n', i);
      if (j === -1) j = s.length;
      if (s.slice(i, j).trim()) lines++;
      i = j + 1;
    }
    into[lang] = (into[lang] || 0) + lines;
  }
}

// ── rendering ──────────────────────────────────────────────────────────────

const RAMP = ' .,:;+*o#';
const COLS = 52;
const COL_W = 7.8;
const PAD = 14;
const ROW_H = 21;
const FONT = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const THEMES = {
  dark: { bright: '#e6e6e6', mid: '#9a9a9a', dim: '#565656' },
  light: { bright: '#1c1a17', mid: '#6f6a60', dim: '#b8b3aa' },
};

const fmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'm' :
  n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);

function bar(frac, width) {
  const cells = frac * width;
  const full = Math.floor(cells);
  let s = '#'.repeat(full);
  if (full < width) {
    const part = RAMP[Math.round((cells - full) * (RAMP.length - 1))];
    s += part === ' ' ? '' : part;
  }
  return s;
}

const put = (row, x, s) => { for (let i = 0; i < s.length && x + i < COLS; i++) row[x + i] = s[i]; };
const padL = (s, w) => s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s;
const trunc = (s, w) => s.length <= w ? s : s.slice(0, w - 1) + '…';

// rows: [{bright, mid, dim}] as COLS-char strings; returns one themed svg.
function panel(rows, theme) {
  const width = Math.round(COLS * COL_W + PAD * 2);
  const height = PAD * 2 + rows.length * ROW_H;
  const layers = { bright: [], mid: [], dim: [] };
  rows.forEach((r, i) => {
    const y = PAD + 15 + i * ROW_H;
    for (const k of Object.keys(layers)) {
      if (r[k] && r[k].trim()) layers[k].push({ y, s: r[k] });
    }
  });
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="lines of code">`;
  for (const [k, color] of Object.entries(theme)) {
    if (!layers[k].length) continue;
    out += `<text xml:space="preserve" fill="${color}" font-family="${FONT}" font-size="13"`;
    for (const { y, s } of layers[k]) {
      const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      out += `><tspan x="${PAD}" y="${y}" textLength="${(COLS * COL_W).toFixed(1)}" lengthAdjust="spacing">${esc}</tspan`;
    }
    out += `></text>`;
  }
  return out + `</svg>\n`;
}

const blank = () => ({ bright: null, mid: null, dim: null });

function titleRow(main, sub) {
  const b = new Array(COLS).fill(' '), d = new Array(COLS).fill(' ');
  put(b, 0, main);
  put(d, main.length, sub);
  return { bright: b.join(''), mid: null, dim: d.join('') };
}

function itemRow(name, nameW, frac, value, pct) {
  const b = new Array(COLS).fill(' '), m = new Array(COLS).fill(' '), d = new Array(COLS).fill(' ');
  put(b, 0, trunc(name, nameW));
  const barX = nameW + 1, barW = 24;
  const fill = bar(frac, barW);
  put(m, barX, fill);
  put(d, barX + fill.length, '.'.repeat(barW - fill.length));
  put(m, barX + barW + 2, padL(value, 7));
  if (pct != null) put(d, barX + barW + 11, padL(pct, 4));
  return { bright: b.join(''), mid: m.join(''), dim: d.join('') };
}

function footRow(text) {
  const d = new Array(COLS).fill(' ');
  put(d, 0, text);
  return { bright: null, mid: null, dim: d.join('') };
}

// ── main ───────────────────────────────────────────────────────────────────

(async () => {
  const tok = token();
  const repos = await listRepos(tok);
  console.log(`counting ${repos.length} repos…`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-'));
  const byRepo = {};   // repo -> {lang: lines}
  for (const r of repos) {
    const dest = path.join(work, r.name);
    try {
      execFileSync('git', [
        'clone', '--depth', '1', '--quiet', '-c', 'core.longpaths=true',
        `https://x-access-token:${tok}@github.com/${OWNER}/${r.name}.git`, dest,
      ], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    } catch (e) {
      console.error(`  clone failed: ${r.name} — skipped`);
      continue;
    }
    const langs = {};
    countDir(dest, langs);
    const total = Object.values(langs).reduce((a, b) => a + b, 0);
    if (total > 0) byRepo[r.name] = langs;
    console.log(`  ${r.name}: ${fmt(total)}`);
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.rmSync(work, { recursive: true, force: true });

  const byLang = {};
  for (const langs of Object.values(byRepo))
    for (const [l, n] of Object.entries(langs)) byLang[l] = (byLang[l] || 0) + n;

  const grand = Object.values(byLang).reduce((a, b) => a + b, 0);
  const langsSorted = Object.entries(byLang).sort((a, b) => b[1] - a[1]);
  const top = langsSorted.slice(0, 7);
  const restSum = langsSorted.slice(7).reduce((a, [, n]) => a + n, 0);
  if (restSum > 0) top.push(['other', restSum]);

  const projects = Object.entries(byRepo)
    .map(([name, langs]) => [name, Object.values(langs).reduce((a, b) => a + b, 0)])
    .sort((a, b) => b[1] - a[1]).slice(0, 8);

  // language panel
  const maxLang = top[0][1];
  const langRows = [
    titleRow('lines of code', ' · by language, every repo'),
    blank(),
    ...top.map(([l, n]) => itemRow(l, 12, n / maxLang, fmt(n), Math.round(100 * n / grand) + '%')),
    blank(),
    footRow(`total ${fmt(grand)} lines · ${Object.keys(byRepo).length} repos`),
  ];

  // projects panel
  const maxProj = projects[0][1];
  const privCount = repos.filter(r => r.private && byRepo[r.name]).length;
  const projRows = [
    titleRow('largest projects', ' · by lines'),
    blank(),
    ...projects.map(([name, n]) => itemRow(name.toLowerCase(), 16, n / maxProj, fmt(n), null)),
    blank(),
    footRow(`${privCount} private · ${Object.keys(byRepo).length - privCount} public`),
  ];

  const dist = path.join(__dirname, '..', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'loc-languages-dark.svg'), panel(langRows, THEMES.dark));
  fs.writeFileSync(path.join(dist, 'loc-languages.svg'), panel(langRows, THEMES.light));
  fs.writeFileSync(path.join(dist, 'loc-projects-dark.svg'), panel(projRows, THEMES.dark));
  fs.writeFileSync(path.join(dist, 'loc-projects.svg'), panel(projRows, THEMES.light));
  // debug data stays OUT of dist — dist is published, and this lists every
  // repo by name, not just the top 8 the panels show
  fs.writeFileSync(path.join(__dirname, '..', 'loc-data.json'),
    JSON.stringify({ generated: new Date().toISOString(), byLang, byRepo: Object.fromEntries(
      Object.entries(byRepo).map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)])) }, null, 2));
  console.log(`done — ${fmt(grand)} lines across ${Object.keys(byRepo).length} repos`);
})().catch((e) => { console.error(e); process.exit(1); });
