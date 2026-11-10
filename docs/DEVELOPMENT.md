# 开发指南 / Development guide

## 1. 环境

- Node.js ≥ 18（仅用于校验、测试与本地服务器；浏览器端不需要 Node）
- 一个现代浏览器
- **不需要 `npm install`**，项目零运行时依赖

```bash
node scripts/serve.js          # 本地服务器 http://localhost:8080
node scripts/verify.js         # 静态校验
node tests/smoke.js            # 端到端冒烟测试
npm run verify                 # 上面两项一起跑
```

调试时改完源码直接刷新页面即可，没有构建步骤。浏览器控制台可以直接访问
`window.FlowLab` 下的 `Drivers / Planner / Engine / Report / I18n` 做实验：

```js
FlowLab.Planner.解析('扫 3-12 V，步进 3 V，限值 120 mV')
FlowLab.Drivers.命令('psu-01', 'set_voltage', { 电压: 9 })
FlowLab.I18n.设置语言('en')
```

## 2. 添加一个设备或能力

以「给电源加一个读取电流的能力」为例。

**第 1 步：在 `src/drivers.js` 的 `能力库` 增加定义**，命令模板是唯一命令来源：

```js
measure_current: {
  名称: '测量输出电流',
  命令: 'MEAS:CURR:DC?',
  参数: []
}
```

**第 2 步：把能力挂到设备上**（`设备列表` 中 `psu-01` 的 `能力` 数组），
并在 `执行()` 的 `switch` 里补模拟读数：

```js
case 'measure_current':
  return { 电流: +(2.48 + (i % 3) * 0.01).toFixed(3) };
```

**第 3 步：补双语词条**（`src/i18n.js` 的 `短语` 表）：

```js
'测量输出电流': 'Measure output current',
```

**第 4 步：在工作流里使用它**（`src/planner.js` 的 `子步骤` 数组）：

```js
动作('9', '测量输出电流', 'psu-01', 'measure_current', {}, 'IOUT 实测值'),
```

**第 5 步：跑 `npm run verify`**，并在 `tests/smoke.js` 里补一条断言。

> 不要在任何地方手写 `MEAS:CURR:DC?` 这样的协议字符串。所有命令必须经
> `Drivers.命令()` 从能力模板展开，否则 `Planner.校验()` 的白名单就失去意义。

## 3. 添加一种步骤类型

涉及四处，按这个顺序改：

1. `src/planner.js` — 生成新节点（例如 `类型: '分支'`），定义它的字段；
2. `src/engine.js` — 在 `执行步骤()` 里增加对应分支，并决定它产生哪些事件；
3. `src/app.js` — `步骤节点()` 里给它一个样式与展示文本，`渲染画布()` 里处理嵌套；
4. `src/i18n.js` — 补中文短语，长说明写两套；`docs/ARCHITECTURE.md` 更新契约表。

如果新节点会改变工作流 JSON 结构，请在 PR 里明确写出迁移方式，并更新
`tests/smoke.js` 的契约断言。

## 4. 把规划器换成真实 LLM / MCP

保持签名和返回结构不变：

```js
// 现在的签名，替换内部实现即可
FlowLab.Planner.生成 = async function (描述, 上一个工作流) {
  // 1. 让模型通过 MCP 只返回结构化步骤 JSON（能力名 + 参数 + 限值）
  // 2. 组装成与规则版完全相同的工作流对象
  // 3. 必须调用 校验() 后再交给 Engine
  const 工作流 = /* ... */;
  const 错误 = 校验(工作流);
  if (错误.length) throw new Error(错误.join('; '));
  return 工作流;
};
```

不可让步的约束：

- 模型**不能返回命令字符串**，只能引用 `Drivers.能力库` 里已登记的能力名；
- 模型**不能设定或放宽限值**，限值必须由用户输入，`来源` 必须是 `用户输入`；
- 模型**不能返回测量值或结论**，数值只能在 `Engine.运行()` 里由驱动产生；
- 生成结果必须经 `Planner.校验()` 白名单检查，且在执行前让用户有机会审阅画布。

推荐让模型通过 OpenTAP MCP Server 组合 `TestStep`，而不是直接生成 SCPI。
详见 [ARCHITECTURE.md](ARCHITECTURE.md) 第 8、12 节。

