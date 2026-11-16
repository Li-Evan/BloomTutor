// Contract tests for the bloomtutor-dsh package. No network, no DSH install:
//   node --test integrations/deepseek-harness/test/*.test.mjs
// scripts/acceptance.mjs covers the real host.
//
// The package is the repository root (package.json there), so installing from
// GitHub source and installing the npm tarball ship the same files.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { integrationRoot, listSkillNames, manifestPath, pack, repoRoot, skillsRoot } from '../scripts/pack.mjs';

const HERE = 'integrations/deepseek-harness';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const patch = fs.readFileSync(path.join(integrationRoot, 'cordis.patch.yml'), 'utf8');

// DSH's skill catalog truncates descriptions past this many UTF-16 units (catalogDescriptionMaxLength).
const CATALOG_DESCRIPTION_MAX = 500;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md starts with a frontmatter block');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-z-]+):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return fields;
}

test('root manifest declares a DSH bundle and nothing that runs on install', () => {
  assert.equal(manifest.name, 'bloomtutor-dsh');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.private, undefined, 'a private package cannot be published or listed');
  // A root "type" would turn every .js file in the repo without a nearer package.json into ESM.
  assert.equal(manifest.type, undefined);
  assert.deepEqual(manifest.dsh, { bundle: { patch: `./${HERE}/cordis.patch.yml` } });
  assert.ok(manifest.keywords.includes('dsh-plugin'));
  // Published under the GitHub handle, not a legal name.
  assert.equal(manifest.author?.name, 'Evan');
  // The patch resolves <name>/package.json; locale lookup needs the locale export.
  assert.equal(manifest.exports['./package.json'], './package.json');
  assert.equal(manifest.exports['./locale/*.json'], `./${HERE}/locale/*.json`);
  for (const field of ['scripts', 'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bin', 'main', 'workspaces']) {
    assert.equal(manifest[field], undefined, `${field} must stay empty`);
  }
  for (const entry of manifest.files) {
    const literal = entry.replace(/\/\*\.json$/, '');
    assert.ok(fs.existsSync(path.join(repoRoot, literal)), `files entry ${entry} exists`);
  }
});

test('patch mounts one filesystem provider over the packaged skills', () => {
  const rows = patch.match(/^\s+- id:/gm) || [];
  assert.equal(rows.length, 1, 'exactly one inserted row');
  assert.match(patch, /^- insert:$/m);
  assert.match(patch, /^\s+- id: bloomtutor-skill-filesystem$/m);
  assert.match(patch, /^\s+name: '@deepseek-ai\/dsh-skill-filesystem'$/m);
  assert.match(patch, /^\s+providerName: bloomtutor-plugin$/m);
  assert.match(patch, /^\s+includeDefaultRoots: true$/m);
  const expression = patch.match(/^\s+bundledSkillDir: !!js (.+)$/m)?.[1];
  assert.ok(expression, 'bundledSkillDir is a host-evaluated expression');
  assert.ok(expression.includes(`resolve('${manifest.name}/package.json')`), 'resolves this package from the profile baseUrl');
  // <package root>/skills is the repository's top-level skills/.
  assert.ok(expression.endsWith(", 'skills')"));
  // The expression runs in the host process: only the path and module built-ins are allowed.
  const builtins = [...expression.matchAll(/getBuiltinModule\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(builtins)].sort(), ['node:module', 'node:path']);
  assert.doesNotMatch(expression, /require\(|import\(|fetch|child_process|process\.env|readFile|writeFile|spawn|exec/);
});

test('every skill loads under DSH naming and catalog rules', () => {
  const names = listSkillNames();
  assert.ok(names.includes('bloom-tutor'));
  assert.ok(names.length >= 7);
  for (const name of names) {
    assert.match(name, KEBAB, `${name} is kebab-case`);
    const fields = frontmatter(fs.readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8'));
    assert.equal(fields.name, name, `${name}: frontmatter name matches its directory`);
    assert.ok(fields.description, `${name}: has a description`);
    assert.ok(fields.description.length <= CATALOG_DESCRIPTION_MAX, `${name}: description is ${fields.description.length} long`);
  }
});

test('locale metadata and detail documents are complete', () => {
  for (const [language, detail] of [['en', `${HERE}/docs/DETAIL.md`], ['zh', `${HERE}/docs/DETAIL.zh.md`]]) {
    const { meta } = JSON.parse(fs.readFileSync(path.join(integrationRoot, 'locale', `${language}.json`), 'utf8'));
    assert.equal(meta.title, 'BloomTutor');
    assert.ok(meta.description?.trim(), `${language}: description`);
    assert.match(meta.description, /[.。]$/, `${language}: description ends with punctuation`);
    // meta.detail is relative to the package root, which is the repository root.
    assert.equal(meta.detail, detail);
    assert.ok(fs.existsSync(path.join(repoRoot, detail)), `${detail} exists`);
  }
});

test('icons: a small self-contained SVG for DSH, a PNG for market tiles', () => {
  assert.equal(manifest.icon, `./${HERE}/icon.svg`);
  const svg = fs.readFileSync(path.join(integrationRoot, 'icon.svg'), 'utf8');
  assert.ok(Buffer.byteLength(svg) < 256 * 1024);
  assert.doesNotMatch(svg, /<script|<text|<foreignObject|<image|href=|url\(/);
  const png = fs.readFileSync(path.join(integrationRoot, 'icon-180.png'));
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47], 'icon-180.png is a PNG');
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
});

test('the tarball holds the plugin files and exactly the repository skills', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bloomtutor-dsh-test-')), 'package.tgz');
  const packed = pack({ out });
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  const skillFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else skillFiles.push(path.relative(repoRoot, full).split(path.sep).join('/'));
    }
  };
  for (const name of listSkillNames()) walk(path.join(skillsRoot, name));
  const expected = [
    // npm always adds LICENSE and every README* at the package root.
    'LICENSE',
    'README.md',
    'README.zh.md',
    'package.json',
    `${HERE}/cordis.patch.yml`,
    `${HERE}/docs/DETAIL.md`,
    `${HERE}/docs/DETAIL.zh.md`,
    `${HERE}/icon.svg`,
    `${HERE}/locale/en.json`,
    `${HERE}/locale/zh.json`,
    ...skillFiles,
  ].sort();
  assert.deepEqual(packed.files, expected);
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
});
