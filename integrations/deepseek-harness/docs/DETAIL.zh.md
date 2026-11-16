# BloomTutor

一位一对一的 AI 导师，想学什么都可以。它来自 Benjamin Bloom 1984 年的研究：有私人导师的学生，成绩比课堂学生高出两个标准差。

## 装上之后有什么

| Skill | 什么时候用 |
|-------|-----------|
| **bloom-tutor** | 想一步步学一个课题。它先出学习大纲，每次只讲一篇，下一篇按你标的 `???` 和反馈来调整。 |
| **learn-deep** | 碰到一个新概念，想用下面五个角度一次讲透。 |
| **learn-crossover** | 新东西学着吃力，想借你已经会的知识来理解它。 |
| **learn-occam** | 拿不准值不值得学、要学到多深。 |
| **learn-graph** | 想看清一个领域的全貌，排一条学习路线。 |
| **learn-prototype** | 喜欢先做个粗糙的版本，再一点点改好。 |
| **learn-feynman** | 觉得自己懂了，想用自己的话讲一遍来检验。 |

## 开始

在对话里说：

```text
开个文件夹，帮我学 Rust 的所有权
```

导师会写出 `syllabus.md` 和第一篇 `01.md`。读的时候在没看懂的地方标 `???`，读完在文末的反馈区写下想法，然后说「我读完了」。下一篇会从你标的地方讲起。

也可以直接点名某个 Skill：

```text
用 learn-feynman 检验一下我是不是真懂了 TCP 拥塞控制
```

## 你的文件

所有内容都是工作区里的 Markdown 文件：

```
Rust的所有权/
├── syllabus.md     # 可以逐条打勾的学习目标
├── 01.md, 02.md …  # 一次一篇
└── summary.md      # 读完最后的复盘篇后生成
learning-log.jsonl  # 在工作区根目录，记录所有课题
```

## 想在浏览器里学？

同一位导师也有网页版，能学你自己的资料、PDF 和网页文章：直接用 [bloomtutor.app](https://bloomtutor.app)，或者从 [Li-Evan/BloomTutor](https://github.com/Li-Evan/BloomTutor) 自己部署。
