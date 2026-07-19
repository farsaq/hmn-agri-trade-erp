const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = (file) => JSON.parse(read(file));
const failures = [];
const expectedVersion = '5.7.8';
for (const file of ['package.json', 'backend/package.json', 'frontend/package.json']) {
  const version = pkg(file).version;
  if (version !== expectedVersion) failures.push(file + ': expected ' + expectedVersion + ', found ' + version);
}
if (read('VERSION.txt').trim() !== expectedVersion) failures.push('VERSION.txt does not match package versions');
const env = Object.fromEntries(
  read('.env.production')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
for (const name of ['PUBLIC_APP_URL', 'CLIENT_URL', 'REDIS_PASSWORD', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
  const value = env[name] || '';
  if (!value || /CHANGE_ME|example\.com|0000000/i.test(value))
    failures.push(name + ': production value is missing or still a placeholder');
}
if ((env.JWT_SECRET || '').length < 48) failures.push('JWT_SECRET: use at least 48 random characters');
const ignore = read('.gitignore');
if (!/^\*\*\/\.env$/m.test(ignore)) failures.push('.gitignore must exclude nested .env files');
const evidencePath = path.join(root, '.production-evidence.json');
if (!fs.existsSync(evidencePath))
  failures.push('Deployment evidence missing: copy .production-evidence.example.json only after real rehearsals');
else {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  for (const name of ['backupRestore', 'migrations', 'monitoringAlerts', 'securitySmoke', 'rollbackRehearsal']) {
    if (evidence[name] !== true) failures.push('Deployment evidence incomplete: ' + name);
  }
  if (evidence.release !== expectedVersion) failures.push('Deployment evidence release version does not match');
  if (!evidence.completedAt || Number.isNaN(Date.parse(evidence.completedAt)))
    failures.push('Deployment evidence needs a valid completedAt timestamp');
  if (!evidence.approvedBy) failures.push('Deployment evidence needs approvedBy');
}
if (failures.length) {
  console.error('Production readiness: BLOCKED');
  failures.forEach((item) => console.error('- ' + item));
  console.error('No secret values were printed. Set real deployment values and run this check again.');
  process.exit(1);
}
console.log('Production configuration and version checks passed.');
