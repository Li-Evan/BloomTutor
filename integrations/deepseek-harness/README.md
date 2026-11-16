# DeepSeek Harness plugin

This folder builds `bloomtutor-dsh`, the npm package that brings BloomTutor's skills to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Users install it with `dsh plugin --profile web add bloomtutor-dsh`; what they see is in [PACKAGE_README.md](PACKAGE_README.md), which becomes the package's README.

## How it works

The package is skills only. `package.json` declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, and the patch inserts one `@deepseek-ai/dsh-skill-filesystem` provider named `bloomtutor-plugin` whose `bundledSkillDir` is the package's `skills/` folder. DSH then lists those skills in its catalog and loads one when the model calls `skill({ name })`.

The skills are not stored here. `scripts/pack.mjs` copies every folder with a `SKILL.md` from the repository's top-level [`skills/`](../../skills/) into the package at pack time, so editing a skill there changes the next release.

| File | Role |
|------|------|
| `package.json` | Package identity, the bundle declaration, display icon |
| `cordis.patch.yml` | The one provider row DSH adds to a profile |
| `locale/*.json`, `docs/DETAIL*.md`, `icon.svg` | Title, description and detail page in DSH's plugin manager |
| `PACKAGE_README.md` | Published as the package README |
| `scripts/pack.mjs` | Stages the files and skills, runs `npm pack` |
| `scripts/acceptance.mjs` | Installs a real DSH and checks install, load, precedence and uninstall |
| `test/` | Package contract tests and the probe plugin the acceptance script mounts |

## Check it

Contract tests (no network, run in CI):

```bash
node --test integrations/deepseek-harness/test/*.test.mjs
```

Real host (downloads DSH from npm, never calls a model, needs a Node version DSH accepts — 0.2.2 needs 24.9 or newer — and pnpm 10):

```bash
node integrations/deepseek-harness/scripts/acceptance.mjs
```

It works in a temporary directory with its own `DSH_HOME` and `DSH_AGENTS_HOME`, and prints a JSON receipt. If registry.npmjs.org is slow from your network, set `npm_config_registry=https://registry.npmmirror.com/`.

## Try it before it is on npm

```bash
node integrations/deepseek-harness/scripts/pack.mjs
dsh plugin --profile web add "$PWD/integrations/deepseek-harness/bloomtutor-dsh-0.1.0.tgz"
```

`dsh plugin add` needs an absolute path to the tarball.

## Release

1. Bump `version` in `package.json` and the version in `PACKAGE_README.md`'s install commands.
2. Run the contract tests and the acceptance script. Update the tested DSH version in `PACKAGE_README.md` and `TESTED_DSH_VERSION` in `scripts/acceptance.mjs` if you tested a newer host.
3. `node integrations/deepseek-harness/scripts/pack.mjs`, then `npm publish integrations/deepseek-harness/bloomtutor-dsh-<version>.tgz`.
4. Tag the commit `bloomtutor-dsh-v<version>`.

A published version never changes; ship fixes as a new version.
