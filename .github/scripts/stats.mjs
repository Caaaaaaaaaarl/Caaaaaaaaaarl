// Draws stats.svg for the profile README from the public GitHub API:
// own repositories, stars, public commits, followers and a language
// breakdown. Run by .github/workflows/profile-assets.yml; no dependencies.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const USER = process.env.PROFILE_USER || 'Caaaaaaaaaarl';
const OUT_DIR = process.env.OUT_DIR || 'dist';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${USER}-profile-stats` };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

// GitHub's linguist colours for the languages likely to appear.
const COLORS = {
  'C#': '#178600', HTML: '#e34c26', CSS: '#663399', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  Kotlin: '#A97BFF', PHP: '#4F5D95', Java: '#b07219', Python: '#3572A5', SCSS: '#c6538c',
  Dart: '#00B4AB', 'C++': '#f34b7d', Other: '#8b949e'
};

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${path} -> ${response.status}`);
  return response.json();
}

const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const compact = n => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

const profile = await api(`/users/${USER}`);
const repos = (await api(`/users/${USER}/repos?per_page=100&type=owner`))
  .filter(repo => !repo.fork && repo.name.toLowerCase() !== USER.toLowerCase());
const stars = repos.reduce((total, repo) => total + repo.stargazers_count, 0);

const bytes = {};
for (const repo of repos) {
  const languages = await api(`/repos/${USER}/${repo.name}/languages`);
  for (const [name, size] of Object.entries(languages)) bytes[name] = (bytes[name] || 0) + size;
}

let commits = '—';
try {
  commits = compact((await api(`/search/commits?q=author:${USER}&per_page=1`)).total_count);
} catch (error) {
  console.warn('Commit count unavailable:', error.message);
}

// Top five languages by size; the rest are grouped as Other.
const total = Object.values(bytes).reduce((sum, size) => sum + size, 0) || 1;
const ranked = Object.entries(bytes).sort((a, b) => b[1] - a[1]);
const languages = ranked.slice(0, 5).map(([name, size]) => ({ name, share: size / total }));
const rest = ranked.slice(5).reduce((sum, [, size]) => sum + size, 0);
if (rest > 0) languages.push({ name: 'Other', share: rest / total });

const WIDTH = 840;
const PAD = 24;
const tiles = [
  { label: 'Repositories', value: compact(repos.length), color: '#58a6ff' },
  { label: 'Stars earned', value: compact(stars), color: '#e3b341' },
  { label: 'Public commits', value: commits, color: '#3fb950' },
  { label: 'Followers', value: compact(profile.followers), color: '#f778ba' }
];
const tileGap = 12;
const tileWidth = (WIDTH - PAD * 2 - tileGap * (tiles.length - 1)) / tiles.length;
const tileSvg = tiles.map((tile, i) => {
  const x = PAD + i * (tileWidth + tileGap);
  return `
    <g class="rise" style="animation-delay:${120 + i * 90}ms">
      <rect x="${x}" y="58" width="${tileWidth}" height="66" rx="11" fill="#161b22" stroke="#21262d"/>
      <circle cx="${x + 18}" cy="78" r="4.5" fill="${tile.color}"/>
      <text x="${x + 30}" y="82" class="label">${escapeXml(tile.label)}</text>
      <text x="${x + 16}" y="112" class="value">${escapeXml(tile.value)}</text>
    </g>`;
}).join('');

const barWidth = WIDTH - PAD * 2;
let offset = PAD;
const segments = languages.map(language => {
  const width = Math.max(language.share * barWidth, 3);
  const segment = `<rect x="${offset.toFixed(1)}" y="160" width="${width.toFixed(1)}" height="10" fill="${COLORS[language.name] || COLORS.Other}"/>`;
  offset += width;
  return segment;
}).join('');

let legendX = PAD;
const legend = languages.map(language => {
  const label = `${language.name} ${(language.share * 100).toFixed(1)}%`;
  const item = `
    <g class="rise" style="animation-delay:600ms">
      <circle cx="${legendX + 5}" cy="193" r="5" fill="${COLORS[language.name] || COLORS.Other}"/>
      <text x="${legendX + 15}" y="197" class="legend">${escapeXml(label)}</text>
    </g>`;
  legendX += 30 + label.length * 7;
  return item;
}).join('');

const updated = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} 220" width="${WIDTH}" height="220" role="img" aria-labelledby="stats-title">
  <title id="stats-title">${escapeXml(USER)} on GitHub: ${repos.length} repositories, ${stars} stars, ${escapeXml(commits)} public commits, ${profile.followers} followers</title>
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#58a6ff"/><stop offset="0.5" stop-color="#a371f7"/><stop offset="1" stop-color="#f778ba"/>
    </linearGradient>
    <clipPath id="card"><rect width="${WIDTH}" height="220" rx="16"/></clipPath>
    <clipPath id="bar"><rect x="${PAD}" y="160" width="${barWidth}" height="10" rx="5"/></clipPath>
  </defs>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif; }
    .title { fill: #e6edf3; font-size: 17px; font-weight: 700; }
    .muted { fill: #7d8590; font-size: 12px; }
    .label { fill: #7d8590; font-size: 12px; font-weight: 600; }
    .value { fill: #e6edf3; font-size: 25px; font-weight: 800; }
    .legend { fill: #c9d1d9; font-size: 12px; }
    .rise { animation: rise 0.7s ease-out both; }
    .grow { transform-box: fill-box; transform-origin: left; animation: grow 1.1s ease-out 0.35s both; }
    @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) { .rise, .grow { animation: none; } }
  </style>
  <g clip-path="url(#card)">
    <rect width="${WIDTH}" height="220" fill="#0d1117"/>
    <rect width="${WIDTH}" height="3" fill="url(#accent)"/>
    <text x="${PAD}" y="38" class="title">${escapeXml(USER)} · on GitHub</text>
    <text x="${WIDTH - PAD}" y="38" class="muted" text-anchor="end">Updated ${escapeXml(updated)}</text>
    ${tileSvg}
    <text x="${PAD}" y="150" class="label">Most used languages (public repositories)</text>
    <rect x="${PAD}" y="160" width="${barWidth}" height="10" rx="5" fill="#21262d"/>
    <g clip-path="url(#bar)"><g class="grow">${segments}</g></g>
    ${legend}
  </g>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="219" rx="15.5" fill="none" stroke="#30363d"/>
</svg>
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'stats.svg'), svg);
console.log(`stats.svg: ${repos.length} repos, ${stars} stars, ${commits} commits, ${languages.map(l => l.name).join(', ')}`);
