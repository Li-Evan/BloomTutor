#!/usr/bin/env node
// Real-host acceptance for bloomtutor-dsh. Run it before every release.
//
// It is not part of CI: it downloads DeepSeek Harness from npm and boots it in
// throwaway profiles. Everything lives in a temporary directory (DSH_HOME and
// DSH_AGENTS_HOME point there), so your own ~/.dsh and ~/.agents are untouched.
// It never calls a model.
//
// Needs: a Node version the DSH release accepts (0.2.2 needs >= 24.9), pnpm 10
// on PATH, and network access to the npm registry.
//
//   node integrations/deepseek-harness/scripts/acceptance.mjs
//   DSH_VERSION=0.2.2-rc.3 node integrations/deepseek-harness/scripts/acceptance.mjs
//   node integrations/deepseek-harness/scripts/acceptance.mjs --dsh-runtime /abs/dir   # reuse a dir where @deepseek-ai/dsh is installed
//   node integrations/deepseek-harness/scripts/acceptance.mjs --keep                    # keep the temporary directory
//   node integrations/deepseek-harness/scripts/acceptance.mjs --source github:Li-Evan/BloomTutor   # install from GitHub instead of the packed tarball
//
// Prints a JSON receipt on stdout; progress goes to stderr.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { integrationRoot, listSkillNames, manifestPath, pack } from './pack.mjs';

export const TESTED_DSH_VERSION = '0.2.2-rc.1';
const DSH_VERSION = process.env.DSH_VERSION || TESTED_DSH_VERSION;
const PROFILE = 'bloomtutor-dsh-acceptance';
const PROVIDER = 'bloomtutor-plugin';
const ROW_ID = 'bloomtutor-skill-filesystem';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const PACKAGE_NAME = manifest.name;
const SKILLS = listSkillNames();

const argValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};
const keep = process.argv.includes('--keep');
const reuseRuntime = argValue('--dsh-runtime');
// What `dsh plugin add` receives: the freshly packed tarball by default, or a
// spec such as github:Li-Evan/BloomTutor to check the install-from-source path
// that plugin markets offer.
const sourceSpec = argValue('--source');

const steps = [];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bloomtutor-dsh-acceptance-'));

function finish(code) {
  if (keep) process.stderr.write(`kept ${scratch}\n`);
  else fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(code);
}
function pass(step, detail = {}) {
  steps.push({ step, ...detail });
  process.stderr.write(`ok    ${step}\n`);
}
function fail(step, message, detail) {
  process.stderr.write(`FAIL  ${step}: ${message}\n`);
  if (detail) process.stderr.write(`${JSON.stringify(detail, null, 2)}\n`);
  finish(1);
}
const tail = (text = '', lines = 40) => text.split('\n').slice(-lines).join('\n');
function requireOk(step, result, label) {
  if (result.status !== 0) {
    fail(step, `${label} exited ${result.status ?? result.signal ?? result.error?.message}`, {
      stdout: tail(result.stdout),
      stderr: tail(result.stderr),
    });
  }
}

const dshHome = path.join(scratch, 'dsh-home');
const agentsHome = path.join(scratch, 'agents-home');
const workspace = path.join(scratch, 'workspace');
for (const dir of [dshHome, agentsHome, workspace]) fs.mkdirSync(dir);
// Anchor DSH's project-root lookup here even if the temp dir has a Git ancestor.
fs.mkdirSync(path.join(workspace, '.git'));
const env = {
  ...process.env,
  DSH_HOME: dshHome,
  DSH_AGENTS_HOME: agentsHome,
  DSH_TELEMETRY_DISABLED: '1',
  npm_config_update_notifier: 'false',
};

// 1. Build the tarball exactly as it would be published.
const tarball = path.join(scratch, `${PACKAGE_NAME}-${manifest.version}.tgz`);
const packed = pack({ out: tarball });
const missing = SKILLS.filter((skill) => !packed.files.includes(`skills/${skill}/SKILL.md`));
if (missing.length) fail('pack', 'tarball is missing skills', { missing });
pass('pack', { files: packed.files.length, skills: SKILLS });

