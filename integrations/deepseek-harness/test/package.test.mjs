// Contract tests for the bloomtutor-dsh package. No network, no DSH install:
//   node --test integrations/deepseek-harness/test/*.test.mjs
// scripts/acceptance.mjs covers the real host.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { integrationRoot, listSkillNames, pack, skillsRoot } from '../scripts/pack.mjs';

const read = (file) => fs.readFileSync(path.join(integrationRoot, file), 'utf8');
const manifest = JSON.parse(read('package.json'));
const patch = read('cordis.patch.yml');

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

test('manifest declares a DSH bundle and nothing that runs on install', () => {
  assert.equal(manifest.name, 'bloomtutor-dsh');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.private, undefined, 'a private package cannot be published');
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } });
  assert.ok(manifest.keywords.includes('dsh-plugin'));
  // The patch resolves <name>/package.json; locale lookup needs the locale export.
  assert.equal(manifest.exports['./package.json'], './package.json');
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json');
  for (const field of ['scripts', 'dependencies', 'peerDependencies', 'optionalDependencies', 'bin', 'main']) {
    assert.equal(manifest[field], undefined, `${field} must stay empty`);
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
  for (const [language, detail] of [['en', 'docs/DETAIL.md'], ['zh', 'docs/DETAIL.zh.md']]) {
    const { meta } = JSON.parse(read(`locale/${language}.json`));
    assert.equal(meta.title, 'BloomTutor');
    assert.ok(meta.description?.trim(), `${language}: description`);
    assert.match(meta.description, /[.。]$/, `${language}: description ends with punctuation`);
    assert.equal(meta.detail, detail);
    assert.ok(fs.existsSync(path.join(integrationRoot, detail)), `${detail} exists`);
  }
});

test('icon is a small self-contained SVG', () => {
  const icon = read('icon.svg');
  assert.equal(manifest.icon, './icon.svg');
  assert.ok(Buffer.byteLength(icon) < 256 * 1024);
  assert.doesNotMatch(icon, /<script|<text|<foreignObject|<image|href=|url\(/);
});

test('the tarball holds the adapter files and exactly the repository skills', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bloomtutor-dsh-test-')), 'package.tgz');
  const packed = pack({ out });
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  const skillFiles = [];
  for (const name of listSkillNames()) {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else skillFiles.push(path.relative(path.join(skillsRoot, '..'), full).split(path.sep).join('/'));
      }
    };
    walk(path.join(skillsRoot, name));
  }
  const expected = [
    'LICENSE',
    'README.md',
    'cordis.patch.yml',
    'docs/DETAIL.md',
    'docs/DETAIL.zh.md',
    'icon.svg',
    'locale/en.json',
    'locale/zh.json',
    'package.json',
    ...skillFiles,
  ].sort();
  assert.deepEqual(packed.files, expected);
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
});
