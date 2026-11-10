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
 * 工作台 UI
 * ------------------------------------------------------------
 * 只负责渲染与交互，不含任何测量逻辑。
 * 数据流：意图 → Planner 工作流 → Engine 运行记录 → Report 渲染。
 * 语言与主题切换时走「重新渲染」：中文始终是数据契约，展示层统一经 T()/L() 转换。
 */
(function () {
  'use strict';
  var D = window.FlowLab.Drivers;
  var P = window.FlowLab.Planner;
  var E = window.FlowLab.Engine;
  var R = window.FlowLab.Report;
  var I = window.FlowLab.I18n;

  function $(id) { return document.getElementById(id); }
  function T(s) { return I.tr(s); }
  function L(zh, en) { return I.是英文() ? en : zh; }

  function 转义(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var 示例库 = {
    zh: [
      '扫 5-20 V 电源，在 CH1 捕获负载瞬态，过冲限值 200 mV，2.5 A 负载',
      'VI 扫描 1 到 10 V，步进 1 V，0.5 A 负载电流，限值 150 mV',
      '3V3 轨负载阶跃 9-20 V，通道 CH2，过冲不超过 180 mV，3 A 负载'
    ],
    en: [
      'Sweep 5-20 V supply, capture the rail transient on CH1, overshoot limit 200 mV, 2.5 A load',
      'VI sweep from 1 to 10 V in 1 V steps at 0.5 A load, limit 150 mV',
      '3V3 rail load step 9-20 V, CH2, overshoot under 180 mV, 3 A load'
    ]
  };

  var 安全序列EN = [
    '*RST; *CLS                          // Reset and clear the error queue at session start',
    'CURR 3.0,(@2); VOLT:PROT 22        // Set current limit and OVP before enabling output',
    'SYST:ERR?                          // Read the instrument error queue after each config block',
    '…… Execute workflow steps ……',
    'finally { OUTP OFF,(@2); LOAD OFF } // Always turn output off, on success or error'
  ];

  var 日志类名 = {
    阶段: 'stage', 步骤: 'step', 日志: 'log', 测量: 'measure',
    判定: 'verdict', 汇总: 'summary', 完成: 'complete', 错误: 'error'
  };
  var 日志标签 = {
    阶段: ['阶段', 'Stage'], 步骤: ['步骤', 'Step'], 日志: ['日志', 'Log'],
    测量: ['测量', 'Meas'], 判定: ['判定', 'Check'], 汇总: ['汇总', 'Sum'],
    完成: ['完成', 'Done'], 错误: ['错误', 'Err']
  };

  var 状态 = {
    工作流: null,
    记录: null,
    运行中: false,
    历史: [],
    日志事件: [],
    界面语言: 'zh',
    等待文本: '',
    进度文本: '',
    进度值: 0,
    状态对象: { zh: '就绪', en: 'Ready', 类别: '' },
    徽章: { zh: '未运行', en: 'Not run', 类: '' }
  };

  function 当前示例() { return 示例库[I.语言()] || 示例库.zh; }

  function 设置状态(zh, en, 类别) {
    状态.状态对象 = { zh: zh, en: en, 类别: 类别 || '' };
    应用状态();
  }
  function 应用状态() {
    var s = 状态.状态对象;
    $('状态文本').textContent = L(s.zh, s.en);
    $('状态灯').className = 'status-dot' + (s.类别 ? ' ' + s.类别 : '');
  }

  function 设置徽章(zh, en, 类) {
    状态.徽章 = { zh: zh, en: en, 类: 类 || '' };
    应用徽章();
  }
  function 应用徽章() {
    var b = 状态.徽章;
    $('结论徽章').textContent = L(b.zh, b.en);
    $('结论徽章').className = 'verdict' + (b.类 ? ' ' + b.类 : '');
  }

  function 应用进度(百分比, 中文文本) {
    状态.进度值 = 百分比;
    状态.进度文本 = 中文文本 || 状态.等待文本;
    $('进度条').style.width = 百分比 + '%';
    $('进度文本').textContent = T(状态.进度文本);
  }

  /* ---------- 顶栏与示例 ---------- */

  function 渲染顶栏() {
    Array.prototype.forEach.call($('语言切换').querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === I.语言());
    });
    $('主题按钮文字').textContent = I.主题() === 'dark'
      ? L('切换浅色', 'Light theme') : L('切换深色', 'Dark theme');
    document.title = L('TestFlow Studio · AI 自动化测试平台原型', 'TestFlow Studio · AI test automation prototype');
  }

  function 渲染示例() {
    var 旧示例 = 示例库[状态.界面语言] || 示例库.zh;
    var 当前值 = $('意图输入').value.trim();
    var idx = 旧示例.indexOf(当前值);
    var 语言 = I.语言();
    $('示例按钮组').innerHTML = 示例库[语言].map(function (s, i) {
      return '<button class="chip" data-example="' + i + '">' + 转义(s) + '</button>';
    }).join('');
    if (idx >= 0) $('意图输入').value = 示例库[语言][idx];
    状态.界面语言 = 语言;
  }

  /* ---------- 左侧：设备与驱动 ---------- */

  function 渲染设备() {
    var 列表 = D.列出();
    var 在线数 = 列表.filter(function (d) { return d.状态 === '在线'; }).length;
    $('设备计数').textContent = 列表.length;
    $('设备在线').textContent = 在线数 + ' / ' + 列表.length + ' ' + L('在线', 'online');
    $('设备列表').innerHTML = 列表.map(function (d) {
      var 能力行 = '<div class="cap-line">' + 转义(T(d.说明)) + '</div>' +
        d.能力.map(function (k) {
          var 定义 = D.能力(k);
          return '<div class="cap-line">' + 转义(k) + ' → ' + 转义(定义 ? 定义.命令 : '') + '</div>';
        }).join('');
      return '<div class="device-card" data-device="' + 转义(d.id) + '">' +
        '<div class="device-head"><span class="' + (d.状态 === '在线' ? 'dot-on' : 'dot-off') + '"></span>' +
        '<span class="nm">' + 转义(T(d.名称)) + '</span>' +
        '<span class="hint">' + 转义(T(d.实现)) + '</span></div>' +
        '<div class="device-model">' + 转义(d.厂商) + ' · ' + 转义(d.型号) + ' · ' + 转义(T(d.类别)) + '</div>' +
        '<div class="device-addr">' + 转义(d.地址) + '</div>' +
        '<div class="device-caps">' + 能力行 + '</div>' +
        '</div>';
    }).join('');
  }

  function 渲染驱动() {
    var 列表 = D.列出();
    var 分组 = {};
    列表.forEach(function (d) {
      if (!分组[d.类别]) 分组[d.类别] = { 总数: 0, 在线: 0, 名称: T(d.类别) };
      分组[d.类别].总数++;
      if (d.状态 === '在线') 分组[d.类别].在线++;
    });
    $('驱动列表').innerHTML = Object.keys(分组).map(function (k) {
      var g = 分组[k];
      return '<div class="driver-row"><span class="driver-cat">' + 转义(g.名称) + '</span>' +
        '<span class="driver-count">' + g.总数 + L(' 台', ' devices') + '</span>' +
        '<span class="driver-status ' + (g.在线 ? 'on' : '') + '">' +
        L(g.在线 ? '已实现' : '占位', g.在线 ? 'Implemented' : 'Placeholder') + '</span></div>';
    }).join('') +
      '<div class="driver-row" style="margin-top:6px;color:var(--faint)">' +
      转义(L('驱动与执行引擎解耦，替换适配器即可换被测对象',
        'Drivers are decoupled from the engine; swap an adapter to change the device under test')) + '</div>';
  }

  /* ---------- 中间：工作流 ---------- */

  function 循环步骤() {
    if (!状态.工作流) return null;
    for (var i = 0; i < 状态.工作流.步骤.length; i++) {
      if (状态.工作流.步骤[i].类型 === '循环') return 状态.工作流.步骤[i];
    }
    return null;
  }

  function 参数文本(步骤) {
    var 参数 = 步骤.参数 || {};
    var 键 = Object.keys(参数);
    if (!键.length) return T(步骤.说明 || '');
    return T(键.map(function (k) { return k + ' = ' + 参数[k]; }).join('  ·  ') +
      (步骤.说明 ? '  ·  ' + 步骤.说明 : ''));
  }

  function 步骤节点(步骤, 范围, 索引, 序号) {
    var 样式 = '';
    var 命令 = '';
    var 标签 = '';
    var 标题 = 步骤.标题 || 步骤.类型;
    if (步骤.类型 === '动作') {
      var 设备 = D.取(步骤.设备);
      标签 = 设备 ? T(设备.名称) : 步骤.设备;
      命令 = D.命令(步骤.设备, 步骤.能力, 步骤.参数 || {});
    } else if (步骤.类型 === '延时') {
      样式 = ' node-delay';
      命令 = 'Delay ' + 步骤.参数.时长 + ' ms';
    } else if (步骤.类型 === '判定') {
      样式 = ' node-assert';
      命令 = L('ASSERT 过冲 < ', 'ASSERT overshoot < ') + 状态.工作流.限值.过冲上限 +
        L(' mV（限值锁定）', ' mV (limit locked)');
    } else {
      样式 = ' node-terminal';
      命令 = T(步骤.说明 || '');
      标题 = L(步骤.类型 === '开始' ? '开始' : '结束', 步骤.类型 === '开始' ? 'Start' : 'End');
    }

    var 工具 = '';
    if (范围 === '子') {
      工具 = '<div class="node-tools">' +
        '<button data-act="edit" title="' + 转义(L('编辑参数', 'Edit parameters')) + '">✎</button>' +
        '<button data-act="up" title="' + 转义(L('上移', 'Move up')) + '">↑</button>' +
        '<button data-act="down" title="' + 转义(L('下移', 'Move down')) + '">↓</button>' +
        '<button data-act="del" title="' + 转义(L('删除', 'Delete')) + '">×</button></div>';
    }

    return '<div class="node' + 样式 + '" data-scope="' + 范围 + '" data-index="' + 索引 + '">' +
      '<div class="node-idx">' + 转义(序号) + '</div>' +
      '<div class="node-main">' +
      '<div class="node-title">' + 转义(T(标题)) +
      (标签 ? '<span class="tag">' + 转义(标签) + '</span>' : '') + '</div>' +
      '<div class="node-cmd">' + 转义(命令) + '</div>' +
      '<div class="node-params">' + 转义(参数文本(步骤)) + '</div>' +
      '</div>' +
      (范围 === '子' ? '<div class="node-src">' + 转义(L('命令来自驱动定义', 'Command from driver definition')) + '</div>' : '') +
      工具 + '</div>';
  }

  function 渲染画布() {
    var wf = 状态.工作流;
    if (!wf) { $('画布').innerHTML = ''; return; }
    var html = '';
    wf.步骤.forEach(function (步骤, idx) {
      if (步骤.类型 === '循环') {
        html += '<div class="node node-loop"><div class="node-idx">L</div>' +
          '<div class="node-main"><div class="node-title">' + 转义(T(步骤.标题)) +
          ' <span class="tag">Loop × ' + 步骤.取值.length + '</span></div>' +
          '<div class="node-cmd">${' + 转义(T(步骤.变量)) + '} = [ ' +
          步骤.取值.map(function (v) { return v + ' V'; }).join(' · ') + ' ]</div>' +
          '<div class="node-params">' + 转义(T(步骤.说明)) + '</div></div></div>';
        html += '<div class="loop-group"><div class="loop-children">' +
          步骤.子步骤.map(function (子, i) { return 步骤节点(子, '子', i, String(i + 1)); }).join('') +
          '</div></div>';
      } else {
        html += 步骤节点(步骤, '主', idx, 步骤.类型 === '开始' ? 'S' : 'E');
      }
    });
    $('画布').innerHTML = html;
  }

  function 渲染工作流() {
    var wf = 状态.工作流;
    if (!wf) return;
    $('工作流名称').textContent = T(wf.名称) + ' · ' + T(wf.生成方式);
    $('修订号').textContent = wf.修订号;
    $('限值标签').textContent = L('限值锁定 · 过冲 < ', 'Limit locked · overshoot < ') +
      wf.限值.过冲上限 + L(' mV · 来源：用户输入', ' mV · source: user input');
    var 循环 = 循环步骤();
    var n = 循环 ? 循环.取值.length : 0;
    var 动作数 = 循环 ? 循环.子步骤.length : 0;
    $('步骤计数').textContent = L('循环', 'Loop') + ' × ' + n + ' · ' + 动作数 +
      L(' 个步骤 · 可编辑', ' steps · editable');
    状态.等待文本 = L('等待运行 · ', 'Waiting to run · ') + n + L(' 个扫描点', ' sweep points');
    $('JSON视图').textContent = JSON.stringify(wf, null, 2);
    渲染画布();
    渲染护栏();
  }

  function 生成工作流() {
    var 描述 = $('意图输入').value.trim() || 当前示例()[0];
    状态.工作流 = P.生成(描述, 状态.工作流);
    var 错误 = P.校验(状态.工作流);
    if (错误.length) {
      设置状态(L('校验失败：', 'Validation failed: ') + T(错误[0]),
        L('校验失败：', 'Validation failed: ') + T(错误[0]), 'error');
      return;
    }
    状态.记录 = null;
    渲染工作流();
    渲染空结果();
    应用进度(0, 状态.等待文本);
    设置徽章('未运行', 'Not run', '');
    清空日志('工作流 ' + 状态.工作流.修订号 + ' 已就绪 · 校验通过 · 等待运行');
    设置状态(L('工作流已生成 · ', 'Workflow generated · ') + 状态.工作流.修订号,
      L('工作流已生成 · ', 'Workflow generated · ') + 状态.工作流.修订号, '');
  }

  /* ---------- 添加 / 编辑步骤 ---------- */

  function 显示添加表单() {
    var 在线 = D.列出().filter(function (d) { return d.状态 === '在线'; });
    var html = '<div class="row"><label>' + 转义(L('设备', 'Device')) + '</label><select id="新设备">' +
      在线.map(function (d) { return '<option value="' + 转义(d.id) + '">' + 转义(d.型号) + '</option>'; }).join('') +
      '</select><label>' + 转义(L('能力', 'Capability')) + '</label><select id="新能力"></select>' +
      '<span id="新参数区" class="row"></span>' +
      '<button id="确认添加" class="btn btn-primary btn-sm">' + 转义(L('添加', 'Add')) + '</button>' +
      '<button id="取消添加" class="btn btn-ghost btn-sm">' + 转义(L('取消', 'Cancel')) + '</button></div>';
    var box = $('添加表单');
    box.innerHTML = html;
    box.classList.remove('hidden');

    function 刷新能力() {
      var 设备 = D.取($('新设备').value);
      $('新能力').innerHTML = 设备.能力.map(function (k) {
        return '<option value="' + 转义(k) + '">' + 转义(T(D.能力(k).名称)) + '</option>';
      }).join('');
      刷新参数();
    }
    function 刷新参数() {
      var 定义 = D.能力($('新能力').value);
      $('新参数区').innerHTML = (定义.参数 || []).map(function (k) {
        return '<label>' + 转义(T(k)) + '</label><input data-p="' + 转义(k) +
          '" placeholder="' + 转义(T(k)) + '" style="width:88px">';
      }).join('');
    }
    $('新设备').addEventListener('change', 刷新能力);
    $('新能力').addEventListener('change', 刷新参数);
    刷新能力();

    $('取消添加').addEventListener('click', function () { box.classList.add('hidden'); });
    $('确认添加').addEventListener('click', function () {
      var 循环 = 循环步骤();
      if (!循环) return;
      var 参数 = {};
      Array.prototype.forEach.call($('新参数区').querySelectorAll('input'), function (inp) {
        参数[inp.getAttribute('data-p')] = inp.value || '0';
      });
      var 能力键 = $('新能力').value;
      循环.子步骤.push({
        序号: String(循环.子步骤.length + 1), 类型: '动作',
        标题: D.能力(能力键).名称, 设备: $('新设备').value, 能力: 能力键,
        参数: 参数, 说明: '手动添加',
        命令来源: '驱动能力定义文件（AI 不生成命令）'
      });
      box.classList.add('hidden');
      渲染工作流();
      设置状态(L('已添加步骤 · ', 'Step added · ') + 状态.工作流.修订号,
        L('已添加步骤 · ', 'Step added · ') + 状态.工作流.修订号, '');
    });
  }

  function 画布点击(e) {
    var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    var node = btn.closest('.node');
    if (!node) return;
    var 范围 = node.getAttribute('data-scope');
    var 索引 = parseInt(node.getAttribute('data-index'), 10);
    var 动作 = btn.getAttribute('data-act');
    var 循环 = 循环步骤();
    var 子 = 循环 ? 循环.子步骤 : null;
    if (!子) return;

    if (动作 === 'up' && 索引 > 0) {
      var t = 子[索引 - 1]; 子[索引 - 1] = 子[索引]; 子[索引] = t;
    } else if (动作 === 'down' && 索引 < 子.length - 1) {
      var t2 = 子[索引 + 1]; 子[索引 + 1] = 子[索引]; 子[索引] = t2;
    } else if (动作 === 'del') {
      子.splice(索引, 1);
    } else if (动作 === 'edit') {
      编辑参数(node, 子[索引]);
      return;
    }
    渲染工作流();
  }

  function 编辑参数(node, 步骤) {
    var 容器 = node.querySelector('.node-params');
    var 参数 = 步骤.参数 || {};
    var 键 = Object.keys(参数);
    if (!键.length) {
      设置状态('该步骤无可编辑参数', 'This step has no editable parameters', '');
      return;
    }
    var html = '<div class="param-editor">' + 键.map(function (k) {
      return '<span class="k">' + 转义(T(k)) + '</span><input class="param-input" data-k="' + 转义(k) +
        '" value="' + 转义(参数[k]) + '" style="width:110px">';
    }).join('') + '<button class="btn btn-primary btn-sm" data-save="1">' +
      转义(L('保存', 'Save')) + '</button>' +
      '<button class="btn btn-ghost btn-sm" data-cancel="1">' + 转义(L('取消', 'Cancel')) + '</button></div>';
    容器.innerHTML = html;
    容器.querySelector('[data-save]').addEventListener('click', function () {
      Array.prototype.forEach.call(容器.querySelectorAll('input'), function (inp) {
        步骤.参数[inp.getAttribute('data-k')] = inp.value;
      });
      渲染工作流();
      设置状态('步骤参数已更新', 'Step parameters updated', '');
    });
    容器.querySelector('[data-cancel]').addEventListener('click', function () { 渲染工作流(); });
  }

  /* ---------- 右侧：日志 / JSON / 护栏 / 架构 ---------- */

  function 日志行(e) {
    var box = $('日志列表');
    var line = document.createElement('div');
    var 类 = 日志类名[e.类型] || 'log';
    var 标签 = 日志标签[e.类型] ? L(日志标签[e.类型][0], 日志标签[e.类型][1]) : e.类型;
    line.className = 'log-line t-' + 类 + (e.数据 && e.数据.通过 === false ? ' fail' : '');
    line.innerHTML = '<span class="log-time">' + 转义(e.时间) + '</span>' +
      '<span class="log-type">' + 转义(标签) + '</span>' +
      '<span class="log-text">' + 转义(T(e.文本)) + '</span>';
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  function 清空日志(首行) {
    状态.日志事件 = [];
    if (首行) {
      状态.日志事件.push({
        类型: '阶段', 文本: 首行,
        时间: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      });
    }
    重绘日志();
  }
  function 追加日志(e) {
    状态.日志事件.push(e);
    日志行(e);
  }
  function 重绘日志() {
    $('日志列表').innerHTML = '';
    状态.日志事件.forEach(日志行);
  }

  function 切换Tab(名) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === 名);
    });
    ['日志', 'JSON', '护栏', '架构'].forEach(function (k) {
      $('Tab-' + k).classList.toggle('active', k === 名);
    });
  }

  function 护栏HTML() {
    var wf = 状态.工作流;
    var 序列 = (I.是英文() ? 安全序列EN : (wf ? wf.安全预检 : [])).join('\n');
    if (I.是英文()) {
      return '<h3>Four guardrails you cannot skip</h3><ul>' +
        '<li><b>Command allowlist</b>: the model may only reference a capability name. SCPI / Modbus command strings come exclusively from the capability definitions in <code>drivers.js</code> and can be previewed before execution.</li>' +
        '<li><b>Locked limits</b>: limits come from user input and the published workflow is immutable. AI cannot relax a limit to make a test pass, nor declare a PASS without a run.</li>' +
        '<li><b>Data provenance</b>: every number in a report comes from the run record and is filled by template code. The model only writes purpose, setup notes and deviation notes.</li>' +
        '<li><b>Fail-safe</b>: reset first, set OVP / OCP before enabling output, read <code>SYST:ERR?</code> after every configuration block, and always turn output and load off in <code>finally</code>.</li>' +
        '</ul><h3>Safety sequence injected into this run</h3><pre>' + 转义(序列) + '</pre>' +
        '<h3>Validation</h3><p><code>Planner.校验()</code> checks devices, capabilities and limit provenance when a workflow is generated. Steps that fail validation never reach the execution engine.</p>' +
        '<h3>Still missing before production</h3><ul>' +
        '<li>User / operator permissions and audit logs</li><li>Results database and multi-station sync</li>' +
        '<li>Command timeouts, busy instruments, retries and reconnect recovery</li>' +
        '<li>Workflow signing and durable immutable revisions</li></ul>';
    }
    return '<h3>四条不可跳过的约束</h3><ul>' +
      '<li><b>命令白名单</b>：模型只能引用「能力名」，SCPI / Modbus 命令字符串一律来自 <code>drivers.js</code> 的能力定义，执行前可完整预览。</li>' +
      '<li><b>限值锁定</b>：限值来自用户输入，工作流发布后不可变；AI 不能放宽限值让测试通过，也不能凭空声明 PASS。</li>' +
      '<li><b>数据溯源</b>：报告里每个数字都来自运行记录，由模板代码填充；模型只写目的、设置说明与偏差备注。</li>' +
      '<li><b>失效安全</b>：先复位、先设 OVP / OCP 再上电，每块配置后读 <code>SYST:ERR?</code>，<code>finally</code> 中必须关闭输出与负载。</li>' +
      '</ul><h3>本次运行注入的安全序列</h3><pre>' + 转义(序列) + '</pre>' +
      '<h3>校验结果</h3><p>生成工作流时会调用 <code>Planner.校验()</code> 检查设备、能力与限值来源；校验不通过的步骤不会进入执行引擎。</p>' +
      '<h3>还缺什么（生产化前必须补）</h3><ul>' +
      '<li>用户与操作员权限、审计日志</li><li>结果数据库与多工位同步</li>' +
      '<li>命令超时、仪器忙、重试与断连恢复</li><li>工作流签名与不可变发布的持久化</li></ul>';
  }

  function 渲染护栏() { $('护栏视图').innerHTML = 护栏HTML(); }

  function 渲染架构() {
    var 代码 = [
      L('// 驱动适配器接口：接真机只需实现这一个契约', '// Driver adapter contract: implement this once to connect real hardware'),
      'interface IDriverAdapter {',
      '  string Id { get; }',
      '  Task<Result> ExecuteAsync(',
      '      Capability capability,',
      '      IReadOnlyDictionary<string, object> args,',
      '      RunContext ctx, CancellationToken ct);',
      '}',
      '',
      L('// 三个实现，可插拔替换，上层零改动', '// Pluggable implementations, no changes above this layer'),
      L('VisaScpiAdapter    → NI-VISA / SCPI 仪器', 'VisaScpiAdapter    → NI-VISA / SCPI instruments'),
      L('ModbusTcpAdapter   → PLC / 产线节点', 'ModbusTcpAdapter   → PLC / production line nodes'),
      L('HttpAdapter        → Web / API 被测对象', 'HttpAdapter        → Web / API under test'),
      L('SimulatedAdapter   → 本原型当前实现', 'SimulatedAdapter   → used by this prototype')
    ].join('\n');

    var 英 = I.是英文();
    $('架构视图').innerHTML =
      '<h3>' + L('原型模块 → 正式平台', 'Prototype module → production platform') + '</h3>' +
      '<table><tr><th>' + L('本原型', 'This prototype') + '</th><th>' +
      L('正式实现建议', 'Production implementation') + '</th></tr>' +
      '<tr><td>drivers.js</td><td>OpenTAP Instrument / SCPI ' + L('插件 + 驱动能力定义文件', 'plugins + capability definitions') + '</td></tr>' +
      '<tr><td>planner.js</td><td>LLM ' + L('经', 'via') + ' OpenTAP MCP ' + L('返回结构化步骤', 'returns structured steps') + ' JSON</td></tr>' +
      '<tr><td>engine.js</td><td>OpenTAP TestPlan ' + L('执行引擎', 'engine') + ' + ResultListener</td></tr>' +
      '<tr><td>report.js</td><td>' + L('模板引擎渲染 run 结果文件', 'Template engine renders run results') + ' → PDF / Excel</td></tr>' +
      '<tr><td>app.js</td><td>ASP.NET Core + Blazor Server / SignalR</td></tr>' +
      '<tr><td>localStorage</td><td>PostgreSQL / SQLite + ' + L('工作流版本库', 'workflow revision store') + '</td></tr></table>' +
      '<h3>' + L('推荐技术栈（贴合现有 .NET 积累）', 'Recommended stack (fits your .NET experience)') + '</h3><ul>' +
      (英
        ? '<li>Execution engine: <b>OpenTAP 9.35+</b> — built-in MCP Server, TestStep / Instrument / ResultListener plugin model, parameter sweeps, MPL 2.0 with proprietary plugins allowed</li>' +
          '<li>Web workbench: ASP.NET Core / Blazor Server + MudBlazor, live logs over SignalR</li>' +
          '<li>Station agent: Windows service owning NI-VISA / industrial protocols, pushes events over WebSocket</li>' +
          '<li>The browser only designs and reviews; real hardware runs on the station PC</li>'
        : '<li>执行引擎：<b>OpenTAP 9.35+</b>，自带 MCP Server、TestStep / Instrument / ResultListener 插件模型、Sweep 参数扫描，MPL 2.0 且插件可闭源</li>' +
          '<li>Web 工作台：ASP.NET Core / Blazor Server + MudBlazor，实时日志走 SignalR</li>' +
          '<li>工位 Agent：Windows 服务，负责 NI-VISA / 工业协议，WebSocket 回推事件</li>' +
          '<li>浏览器只做设计与查看，真正跑设备必须在工位机</li>') +
      '</ul><h3>' + L('适配器契约', 'Adapter contract') + '</h3><pre>' + 转义(代码) + '</pre>' +
      '<h3>' + L('接真机的顺序', 'Connecting real hardware') + '</h3><ul>' +
      (英
        ? '<li>Replace SimulatedAdapter with VisaScpiAdapter; start with one supply and one multimeter</li>' +
          '<li>Keep the Planner JSON contract and Engine event protocol; change only the driver layer</li>' +
          '<li>Add permissions, a results database, timeouts/retries and reconnect recovery before multi-station rollout</li>'
        : '<li>把 SimulatedAdapter 换成 VisaScpiAdapter，先接一台电源 + 一台万用表</li>' +
          '<li>保留 Planner 的 JSON 契约与 Engine 的事件协议，只改驱动层</li>' +
          '<li>补齐用户权限、结果数据库、超时重试与断连恢复，再上多工位</li>') +
      '</ul>';
  }

  /* ---------- 运行 ---------- */

  async function 运行() {
    if (!状态.工作流 || 状态.运行中) return;
    var 错误 = P.校验(状态.工作流);
    if (错误.length) {
      var 消息 = T(错误[0]);
      设置状态(L('校验失败：', 'Validation failed: ') + 消息,
        L('校验失败：', 'Validation failed: ') + 消息, 'error');
      return;
    }

    状态.运行中 = true;
    $('运行按钮').disabled = true;
    $('停止按钮').disabled = false;
    $('生成按钮').disabled = true;
    $('复跑按钮').disabled = true;
    应用进度(0, 状态.等待文本);
    设置徽章('运行中', 'Running', '');
    切换Tab('日志');
    清空日志('开始执行 · ' + 状态.工作流.名称 + ' · ' + 状态.工作流.修订号);
    设置状态('执行中', 'Running', 'busy');

    var 记录 = await E.运行(状态.工作流, function (e) {
      追加日志(e);
      if (e.类型 === '汇总' && e.数据 && e.数据.进度) {
        应用进度(Math.round(e.数据.进度 * 100), e.文本);
      }
    });

    状态.运行中 = false;
    $('运行按钮').disabled = false;
    $('停止按钮').disabled = true;
    $('生成按钮').disabled = false;

    if (记录.已取消) {
      设置徽章('已中止', 'Aborted', '');
      $('进度文本').textContent = L('运行被用户中止', 'Run aborted by user');
      设置状态('已中止', 'Aborted', 'error');
      return;
    }
    if (记录.结论 === 'ERROR') {
      设置徽章('ERROR', 'ERROR', 'fail');
      设置状态('执行异常', 'Run error', 'error');
      return;
    }

    状态.记录 = 记录;
    渲染结果(记录);
    加入历史(记录);
    var 完成文本 = '完成 · ' + 记录.通过点数 + '/' + 记录.总点数 + ' 点通过 · ' + 记录.耗时毫秒 + ' ms';
    应用进度(100, 完成文本);
    设置状态(L('运行完成 · ', 'Run complete · ') + 记录.结论,
      L('运行完成 · ', 'Run complete · ') + 记录.结论,
      记录.结论 === 'FAIL' ? 'error' : '');
  }

  function 渲染空结果() {
    $('结果表格').querySelector('tbody').innerHTML =
      '<tr><td colspan="8" class="empty">' + 转义(L('尚无运行数据', 'No run data yet')) + '</td></tr>';
    $('最差汇总').textContent = L('等待实测数据', 'Awaiting measurement data');
    $('波形容器').innerHTML = '';
    $('波形容器').className = 'chart-empty';
    $('波形容器').textContent = L('捕获波形将在这里显示', 'The captured waveform appears here');
    $('结果说明').textContent = L('运行后，报告由实测数据自动生成',
      'Reports are generated from measured data after each run');
    ['导出CSV', '导出MD', '打印报告', '复跑按钮'].forEach(function (id) { $(id).disabled = true; });
  }

  function 渲染结果(记录) {
    var 通过 = 记录.结论 === 'PASS';
    设置徽章(记录.结论 + ' · ' + 记录.通过点数 + '/' + 记录.总点数,
      记录.结论 + ' · ' + 记录.通过点数 + '/' + 记录.总点数, 通过 ? 'pass' : 'fail');

    var html = 记录.点位.map(function (p) {
      return '<tr><td>' + p.点位 + '</td><td>' + p.设定电压 + ' V</td><td>' + p.实测电压 + ' V</td>' +
        '<td>' + p.过冲 + ' mV</td><td>' + p.下跌 + ' mV</td><td>' + p.纹波 + ' mV</td>' +
        '<td>' + p.稳定时间 + ' ms</td><td class="' + (p.结论 === 'PASS' ? 'pass' : 'fail') + '">' + p.结论 + '</td></tr>';
    }).join('');
    html += '<tr class="worst"><td>' + 转义(L('最差', 'Worst')) + '</td><td>—</td><td>—</td><td>' +
      记录.最差.过冲 + ' mV</td><td>' + 记录.最差.下跌 + ' mV</td><td>' + 记录.最差.纹波 + ' mV</td>' +
      '<td>' + 记录.最差.稳定时间 + ' ms</td><td>' + 记录.结论 + '</td></tr>';
    html += '<tr class="limit"><td>' + 转义(L('限值', 'Limit')) + '</td><td>—</td><td>—</td><td>&lt; ' +
      记录.限值.过冲上限 + ' mV</td><td>&lt; ' + 记录.限值.下跌上限 + ' mV</td><td>&lt; ' +
      记录.限值.纹波上限 + ' mV</td><td>&lt; ' + 记录.限值.稳定时间上限 + ' ms</td><td>' +
      转义(L('用户输入', 'User input')) + '</td></tr>';
    $('结果表格').querySelector('tbody').innerHTML = html;

    $('最差汇总').textContent = L('最差过冲 ', 'Worst overshoot ') + 记录.最差.过冲 +
      L(' mV / 限值 < ', ' mV / limit < ') + 记录.限值.过冲上限 +
      L(' mV · 纹波 ', ' mV · ripple ') + 记录.最差.纹波 +
      L(' mV · 稳定 ', ' mV · settling ') + 记录.最差.稳定时间 + ' ms';
    $('波形容器').innerHTML = R.波形SVG(记录, 560, 148);
    $('波形容器').className = '';
    $('结果说明').textContent = L('报告由运行记录 ', 'Report rendered from run ') + 记录.编号 +
      L(' 渲染 · 无模型生成的数值', ' · no model-generated values');
    ['导出CSV', '导出MD', '打印报告', '复跑按钮'].forEach(function (id) { $(id).disabled = false; });
  }

  /* ---------- 历史与导出 ---------- */

  function 保存历史() {
    try { localStorage.setItem('testflow.history', JSON.stringify(状态.历史)); } catch (e) { /* 隐私模式下忽略 */ }
  }
  function 读取历史() {
    try {
      var raw = localStorage.getItem('testflow.history');
      if (raw) 状态.历史 = JSON.parse(raw) || [];
    } catch (e) { 状态.历史 = []; }
  }
  function 渲染历史() {
    $('历史计数').textContent = 状态.历史.length;
    if (!状态.历史.length) {
      $('历史列表').innerHTML = '<div class="history-empty">' + 转义(L(
        '还没有运行记录。运行一次后，工作流版本与结论会留在这里，可随时载入复跑。',
        'No runs yet. After a run, the workflow revision and verdict are kept here for reruns.')) + '</div>';
      return;
    }
    $('历史列表').innerHTML = 状态.历史.map(function (h, i) {
      return '<div class="history-item" data-history="' + i + '">' +
        '<div class="r1"><span class="nm">' + 转义(T(h.名称)) + '</span>' +
        '<span class="history-verdict ' + (h.结论 === 'PASS' ? 'pass' : 'fail') + '">' + 转义(h.结论) + '</span></div>' +
        '<div class="history-meta">' + 转义(h.修订号) + ' · ' + 转义(h.点数) +
        L(' 点 · ', ' points · ') + 转义(h.记录编号) + '</div>' +
        '<div class="history-meta">' + 转义(h.时间) + ' · ' +
        转义(L('点击载入该版本', 'Click to load this revision')) + '</div></div>';
    }).join('');
  }
  function 加入历史(记录) {
    状态.历史.unshift({
      名称: 记录.工作流名称,
      修订号: 记录.修订号,
      结论: 记录.结论,
      点数: 记录.通过点数 + '/' + 记录.总点数,
      记录编号: 记录.编号,
      时间: new Date().toLocaleString(I.是英文() ? 'en-US' : 'zh-CN', { hour12: false }),
      工作流: JSON.parse(JSON.stringify(状态.工作流))
    });
    if (状态.历史.length > 12) 状态.历史.length = 12;
    保存历史();
    渲染历史();
  }
  function 下载(文件名, 内容, 类型) {
    var blob = new Blob([内容], { type: 类型 });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 文件名;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 120);
  }

  /* ---------- 语言 / 主题切换后的全量重绘 ---------- */

  function 渲染全部() {
    渲染顶栏();
    渲染示例();
    渲染设备();
    渲染驱动();
    渲染历史();
    渲染架构();
    渲染工作流();
    重绘日志();
    if (状态.记录) {
      渲染结果(状态.记录);
      应用进度(状态.进度值, 状态.进度文本);
    } else {
      渲染空结果();
      应用进度(状态.运行中 ? 状态.进度值 : 0, 状态.运行中 ? 状态.进度文本 : 状态.等待文本);
    }
    应用状态();
  }

  /* ---------- 事件绑定 ---------- */

  function 绑定事件() {
    $('示例按钮组').addEventListener('click', function (e) {
      var chip = e.target.closest('[data-example]');
      if (!chip) return;
      $('意图输入').value = 当前示例()[parseInt(chip.getAttribute('data-example'), 10)];
    });
    $('语言切换').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]');
      if (b) I.设置语言(b.getAttribute('data-lang'));
    });
    $('主题按钮').addEventListener('click', function () { I.切换主题(); });

    $('生成按钮').addEventListener('click', 生成工作流);
    $('添加步骤按钮').addEventListener('click', 显示添加表单);
    $('画布').addEventListener('click', 画布点击);
    $('运行按钮').addEventListener('click', 运行);
    $('复跑按钮').addEventListener('click', 运行);
    $('停止按钮').addEventListener('click', function () {
      E.停止();
      设置状态('正在中止', 'Aborting', 'busy');
    });
    $('Tab按钮组').addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      if (tab) 切换Tab(tab.getAttribute('data-tab'));
    });
    $('帮助按钮').addEventListener('click', function () { 切换Tab('架构'); });
    $('设备列表').addEventListener('click', function (e) {
      var card = e.target.closest('.device-card');
      if (card) card.classList.toggle('expanded');
    });
    $('历史列表').addEventListener('click', function (e) {
      var item = e.target.closest('[data-history]');
      if (!item) return;
      var h = 状态.历史[parseInt(item.getAttribute('data-history'), 10)];
      if (!h || !h.工作流) return;
      状态.工作流 = JSON.parse(JSON.stringify(h.工作流));
      状态.记录 = null;
      渲染工作流();
      渲染空结果();
      应用进度(0, 状态.等待文本);
      设置徽章('未运行', 'Not run', '');
      清空日志('已载入 ' + h.修订号 + '，点运行即可复跑');
      切换Tab('日志');
      设置状态(L('已载入 ', 'Loaded ') + h.修订号 + L('，点运行即可复跑', ', click Run to rerun'),
        'Loaded ' + h.修订号 + ', click Run to rerun', '');
    });
    $('导出CSV').addEventListener('click', function () {
      if (!状态.记录) return;
      下载('testflow_' + 状态.记录.编号 + '.csv', R.生成CSV(状态.记录), 'text/csv;charset=utf-8');
    });
    $('导出MD').addEventListener('click', function () {
      if (!状态.记录) return;
      下载('testflow_report_' + 状态.记录.编号 + '.md', R.生成Markdown(状态.记录), 'text/markdown;charset=utf-8');
    });
    $('打印报告').addEventListener('click', function () { window.print(); });
  }

  function 初始化() {
    I.初始化();
    I.应用静态();
    I.注册重绘(渲染全部);
    绑定事件();
    读取历史();
    生成工作流();
    设置状态('就绪 · 模拟仪器已连接', 'Ready · simulated instruments connected', '');
    渲染全部();
  }

  初始化();
})();
