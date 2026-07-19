const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const failures = [];
const excluded = new Set(['.git', 'node_modules', 'dist', '.runtime', 'logs', 'uploads', 'backups']);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (excluded.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
const files = walk(root);
const rel = (file) => path.relative(root, file).split(path.sep).join('/');
const duplicatePattern = / \\(\\d+\\)(?:\\.[^.]+)?$/;
const duplicates = files.filter((file) => duplicatePattern.test(path.basename(file)));
if (duplicates.length) failures.push('Numbered duplicate files: ' + duplicates.map(rel).join(', '));
for (const file of files.filter((file) => rel(file).startsWith('frontend/src/') && /\.(js|jsx)$/i.test(file))) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('+92 300 0000000')) failures.push('Placeholder phone remains in ' + rel(file));
}
const versions = ['package.json', 'backend/package.json', 'frontend/package.json'].map(
  (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).version,
);
const versionFile = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8').trim();
if (new Set(versions.concat(versionFile)).size !== 1) failures.push('Release versions are inconsistent');
const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
if (!ignore.includes('**/.env') || !ignore.includes('**/.env.*'))
  failures.push('Environment ignore rules are incomplete');
for (const required of [
  'docs/PRODUCTION-READINESS.md',
  '.github/workflows/ci.yml',
  '.github/workflows/security.yml',
  '.github/workflows/release.yml',
  'monitoring/alert-rules.yml',
]) {
  if (!fs.existsSync(path.join(root, required))) failures.push('Missing release control: ' + required);
}
const assets = path.join(root, 'frontend', 'dist', 'assets');
if (fs.existsSync(assets)) {
  const oversized = fs
    .readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, size: fs.statSync(path.join(assets, name)).size }))
    .filter((item) => item.size > 500 * 1024);
  if (oversized.length)
    failures.push('JavaScript chunks exceed 500 KB: ' + oversized.map((item) => item.name).join(', '));
}
if (failures.length) {
  console.error('Release audit: FAILED');
  failures.forEach((item) => console.error('- ' + item));
  process.exit(1);
}
console.log(
  'Release audit passed: no numbered duplicates, placeholder phone, version drift, packaging-rule gaps, or oversized JS chunks.',
);
