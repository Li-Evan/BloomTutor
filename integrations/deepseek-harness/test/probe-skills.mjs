// Test-only Cordis plugin for scripts/acceptance.mjs. It is never packaged.
//
// The acceptance script boots a real DSH profile with this module mounted as an
// extra patch row. It reads the host's Skill registry, loads every expected
// Skill in full, writes what it saw to BLOOMTUTOR_DSH_PROBE_OUT and exits.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const name = 'bloomtutor-dsh-skill-probe';
export const inject = ['skills'];

export async function probeSkills(skills, cwd, expectedNames, { timeoutMs = 30_000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let list = [];
  // Providers finish their first scan asynchronously; poll until every expected name shows up.
  for (;;) {
    list = await skills.list({ cwd });
    if (expectedNames.every((skillName) => list.some((skill) => skill.name === skillName))) break;
    if (Date.now() >= deadline) break;
    await delay(pollMs);
  }
  const definitions = {};
  for (const skillName of expectedNames) {
    const definition = await skills.get(skillName, { cwd });
    if (!definition) continue;
    definitions[skillName] = {
      name: definition.name,
      provider: definition.provider,
      path: definition.path,
      resourceBase: definition.resourceBase,
      contentLength: definition.content?.length || 0,
      contentSha256: createHash('sha256').update(definition.content || '').digest('hex'),
    };
  }
  return {
    skills: list.map((skill) => ({ name: skill.name, provider: skill.provider, path: skill.path })),
    definitions,
  };
}

export async function apply(ctx) {
  const out = process.env.BLOOMTUTOR_DSH_PROBE_OUT;
  if (!out) throw new Error('BLOOMTUTOR_DSH_PROBE_OUT is required');
  const expectedNames = JSON.parse(process.env.BLOOMTUTOR_DSH_PROBE_SKILLS || '[]');
  const cwd = process.env.BLOOMTUTOR_DSH_PROBE_CWD || process.cwd();
  const result = await probeSkills(ctx.skills, cwd, expectedNames);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
}
