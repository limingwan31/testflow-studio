# 贡献指南 / Contributing

感谢你愿意改进 TestFlow Studio。这是一个刻意保持「小而可读」的参考实现，
**最受欢迎的贡献是让架构更清楚、安全边界更牢，而不是堆功能**。

参与本仓库即表示同意遵守 [行为准则](CODE_OF_CONDUCT.md)。

## 开始之前 / Before you start

- 需要 Node.js ≥ 18，**不需要 `npm install`**（项目零运行时依赖）。
- 先读 [README.md](README.md) 的「四条安全护栏」与 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
- 涉及安全边界的改动，请先开 Issue 讨论，不要直接提 PR。
- 涉及漏洞报告，请走 [SECURITY.md](SECURITY.md) 的私下渠道。

## 本地开发 / Local setup

```bash
git clone https://github.com/lizhuanshu/testflow-studio.git
cd testflow-studio

node scripts/serve.js          # http://localhost:8080
node scripts/verify.js         # 语法 / 资源引用 / DOM id / 必需文档
node tests/smoke.js            # 闭环 + 双语 + 双主题冒烟测试
npm run verify                 # 一次跑完静态校验与冒烟测试
```

也可以直接双击 `index.html`——传统 `<script>` 顺序加载，`file://` 下可正常运行。

## 模块职责 / Where to change what

| 想改的东西 | 改哪里 | 同时要检查 |
| --- | --- | --- |
| 设备清单、能力定义、命令模板 | `src/drivers.js` | `Planner.校验()`、双语词典 |
| 意图解析、工作流生成、校验规则 | `src/planner.js` | `docs/USER_GUIDE.md` 的意图写法 |
| 执行流程、事件、限值判定 | `src/engine.js` | `tests/smoke.js` 的闭环断言 |
| 报告内容、波形绘制 | `src/report.js` | 中英导出、深浅主题配色 |
| 界面与交互 | `index.html`、`assets/styles.css`、`src/app.js` | 双语、双主题、CRLF |
| 翻译词条 | `src/i18n.js` | 长篇说明请直接写中英两套 HTML |
| CI / 静态校验 | `.github/workflows/ci.yml`、`scripts/verify.js` | Node 18/20/22 均能跑 |

## 编码约定 / Conventions

1. **行尾统一 CRLF**（Windows 约定）。仓库内由 `.gitattributes` 规范化为 LF，检出时自动还原
   为 CRLF；提交时不要混用行尾。
2. **零运行时依赖**。浏览器端不引入框架、CDN 或打包器；`scripts/` 与 `tests/` 只用 Node 内置模块。
3. **工作流 JSON 字段名保持中文**，它是引擎、校验与历史快照共用的稳定契约。切换界面语言
   只翻译展示层，不改字段名；如确需变更，必须同时给出迁移方式并更新文档与测试。
4. **所有面向用户的文本都要有中英两版**：短文本走 `I18n.tr()` 的短语表或 `L(zh, en)`，
   长篇说明（护栏 / 架构页）直接写两套 HTML。日志事件保存中文原文，切换语言时重放翻译。
5. **新增颜色优先用 CSS 变量**；深色硬编码需要在 `[data-theme="light"]` 块里补覆盖。
   波形 SVG 的颜色必须通过 `I18n.主题()` 取色，不要写死深色值。
6. **新增源文件请带 Apache-2.0 版权头**，格式照抄现有 `src/*.js` 顶部。
7. 源码注释与变量可使用中文（本项目既有风格），但公开的 API / 事件名保持稳定。
8. **不要削弱安全护栏**：命令仍来自能力定义、限值仍来自用户输入、测量值仍来自执行结果、
   `finally` 仍会关闭输出与负载。

## 常见任务 / Common tasks

### 添加一台设备或一个能力

1. 在 `src/drivers.js` 的 `能力库` 增加能力定义（名称、命令模板、参数列表）。
   **命令模板是唯一的命令来源**，不要在 `planner.js` 或 `app.js` 里手写协议字符串。
2. 在 `设备列表` 登记设备，并把能力名加入它的 `能力` 数组。
3. 在 `执行()` 里为该能力补模拟读数；接真机时替换为适配器调用。
4. 在 `src/i18n.js` 补设备名、说明与能力名的英文词条。
5. 跑 `npm run verify`，并在 `tests/smoke.js` 增加一条断言。

### 把规划器换成真实 LLM / MCP

保持 `生成(描述, 上一个工作流)` 的签名与返回结构不变，让模型通过 MCP 只返回
**结构化步骤 JSON**（能力名 + 参数 + 限值），并在交给引擎前强制调用 `Planner.校验()`。
模型不得返回命令字符串、测量值或自行放宽的限值。详见
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

### 连接真实仪器

实现驱动适配器契约，把 `SimulatedAdapter` 换掉即可，Planner 的 JSON 契约与 Engine 的
事件协议都不用改。详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。**接真机前请先读 [SECURITY.md](SECURITY.md)**。

## 提交与 PR / Commits and pull requests

- 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/)：
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `ci:`, `i18n:`, `chore:`，可带范围如
  `feat(drivers): add Modbus adapter`。
- 一个 PR 聚焦一件事；纯格式化改动请与功能改动分开。
- 用户可见变更请更新 `CHANGELOG.md` 的 `[Unreleased]`，涉及用法变化请同步中英 README 与 `docs/`。
- PR 描述请写清验证方式，并完整勾选
  [PR 模板](.github/PULL_REQUEST_TEMPLATE.md) 的检查清单。
- CI 会在 Node 18 / 20 / 22 上跑静态校验与冒烟测试，必须全部通过。

## 提 Issue / Issues

- 缺陷请用「缺陷报告」模板，功能建议用「功能建议」模板。
- 使用咨询请发 [Discussions](https://github.com/lizhuanshu/testflow-studio/discussions)。
- **不要粘贴**真实仪器地址、序列号、客户数据或内部网络信息，模板里已内置确认项。

## 发布流程 / Releases（维护者）

1. 确认 `npm run verify` 与 CI 全绿。
2. 把 `CHANGELOG.md` 的 `[Unreleased]` 归到新版本，补 Release 链接。
3. 打 tag `vX.Y.Z` 并推送，在 GitHub 上创建 Release。
4. 若该版本改动了安全边界，同步更新 `SECURITY.md`。

再次感谢你的贡献。