// 2. Install the pinned DSH host on its own, so host install failures are not
//    mistaken for plugin failures. Only the host's known native builds may run.
let runtime = reuseRuntime && path.resolve(reuseRuntime);
if (!runtime) {
  runtime = path.join(scratch, 'dsh-runtime');
  fs.mkdirSync(runtime);
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"name":"dsh-runtime","private":true}\n');
  const install = spawnSync('pnpm', [
    'add', '--save-exact', '--reporter=append-only',
    '--allow-build=@deepseek-ai/dsh-subprocess-local',
    '--allow-build=@google/genai',
    '--allow-build=koffi',
    '--allow-build=node-pty',
    '--allow-build=protobufjs',
    `@deepseek-ai/dsh@${DSH_VERSION}`,
  ], { cwd: runtime, env, encoding: 'utf8', timeout: 600_000, shell: process.platform === 'win32' });
  requireOk('dsh-install', install, `pnpm add @deepseek-ai/dsh@${DSH_VERSION}`);
}
const dshRoot = path.join(runtime, 'node_modules', '@deepseek-ai', 'dsh');
const dshBin = path.join(dshRoot, 'lib', 'bin.js');
const dshManifest = JSON.parse(fs.readFileSync(path.join(dshRoot, 'package.json'), 'utf8'));
if (dshManifest.version !== DSH_VERSION || !fs.existsSync(dshBin)) {
  fail('dsh-install', 'installed DSH does not match the requested version', { installed: dshManifest.version, DSH_VERSION });
}
pass('dsh-install', { version: dshManifest.version, node: process.version });

const dsh = (args, timeout = 180_000) => spawnSync(process.execPath, [dshBin, ...args], {
  cwd: workspace, env, encoding: 'utf8', timeout,
});