## 5. 接入真实仪器的检查清单

实现 `IDriverAdapter` 契约后，按下面顺序验证：

```csharp
interface IDriverAdapter
{
    string Id { get; }
    Task<Result> ExecuteAsync(
        Capability capability,
        IReadOnlyDictionary<string, object> args,
        RunContext ctx,
        CancellationToken ct);
}
```

- [ ] 每条命令对照该型号的编程手册逐字核对（不同厂商、不同型号的命令常不通用）
- [ ] 会话开始 `*RST` + `*CLS`
- [ ] 先设限流 / 过压保护，**再** `OUTP ON`
- [ ] 每个配置块之后排空 `SYST:ERR?`，错误队列不为空即中止
- [ ] `finally` / `Dispose` 中 `OUTP OFF` 与 `LOAD OFF`，异常路径同样执行
- [ ] 命令超时、仪器忙、重试上限、断连恢复都有明确行为
- [ ] 空载或假负载跑完整流程，再接真实 DUT
- [ ] 硬件侧过压 / 过流保护与急停已就位，现场有人负责
- [ ] 日志不记录真实 IP、序列号与客户数据（见 [SECURITY.md](../SECURITY.md)）

适配完成后，`Planner` 的 JSON 契约与 `Engine` 的事件协议都不需要改。

## 6. 双语与主题开发规范

| 场景 | 做法 |
| --- | --- |
| 静态标签 | 在 `index.html` 元素上加空属性 `data-i18n`，中文原文写在标签里 |
| 短动态文本 | `I18n.tr(s)`，必要时在 `i18n.js` 的 `短语` 表补词条 |
| 整句动态文本 | `L('中文', 'English')` |
| 长篇说明页 | 在 `护栏HTML()` / `渲染架构()` 里直接维护两套 HTML |
| 日志与已存文本 | 保存中文原文，展示时 `tr()`；切换语言时重放 |
| 新增颜色 | 优先用 CSS 变量；深色硬编码要在 `[data-theme="light"]` 补覆盖 |
| 内联 SVG | 通过 `I18n.主题()` 取色，不要写死深色值 |

**不要在动态内容元素上加 `data-i18n`**：`I18n.应用静态()` 会用缓存的中文原文覆盖它，
导致运行结果、状态文本被冲掉。这类元素统一由 `渲染全部()` 重建。

切换语言或主题时，`I18n` 会调用 `注册重绘()` 注册的回调（本项目的 `渲染全部()`），
它会重建顶栏、示例、设备、驱动、历史、架构、工作流、日志、结果与进度。
新增动态区域时记得把它加进 `渲染全部()`。

## 7. 测试与 CI

| 命令 | 检查内容 |
| --- | --- |
| `node scripts/verify.js` | 所有 `src/*.js` 语法、`index.html` 资源引用、`app.js` 的 DOM id、必需文档 |
| `node tests/smoke.js` | 模块挂载、默认主题与语言、中英意图解析、校验拦截、闭环 PASS、报告双语、主题配色、切回还原 |
| `npm run verify` | 两者一起跑 |

`tests/smoke.js` 用极简 DOM 桩在 `node:vm` 里加载**真实模块**，不需要 jsdom 或浏览器。
新增功能时请顺手补一条断言。

GitHub Actions（`.github/workflows/ci.yml`）在 Node 18 / 20 / 22 上跑这两条命令，
`push` 到 `main` 与所有 PR 都会触发。

## 8. 编码约定

- **CRLF 行尾**：Windows 项目约定。`.gitattributes` 让仓库内统一存 LF、检出时还原 CRLF，
  避免 diff 里出现整文件重写。
- **零运行时依赖**：不要为几行工具函数引入包；`scripts/` 与 `tests/` 只用 Node 内置模块。
- **新增源文件带 Apache-2.0 版权头**，格式照抄 `src/*.js` 顶部。
- **工作流 JSON 字段名保持中文**，且不要在双语切换时翻译它。
- 中文注释与变量名可用（本项目既有风格），但公开 API / 事件名保持稳定。
- 提交信息用 Conventional Commits，详见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 9. 发布

维护者流程见 [CONTRIBUTING.md](../CONTRIBUTING.md) 的「发布流程」。
用户可见变更要同时更新 `CHANGELOG.md`、中英 README 与相关 `docs/`。
