#!/usr/bin/env node
// Build the bloomtutor-dsh npm tarball.
//
// The skills live once, in the repository's top-level skills/ directory. This
// script stages the adapter files plus a copy of those skills in a temporary
// directory and runs `npm pack` there, so the repository never holds a second
// copy that could drift.
//
//   node integrations/deepseek-harness/scripts/pack.mjs            # writes ./bloomtutor-dsh-<version>.tgz next to package.json
//   node integrations/deepseek-harness/scripts/pack.mjs --out /abs/path.tgz --json

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const integrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(integrationRoot, '..', '..');
export const skillsRoot = path.join(repoRoot, 'skills');

const manifest = JSON.parse(fs.readFileSync(path.join(integrationRoot, 'package.json'), 'utf8'));

// Every directory under skills/ that holds a SKILL.md ships in the package.
export function listSkillNames() {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

const skipHidden = (source) => !path.basename(source).startsWith('.');

function stage(destination) {
  for (const file of ['package.json', 'cordis.patch.yml', 'icon.svg']) {
    fs.copyFileSync(path.join(integrationRoot, file), path.join(destination, file));
  }
  fs.copyFileSync(path.join(integrationRoot, 'PACKAGE_README.md'), path.join(destination, 'README.md'));
  fs.copyFileSync(path.join(repoRoot, 'LICENSE'), path.join(destination, 'LICENSE'));
  fs.cpSync(path.join(integrationRoot, 'locale'), path.join(destination, 'locale'), { recursive: true, filter: skipHidden });
  fs.cpSync(path.join(integrationRoot, 'docs'), path.join(destination, 'docs'), { recursive: true, filter: skipHidden });
  for (const name of listSkillNames()) {
    fs.cpSync(path.join(skillsRoot, name), path.join(destination, 'skills', name), { recursive: true, filter: skipHidden });
  }
}

function parsePackJson(stdout) {
  const start = stdout.indexOf('[');
  if (start === -1) throw new Error(`npm pack printed no JSON:\n${stdout}`);
  const [entry] = JSON.parse(stdout.slice(start));
  if (!entry || !Array.isArray(entry.files)) throw new Error(`npm pack JSON has no file list:\n${stdout}`);
  return entry;
}

export function pack({ out } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bloomtutor-dsh-pack-'));
  try {
    const staged = path.join(work, 'package');
    fs.mkdirSync(staged);
    stage(staged);
    const result = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], {
      cwd: staged,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      throw new Error(`npm pack failed (${result.status}):\n${result.stderr || result.stdout || result.error?.message}`);
    }
    const entry = parsePackJson(result.stdout);
    const destination = path.resolve(out || path.join(integrationRoot, entry.filename));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(work, entry.filename), destination);
    return {
      name: entry.name,
      version: entry.version,
      destination,
      files: entry.files.map((file) => file.path).sort(),
    };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];
  const packed = pack({ out });
  if (packed.name !== manifest.name || packed.version !== manifest.version) {
    throw new Error(`packed ${packed.name}@${packed.version}, expected ${manifest.name}@${manifest.version}`);
  }
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(packed, null, 2)}\n`);
  else process.stdout.write(`${packed.destination}\n`);
}