// Boot the profile with the probe plugin mounted, wait for its report, stop the host.
const probeModule = pathToFileURL(path.join(integrationRoot, 'test', 'probe-skills.mjs')).href;
const probePatch = path.join(scratch, 'probe.patch.yml');
fs.writeFileSync(probePatch, `- insert:
    - id: bloomtutor-dsh-skill-probe
      name: ${JSON.stringify(probeModule)}
      inject: [skills]
`);
let probeCount = 0;
async function probe(step, expectedNames) {
  const out = path.join(scratch, `probe-${++probeCount}.json`);
  const child = spawn(process.execPath, [dshBin, '--profile', PROFILE, '--patch', probePatch], {
    cwd: workspace,
    env: {
      ...env,
      BLOOMTUTOR_DSH_PROBE_OUT: out,
      BLOOMTUTOR_DSH_PROBE_CWD: workspace,
      BLOOMTUTOR_DSH_PROBE_SKILLS: JSON.stringify(expectedNames),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const started = Date.now();
  let early;
  exited.then((status) => { early = status; });
  while (!fs.existsSync(out)) {
    if (early) fail(step, `DSH exited ${early.code ?? early.signal} before the probe reported`, { output: tail(output) });
    if (Date.now() - started > 120_000) {
      child.kill('SIGTERM');
      fail(step, 'probe timed out', { output: tail(output) });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

const resourceDir = (definition) => {
  const base = definition.resourceBase;
  if (typeof base === 'string') return base;
  if (base?.path) return base.path;
  return path.dirname(definition.path);
};

// 3. Install with the same command users run.
requireOk('plugin-add', dsh(['plugin', '--profile', PROFILE, 'add', sourceSpec || tarball]), 'dsh plugin add');
const profileDir = path.join(dshHome, 'profiles', PROFILE);
const profileManifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
if (!profileManifest.dependencies?.[PACKAGE_NAME]) {
  fail('plugin-add', 'profile does not depend on the package', { dependencies: profileManifest.dependencies });
}
pass('plugin-add', { profile: PROFILE, source: sourceSpec || 'packed tarball', dependency: profileManifest.dependencies[PACKAGE_NAME] });

// 4. The composed profile carries our provider row with the expected config.
const dump = dsh(['--profile', PROFILE, '--dump-config']);
requireOk('compose', dump, 'dsh --dump-config');
for (const needle of [`id: ${ROW_ID}`, `providerName: ${PROVIDER}`, 'includeDefaultRoots: true']) {
  if (!dump.stdout.includes(needle)) fail('compose', `composed config lacks "${needle}"`, { stdout: tail(dump.stdout, 120) });
}
pass('compose', { row: ROW_ID });

// 5. Every skill is discovered once, from our provider, and loads in full from the installed package.
const loaded = await probe('skill-load', SKILLS);
for (const skill of SKILLS) {
  const hits = loaded.skills.filter((entry) => entry.name === skill);
  const definition = loaded.definitions[skill];
  if (hits.length !== 1 || hits[0].provider !== PROVIDER) fail('skill-load', `${skill} not listed once from ${PROVIDER}`, { hits });
  if (!definition?.contentLength || definition.provider !== PROVIDER) fail('skill-load', `${skill} did not load`, { definition });
  if (!definition.path.includes(`${PACKAGE_NAME}${path.sep}skills${path.sep}${skill}${path.sep}`)) {
    fail('skill-load', `${skill} loaded from outside the installed package`, { path: definition.path });
  }
}
const tutorResources = resourceDir(loaded.definitions['bloom-tutor']);
const references = ['articles.md', 'logging.md', 'summary.md', 'syllabus.md'];
const missingRefs = references.filter((file) => !fs.existsSync(path.join(tutorResources, 'references', file)));
if (missingRefs.length) fail('skill-load', 'bloom-tutor references are not reachable', { tutorResources, missingRefs });
pass('skill-load', {
  skills: SKILLS.map((skill) => ({ name: skill, contentLength: loaded.definitions[skill].contentLength })),
  bloomTutorPath: loaded.definitions['bloom-tutor'].path,
});

// 6. A personal copy with the same name wins, and removing it brings the bundled one back.
const personal = path.join(agentsHome, 'skills', 'bloom-tutor');
fs.mkdirSync(personal, { recursive: true });
fs.writeFileSync(path.join(personal, 'SKILL.md'), '---\nname: bloom-tutor\ndescription: Personal copy used by the acceptance test.\n---\n\nPersonal copy.\n');
const shadowed = (await probe('personal-copy-wins', ['bloom-tutor'])).definitions['bloom-tutor'];
if (!shadowed?.path?.startsWith(fs.realpathSync(agentsHome)) && !shadowed?.path?.startsWith(agentsHome)) {
  fail('personal-copy-wins', 'the personal copy did not take precedence', { shadowed });
}
fs.rmSync(personal, { recursive: true, force: true });
const restored = (await probe('bundled-copy-restored', ['bloom-tutor'])).definitions['bloom-tutor'];
if (restored?.provider !== PROVIDER || restored.contentSha256 !== loaded.definitions['bloom-tutor'].contentSha256) {
  fail('bundled-copy-restored', 'the bundled copy did not come back', { restored });
}
pass('personal-copy-wins', { personalPath: shadowed.path });
pass('bundled-copy-restored');

// 7. Uninstall removes the row and leaves a profile that still boots.
requireOk('plugin-remove', dsh(['plugin', '--profile', PROFILE, 'remove', PACKAGE_NAME]), 'dsh plugin remove');
const after = dsh(['--profile', PROFILE, '--dump-config']);
requireOk('plugin-remove', after, 'dsh --dump-config after remove');
if (after.stdout.includes(ROW_ID) || after.stdout.includes(PROVIDER)) {
  fail('plugin-remove', 'our provider row is still composed after remove', { stdout: tail(after.stdout, 120) });
}
const empty = await probe('base-profile-boots', SKILLS);
if (empty.skills.some((entry) => entry.provider === PROVIDER || SKILLS.includes(entry.name))) {
  fail('base-profile-boots', 'skills are still visible after remove', { skills: empty.skills });
}
pass('plugin-remove');
pass('base-profile-boots');

process.stdout.write(`${JSON.stringify({ package: `${PACKAGE_NAME}@${manifest.version}`, dsh: DSH_VERSION, node: process.version, platform: `${process.platform}-${process.arch}`, steps }, null, 2)}\n`);
finish(0);
