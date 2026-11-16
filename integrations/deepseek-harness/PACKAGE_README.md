# bloomtutor-dsh

[BloomTutor](https://github.com/Li-Evan/BloomTutor) for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a one-on-one AI tutor that writes a syllabus, teaches one adaptive lesson at a time, and shapes the next lesson from your notes and feedback.

This is a community plugin. It is not made or endorsed by DeepSeek.

[中文说明](#中文)

## Install

```bash
dsh plugin --profile web add bloomtutor-dsh@0.1.0
```

Use `npx @deepseek-ai/dsh plugin …` if `dsh` is not on your PATH. Run the command once for each profile you use. Running it again with a newer version upgrades the plugin.

Tested with DeepSeek Harness `0.2.2-rc.1` on Node 24. DeepSeek Harness is a developer preview; other versions may work but have not been tested.

## Use

Say in a chat:

```text
Create a new folder and help me learn Rust ownership
```

Or name a skill:

```text
Use the learn-feynman skill to check whether I really understand TCP congestion control
```

| Skill | What it does |
|-------|-------------|
| `bloom-tutor` | The full tutoring loop: syllabus → one lesson at a time → your `???` marks and feedback → next lesson → review → summary |
| `learn-deep` | Explains a new concept through all five lenses below in one pass |
| `learn-crossover` | Learn something new through what you already know |
| `learn-occam` | Decide whether something is worth learning, and how deep |
| `learn-graph` | Map a field and plan a learning path |
| `learn-prototype` | Learn by building the roughest working version, then improving it |
| `learn-feynman` | Check your understanding by explaining it back |

The tutor keeps everything as Markdown in your workspace: a folder per topic with `syllabus.md`, `01.md`, `02.md` … and a `learning-log.jsonl` at the workspace root.

## Which copy loads

Skills you installed yourself win over this package when they have the same name. DeepSeek Harness looks in `<project>/.dsh/skills`, `<project>/.agents/skills`, `~/.dsh/skills` and `~/.agents/skills` before it looks here. If you copied `bloom-tutor` into one of those folders earlier, that copy is the one that loads.

## Uninstall

```bash
dsh plugin --profile web remove bloomtutor-dsh
```

## What it changes in DeepSeek Harness

- `cordis.patch.yml` adds one `@deepseek-ai/dsh-skill-filesystem` provider, named `bloomtutor-plugin`, over the package's `skills/` folder. It keeps your own project and personal skill folders in view.
- Its `bundledSkillDir` value is a `!!js` expression that DeepSeek Harness runs in the host process. It only uses Node's built-in `path` and `module` helpers to find this installed package.
- The package has no tools, dependencies, install scripts, network requests or telemetry.
- The skills read and write Markdown files in your workspace.

## 中文

在 DeepSeek Harness 里用 BloomTutor：一位一对一的 AI 导师，先出学习大纲，每次只讲一篇，下一篇按你的批注和反馈来调整。这是社区插件，不是 DeepSeek 官方出品。

安装：

```bash
dsh plugin --profile web add bloomtutor-dsh@0.1.0
```

`dsh` 不在 PATH 里时，用 `npx @deepseek-ai/dsh plugin …`。每个要用的 profile 各装一次；换成新版本号再运行一次就是升级。已在 DeepSeek Harness `0.2.2-rc.1`、Node 24 上测过。

装好后在对话里说「开个文件夹，帮我学 Rust 的所有权」，或者点名某个 Skill，比如「用 learn-feynman 检验一下我是不是真懂了 TCP 拥塞控制」。读课时在没看懂的地方标 `???`，读完在文末写反馈，然后说「我读完了」。

你自己装过的同名 Skill（`<项目>/.dsh/skills`、`<项目>/.agents/skills`、`~/.dsh/skills`、`~/.agents/skills`）优先于插件里的版本。

卸载：`dsh plugin --profile web remove bloomtutor-dsh`。

## License

MIT
