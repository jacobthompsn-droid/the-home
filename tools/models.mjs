#!/usr/bin/env node
// The Home — model tooling.
//
//   node tools/models.mjs validate            # check every model (schema, bounds, gravity / floating parts)
//   node tools/models.mjs validate models/decor/my-lamp.json
//   node tools/models.mjs manifest            # rebuild models/index.json (the Playbox list)
//   node tools/models.mjs check               # validate + fail if index.json is out of date (used by CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModel, manifestEntry, SPEC_VERSION } from '../js/model-spec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'models');
const INDEX = path.join(MODELS, 'index.json');

function listModelFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['refs', 'assets'].includes(e.name)) walk(p); }
      else if (e.name.endsWith('.json') && p !== INDEX) out.push(p);
    }
  };
  walk(MODELS);
  return out.sort();
}

function load(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  try { return { file, rel, model: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (e) { return { file, rel, parseError: e.message }; }
}

function validate(files) {
  let bad = 0, warnCount = 0;
  const ids = new Map();
  const results = files.map(load);
  for (const r of results) {
    if (r.parseError) { console.log(`✗ ${r.rel}\n    - invalid JSON: ${r.parseError}`); bad++; continue; }
    const { errors, warnings } = validateModel(r.model, { fileId: path.basename(r.file, '.json') });
    const folder = path.basename(path.dirname(r.file));
    if (r.model.category && folder !== r.model.category) errors.push(`file is in /models/${folder}/ but category is "${r.model.category}" — move it to /models/${r.model.category}/`);
    if (ids.has(r.model.id)) errors.push(`duplicate id "${r.model.id}" (also in ${ids.get(r.model.id)})`);
    ids.set(r.model.id, r.rel);
    if (errors.length) { bad++; console.log(`✗ ${r.rel}`); errors.forEach((e) => console.log(`    - ${e}`)); }
    else console.log(`✓ ${r.rel}`);
    warnings.forEach((w) => console.log(`    ! ${w}`)); warnCount += warnings.length;
  }
  console.log(`\n${results.length - bad}/${results.length} models valid${warnCount ? `, ${warnCount} warning(s)` : ''}.`);
  return { ok: bad === 0, results };
}

function buildManifest(results) {
  const entries = results.filter((r) => r.model && !r.parseError && !validateModel(r.model).errors.length)
    .map((r) => manifestEntry(r.model, r.rel))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return JSON.stringify({ spec: SPEC_VERSION, count: entries.length, models: entries }, null, 1) + '\n';
}

// designs/index.json lets the app list saved designs when it can't use the GitHub API (e.g. local dev)
function writeDesignsIndex() {
  const dir = path.join(ROOT, 'designs');
  fs.mkdirSync(dir, { recursive: true });
  const designs = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort().map((f) => `designs/${f}`);
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ designs }, null, 1) + '\n');
  console.log(`Wrote designs/index.json (${designs.length} designs)`);
}

const [cmd = 'validate', ...args] = process.argv.slice(2);
const files = args.length ? args.map((a) => path.resolve(a)) : listModelFiles();

if (cmd === 'validate') {
  process.exit(validate(files).ok ? 0 : 1);
} else if (cmd === 'manifest') {
  const { results } = validate(listModelFiles());
  fs.writeFileSync(INDEX, buildManifest(results));
  console.log(`Wrote ${path.relative(ROOT, INDEX)}`);
  writeDesignsIndex();
} else if (cmd === 'check') {
  const { ok, results } = validate(listModelFiles());
  const fresh = buildManifest(results);
  const current = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
  if (fresh !== current) { console.log('models/index.json is out of date — run: node tools/models.mjs manifest'); process.exit(1); }
  process.exit(ok ? 0 : 1);
} else {
  console.log('usage: node tools/models.mjs [validate [files...] | manifest | check]');
  process.exit(1);
}
