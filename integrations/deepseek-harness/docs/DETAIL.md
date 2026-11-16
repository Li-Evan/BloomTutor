# BloomTutor

A one-on-one AI tutor for anything you want to learn. It is built on Benjamin Bloom's 1984 finding that students with a personal tutor score two standard deviations above classroom learners.

## What you get

| Skill | Use it when |
|-------|-------------|
| **bloom-tutor** | You want to learn a topic step by step. It writes a syllabus, teaches one lesson at a time, and shapes the next lesson from your `???` marks and feedback. |
| **learn-deep** | You meet a new concept and want it explained through all five lenses below in one pass. |
| **learn-crossover** | Something new feels hard and you want to learn it through what you already know. |
| **learn-occam** | You are deciding whether something is worth learning, and how deep to go. |
| **learn-graph** | You want a map of a whole field and a learning path through it. |
| **learn-prototype** | You learn best by building a rough first version and improving it. |
| **learn-feynman** | You think you understand something and want to check by explaining it back. |

## Start

Say in a chat:

```text
Create a new folder and help me learn Rust ownership
```

The tutor writes `syllabus.md` and the first lesson, `01.md`. Read it, put `???` after anything unclear, write your thoughts in the feedback section at the end, then say `I'm done reading`. The next lesson starts from what you marked.

You can also name a skill directly:

```text
Use the learn-feynman skill to check whether I really understand TCP congestion control
```

## Your files

Everything is plain Markdown in your workspace:

```
Rust ownership/
├── syllabus.md     # goals you can check off
├── 01.md, 02.md …  # one lesson at a time
└── summary.md      # written after the final review lesson
learning-log.jsonl  # at the workspace root, across all topics
```

## Prefer a browser?

The same tutor also runs as a web app for your own materials, PDFs and web articles: use it at [bloomtutor.app](https://bloomtutor.app), or self-host it from [Li-Evan/BloomTutor](https://github.com/Li-Evan/BloomTutor).
