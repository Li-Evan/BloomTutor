#!/usr/bin/env node
// Build the bloomtutor-dsh npm tarball.
//
// The package is the repository root: its package.json declares the DSH
// bundle, and its `files` list ships the top-level skills/ plus this folder's
// patch, locale, docs and icon. So `npm pack` at the root is the whole build,
// and installing straight from GitHub (`github:Li-Evan/BloomTutor`) gets the
// same files.
//
//   node integrations/deepseek-harness/scripts/pack.mjs            # writes bloomtutor-dsh-<version>.tgz in this folder
//   node integrations/deepseek-harness/scripts/pack.mjs --out /abs/path.tgz --json

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const integrationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(integrationRoot, '..', '..');
export const skillsRoot = path.join(repoRoot, 'skills');
export const manifestPath = path.join(repoRoot, 'package.json');

// Every directory under skills/ that holds a SKILL.md is a skill the package ships.
export function listSkillNames() {
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
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
    const result = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', work], {
      cwd: repoRoot,
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
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(packed, null, 2)}\n`);
  else process.stdout.write(`${packed.destination}\n`);
}
