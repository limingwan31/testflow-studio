/*
 * Copyright 2026 liming
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*
 * 多语言与主题
 * ------------------------------------------------------------
 * 设计：数据层的中文作为稳定契约（工作流 JSON 字段名不随语言变化），
 * 所有「展示文本」统一经过 tr() 转换。这样工作流定义、执行引擎、报告数据
 * 不需要改动，切换语言只需重新渲染界面。
 * 主题通过 <html data-theme="..."> 切换，波形 SVG 由 report.js 读取当前主题取色。
 */
(function (global) {
  'use strict';
  var FlowLab = global.FlowLab = global.FlowLab || {};

  // 中文短语 → 英文。长短语优先替换，避免把「设定电压」拆成「Set Voltage」以外的碎片。
  var 短语 = {
    '会话开始先复位并清除错误队列': 'Reset and clear the error queue at session start',
    '先设限流与过压保护，再允许上电': 'Set current limit and OVP before enabling output',
    '每个配置块之后读取仪器错误队列': 'Read the instrument error queue after each configuration block',
    '无论成功或异常，输出必须关闭': 'Always turn output off, on success or error',
    '执行工作流步骤': 'Execute workflow steps',
    '${限值.过冲上限}': '${limit.overshoot_max}',
    '${扫描电压}': '${sweep_voltage}',
    '限值必须来自用户输入，不能由模型设定': 'Limits must come from user input, not the model',
    '的驱动尚未接入真实设备（占位）': ' driver is not connected to real hardware (placeholder)',
    '工作流为空': 'Workflow is empty',
    '不支持能力': ' does not support capability ',
    '未登记设备：': 'Unregistered device: ',
    '未登记能力：': 'Unregistered capability: ',
    '找不到设备：': 'Device not found: ',
    '开始执行': 'Starting run',
    '已就绪': 'ready',
    '工作流': 'Workflow',
    '过冲限值': 'Overshoot limit',
    'AI 自动化测试平台 · 通用可插拔框架原型': 'AI test automation platform · pluggable framework prototype',
    '本地规则规划器（接口可直接替换为 LLM / OpenTAP MCP）': 'Local rule planner (swappable for LLM / OpenTAP MCP)',
    '换上 Playwright / HttpClient 适配器即可测软件': 'Swap in a Playwright / HttpClient adapter to test software',
    '换上 Modbus/OPC UA 适配器即可驱动真实设备': 'Swap in a Modbus/OPC UA adapter to drive real hardware',
    '测量过冲 / 下跌 / 纹波 / 稳定时间': 'Measure overshoot / undershoot / ripple / settling',
    '限值来自用户输入，发布后锁定，AI 不可放宽': 'Limit from user input, locked after publish, AI cannot relax',
    '驱动能力定义文件（AI 不生成命令）': 'Driver capability definition (AI does not generate commands)',
    'AI 只生成步骤与参数 · 限值来自用户输入并锁定 · 测量值只来自执行结果':
      'AI generates steps and parameters only · limits come from user input and are locked · measurements come only from execution',
    '用一句话描述，像交代给同事一样': 'Describe it in one sentence, the way you would tell a colleague',
    '用户输入（发布后锁定，AI 不可修改）': 'User input (locked after publish, AI cannot modify)',
    '运行后，报告由实测数据自动生成': 'Reports are generated from measured data after each run',
    '本原型': 'This prototype', '正式实现建议': 'Production implementation',
    '工作流 JSON 字段名为稳定契约，不随界面语言变化':
      'Workflow JSON field names are a stable contract and do not change with UI language',
    '捕获波形将在这里显示': 'The captured waveform appears here',
    '限值锁定，AI 不可修改': 'limit locked, AI cannot modify',
    '换真实模型时只要替换': 'To use a real model, replace',
    '本报告全部数值由运行记录': 'All values in this report come from run',
    '渲染生成，未经过语言模型': 'and were rendered by code, not a language model',
    '驱动与执行引擎解耦，替换适配器即可换被测对象':
      'Drivers are decoupled from the engine; swap an adapter to change the device under test',
    '还没有运行记录。运行一次后，工作流版本与结论会留在这里，可随时载入复跑。':
      'No runs yet. After a run, the workflow revision and verdict are kept here for reruns.',
    '（异常路径同样执行）': ' (also executed on the error path)',
    '（演示环境已加速）': ' (accelerated in this demo)',
    '命令来自驱动定义': 'Command from driver definition',
    '工作流画布': 'Workflow canvas',
    'PSU 负载瞬态测试 · 测试报告': 'PSU load transient · test report',
    'PSU 负载瞬态测试': 'PSU load transient test',
    '电源 VI 扫描测试': 'Power supply VI sweep',
    '产线节点巡检测试': 'Production line node inspection',
    '限值来源：用户输入': 'Limit source: user input',
    '最差值与限值': 'Worst case vs limits',
    '工作流版本': 'Workflow revision',
    '过冲限值判定': 'Overshoot limit check',
    '测量瞬态参数': 'Measure transient parameters',
    '等待电源与负载稳定': 'Wait for supply and load to settle',
    '设置限流与过压保护': 'Set current limit and OVP',
    '回读输出电压实测值': 'Read back measured output voltage',
    '回读输出电压': 'Read back output voltage',
    'CH1 捕获负载瞬态波形': 'Capture the load transient on CH1',
    'CH2 输出，先设保护再上电': 'CH2 output, set protection before power-on',
    '2.5 A 阶跃负载': '2.5 A load step',
    '被测 Web 服务': 'Web service under test',
    '产线 PLC 节点': 'Production line PLC node',
    '数字万用表': 'Digital multimeter',
    '发起 HTTP 请求': 'HTTP GET request',
    '查询系统错误': 'Query system errors',
    '设置负载电流': 'Set load current',
    '测量直流电压': 'Measure DC voltage',
    '读保持寄存器': 'Read holding register',
    '复位与清错': 'Reset and clear errors',
    '程控电源': 'Power supply',
    '电子负载': 'Electronic load',
    '模拟仪器': 'Simulated instrument',
    '工业协议': 'Industrial protocol',
    '软件接口': 'Software interface',
    '示波器': 'Oscilloscope',
    '设置电压': 'Set voltage',
    '设置时基': 'Set timebase',
    '打开输出': 'Output on',
    '关闭输出': 'Output off',
    '负载导通': 'Load on',
    '负载关闭': 'Load off',
    '写线圈': 'Write coil',
    '稳定等待': 'Settling delay',
    '扫描电压': 'sweep_voltage',
    '过冲 / 下跌 / 纹波 / 稳定时间': 'Overshoot / undershoot / ripple / settling',
    '过冲实测': 'Measured overshoot',
    'VOUT 实测值': 'Measured VOUT',
    '过冲上限': 'Overshoot limit',
    '工作流已生成': 'Workflow generated',
    '工作流已就绪': 'Workflow ready',
    '校验通过': 'validation passed',
    '等待运行': 'Waiting to run',
    '个扫描点': ' sweep points',
    '个步骤': ' steps',
    '循环': 'Loop',
    '可编辑': 'editable',
    '限值锁定': 'Limit locked',
    '运行历史': 'Run history',
    '运行编号': 'Run ID',
    '开始时间': 'Start time',
    '限值来源': 'Limit source',
    '测量结果': 'Measurement results',
    '实测最差': 'Measured worst',
    '测试报告': 'Test report',
    '点位': 'Point',
    '设定电压': 'Set voltage',
    '实测电压': 'Measured voltage',
    '稳定时间': 'Settling',
    '电流': 'Current',
    '电压': 'Voltage',
    '过冲': 'Overshoot',
    '下跌': 'Undershoot',
    '纹波': 'Ripple',
    '时基': 'Timebase',
    '时长': 'Duration',
    '通道': 'Channel',
    '指标': 'Metric',
    '上限': 'Upper limit',
    '地址': 'Address',
    '路径': 'Path',
    '限流': 'Current limit',
    '过压': 'OVP',
    '结论': 'Verdict',
    '判定': 'Verdict',
    '最差': 'Worst',
    '限值': 'Limit',
    '来源': 'Source',
    '用户输入': 'User input',
    '手动添加': 'Added manually',
    '稳定': 'settling',
    '延时': 'Delay',
    '进入循环': 'Entering loop',
    '会话开始': 'Session started',
    '变量': 'variable',
    '点通过': ' points passed',
    '运行结束': 'Run finished',
    '运行已被用户中止': 'Run aborted by user',
    '运行完成': 'Run complete',
    '正在中止': 'Aborting',
    '执行异常': 'Run error',
    '执行中': 'Running',
    '已中止': 'Aborted',
    '已载入': 'Loaded',
    '，点运行即可复跑': ', click Run to rerun',
    '步骤参数已更新': 'Step parameters updated',
    '该步骤无可编辑参数': 'This step has no editable parameters',
    '已添加步骤': 'Step added',
    '校验失败': 'Validation failed',
    '就绪 · 模拟仪器已连接': 'Ready · simulated instruments connected',
    '报告由运行记录': 'Report rendered from run',
    '渲染 · 无模型生成的数值': '· no model-generated values',
    '最差过冲': 'Worst overshoot',
    '点': ' points',
    '完成': 'Complete',
    '会话结束': 'Session closed',
    '设备': 'Device',
    '能力': 'Capability',
    '添加': 'Add',
    '取消': 'Cancel',
    '保存': 'Save',
    '编辑参数': 'Edit parameters',
    '上移': 'Move up',
    '下移': 'Move down',
    '删除': 'Delete',
    '测试台设备': 'Bench instruments',
    '驱动注册表': 'Driver registry',
    '测试意图': 'Test intent',
    '生成工作流': 'Generate workflow',
    '工作流名称': 'Workflow name',
    '架构接入点': 'Architecture',
    '执行日志': 'Execution log',
    '步骤 JSON': 'Step JSON',
    '安全护栏': 'Safety guards',
    '架构': 'Architecture',
    '运行结果': 'Run results',
    '导出 CSV': 'Export CSV',
    '导出报告 MD': 'Export report MD',
    '打印 / PDF': 'Print / PDF',
    '一键复跑': 'Rerun',
    '运行': 'Run',
    '停止': 'Stop',
    '未运行': 'Not run',
    '运行中': 'Running',
    '运行中...': 'Running...',
    '模拟模式': 'Simulation mode',
    '可插拔': 'Pluggable',
    '已实现': 'Implemented',
    '待接入': 'Not connected',
    '占位': 'Placeholder',
    '在线': 'online',
    '台': ' devices',
    '点 · ': ' points · ',
    '点击载入该版本': 'Click to load this revision',
    '尚无运行数据': 'No run data yet',
    '等待实测数据': 'Awaiting measurement data',
    '结束': 'End',
    '开始': 'Start'
  };

  var 排序键 = Object.keys(短语).sort(function (a, b) { return b.length - a.length; });
  var 语言 = 'zh';
  var 主题 = 'dark';
  var 重绘回调 = [];

  function 读(key, 默认) {
    try { return localStorage.getItem(key) || 默认; } catch (e) { return 默认; }
  }
  function 写(key, 值) {
    try { localStorage.setItem(key, 值); } catch (e) { /* 隐私模式忽略 */ }
  }

  function tr(s) {
    var 文本 = String(s == null ? '' : s);
    if (语言 !== 'en' || !文本) return 文本;
    if (短语[文本]) return 短语[文本];
    for (var i = 0; i < 排序键.length; i++) {
      var k = 排序键[i];
      if (文本.indexOf(k) >= 0) 文本 = 文本.split(k).join(短语[k]);
    }
    return 文本;
  }

  function 应用文档属性() {
    document.documentElement.setAttribute('data-theme', 主题);
    document.documentElement.setAttribute('lang', 语言 === 'zh' ? 'zh-CN' : 'en');
  }

  // 静态文案：元素上的中文原文缓存在 data-zh，切换语言时用原文重新翻译
  function 应用静态() {
    应用文档属性();
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.getAttribute('data-zh')) el.setAttribute('data-zh', el.textContent);
      el.textContent = tr(el.getAttribute('data-zh'));
    }
  }

  function 触发重绘() {
    重绘回调.forEach(function (fn) { try { fn(); } catch (e) { /* 单个回调失败不影响其他 */ } });
  }

  function 设置语言(值) {
    语言 = 值 === 'en' ? 'en' : 'zh';
    写('testflow.lang', 语言);
    应用静态();
    触发重绘();
  }

  function 设置主题(值) {
    主题 = 值 === 'light' ? 'light' : 'dark';
    写('testflow.theme', 主题);
    应用静态();
    触发重绘();
  }

  function 初始化() {
    语言 = 读('testflow.lang', 'zh') === 'en' ? 'en' : 'zh';
    主题 = 读('testflow.theme', 'dark') === 'light' ? 'light' : 'dark';
    应用文档属性();
  }

  FlowLab.I18n = {
    tr: tr,
    初始化: 初始化,
    应用静态: 应用静态,
    设置语言: 设置语言,
    设置主题: 设置主题,
    切换主题: function () { 设置主题(主题 === 'dark' ? 'light' : 'dark'); },
    注册重绘: function (fn) { 重绘回调.push(fn); },
    语言: function () { return 语言; },
    主题: function () { return 主题; },
    是英文: function () { return 语言 === 'en'; }
  };
})(window);
