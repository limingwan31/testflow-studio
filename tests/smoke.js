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
'use strict';

// 零依赖端到端冒烟测试：用极简 DOM 桩加载真实模块，验证闭环与双语/双主题。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const modules = ['i18n', 'drivers', 'planner', 'engine', 'report', 'app'];
let passed = 0;

function check(label, fn) {
  fn();
  passed++;
  console.log('PASS  ' + label);
}

function El(id, text) {
  const attrs = {};
  return {
    id,
    innerHTML: '',
    textContent: text || '',
    value: '',
    className: '',
    disabled: false,
    scrollTop: 0,
    scrollHeight: 100,
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    querySelector() { if (!this._q) this._q = El('child'); return this._q; },
    querySelectorAll() { return []; },
    appendChild(child) { this.innerHTML += child.innerHTML; },
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k] === undefined ? null : attrs[k]; },
    closest() { return null; }
  };
}

function buildContext() {
  const staticNodes = [
    El('s1', '测试台设备'),
    El('s2', '生成工作流'),
    El('s3', '运行')
  ];
  const els = {};
  const docAttrs = {};
  const store = {};
  const document = {
    title: '',
    documentElement: {
      setAttribute(k, v) { docAttrs[k] = v; },
      getAttribute(k) { return docAttrs[k] || null; }
    },
    getElementById(id) { if (!els[id]) els[id] = El(id); return els[id]; },
    querySelectorAll(selector) { return selector === '[data-i18n]' ? staticNodes : []; },
    createElement() { return El('created'); },
    body: { appendChild() {}, removeChild() {} }
  };
  const ctx = {
    window: { print() {} },
    document,
    console,
    setTimeout,
    Date, Math, JSON, Promise, Object, Array, String, Number,
    parseInt, parseFloat, RegExp, Error, NaN, isNaN,
    Blob: function () {},
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    localStorage: {
      getItem(k) { return store[k] === undefined ? null : store[k]; },
      setItem(k, v) { store[k] = String(v); }
    }
  };
  vm.createContext(ctx);
  for (const name of modules) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8'), ctx, {
      filename: 'src/' + name + '.js'
    });
  }
  return { F: ctx.window.FlowLab, els, docAttrs, staticNodes, store };
}

async function main() {
  const { F, els, docAttrs, staticNodes, store } = buildContext();

  check('模块全部挂载到 FlowLab 命名空间', () => {
    for (const key of ['I18n', 'Drivers', 'Planner', 'Engine', 'Report']) {
      assert.ok(F[key], 'missing ' + key);
    }
  });

  check('默认中文 + 深色主题已应用', () => {
    assert.strictEqual(docAttrs['data-theme'], 'dark');
    assert.strictEqual(docAttrs.lang, 'zh-CN');
    assert.strictEqual(staticNodes[0].textContent, '测试台设备');
    assert.ok(els['画布'].innerHTML.includes('设置电压'));
    assert.ok(els['限值标签'].textContent.includes('限值锁定'));
  });

  check('中文意图解析为 4 点扫描 / 200 mV 限值', () => {
    const wf = F.Planner.生成('扫 5-20 V 电源，在 CH1 捕获负载瞬态，过冲限值 200 mV，2.5 A 负载');
    // vm 上下文里的数组与宿主 Array 原型不同，用值比较而非 deepStrictEqual
    assert.strictEqual(JSON.stringify(Array.from(wf.变量.扫描电压)), JSON.stringify([5, 10, 15, 20]));
    assert.strictEqual(wf.限值.过冲上限, 200);
    assert.strictEqual(wf.限值.来源, '用户输入');
  });

  const wfEn = F.Planner.生成('VI sweep from 1 to 10 V in 1 V steps at 0.5 A load, limit 150 mV');
  check('英文意图解析为 10 点 / 150 mV / 0.5 A', () => {
    assert.strictEqual(wfEn.变量.扫描电压.length, 10);
    assert.strictEqual(wfEn.变量.扫描电压[0], 1);
    assert.strictEqual(wfEn.变量.扫描电压[9], 10);
    assert.strictEqual(wfEn.限值.过冲上限, 150);
    assert.strictEqual(wfEn.步骤[1].子步骤[4].参数.电流, 0.5);
  });

  check('白名单校验拦截未登记设备与能力', () => {
    const bad = F.Planner.生成('扫 5-20 V');
    bad.步骤[1].子步骤[0].能力 = 'not_a_capability';
    bad.步骤[1].子步骤[0].设备 = 'ghost-device';
    const errors = F.Planner.校验(bad);
    assert.ok(errors.length >= 2, 'expected validation errors, got ' + JSON.stringify(errors));
  });

  const wfZh = F.Planner.生成('扫 5-20 V 电源，在 CH1 捕获负载瞬态，过冲限值 200 mV，2.5 A 负载');
  assert.strictEqual(F.Planner.校验(wfZh).length, 0);
  const zhRun = await F.Engine.运行(wfZh, function () {});
  check('中文闭环：4/4 PASS，最差过冲 151 mV，波形 96 点', () => {
    assert.strictEqual(zhRun.结论, 'PASS');
    assert.strictEqual(zhRun.总点数, 4);
    assert.strictEqual(zhRun.通过点数, 4);
    assert.strictEqual(zhRun.最差.过冲, 151);
    assert.strictEqual(zhRun.点位[3].波形.length, 96);
    assert.ok(zhRun.事件.length > 50);
  });

  check('中文报告由运行记录渲染，含中文表头', () => {
    const md = F.Report.生成Markdown(zhRun);
    const csv = F.Report.生成CSV(zhRun);
    assert.ok(md.includes('测量结果'));
    assert.ok(md.includes(zhRun.编号));
    assert.ok(csv.includes('设定电压(V)'));
  });

  F.I18n.设置语言('en');
  check('切换英文：文档属性、静态文案、画布、设备、说明页全部更新', () => {
    assert.strictEqual(docAttrs.lang, 'en');
    assert.strictEqual(store['testflow.lang'], 'en');
    assert.strictEqual(staticNodes[0].textContent, 'Bench instruments');
    assert.strictEqual(staticNodes[1].textContent, 'Generate workflow');
    assert.ok(els['画布'].innerHTML.includes('Set voltage'));
    assert.ok(els['画布'].innerHTML.includes('${sweep_voltage}'));
    assert.ok(els['限值标签'].textContent.includes('Limit locked'));
    assert.ok(els['设备列表'].innerHTML.includes('Oscilloscope'));
    assert.ok(els['护栏视图'].innerHTML.includes('Four guardrails'));
    assert.ok(els['架构视图'].innerHTML.includes('Recommended stack'));
  });

  check('已产生的日志在切换语言后重放翻译', () => {
    assert.ok(els['日志列表'].innerHTML.includes('Workflow'));
  });

  const enRun = await F.Engine.运行(wfEn, function () {});
  check('英文工作流执行：10/10 PASS', () => {
    assert.strictEqual(enRun.结论, 'PASS');
    assert.strictEqual(enRun.总点数, 10);
    assert.strictEqual(enRun.最差.过冲, 142);
  });

  check('英文报告无中文残留，CSV 表头为英文', () => {
    const md = F.Report.生成Markdown(enRun);
    const csv = F.Report.生成CSV(enRun);
    assert.ok(md.includes('Measurement results'));
    assert.ok(!md.includes('过冲'));
    assert.ok(csv.includes('Overshoot(mV)'));
  });

  F.I18n.切换主题();
  check('切换浅色：主题持久化且波形改为浅色配色', () => {
    assert.strictEqual(docAttrs['data-theme'], 'light');
    assert.strictEqual(store['testflow.theme'], 'light');
    const svg = F.Report.波形SVG(zhRun);
    assert.ok(svg.includes('#ffffff'));
    assert.ok(svg.includes('#0f8a5f'));
    assert.ok(svg.includes('Measured overshoot'));
  });

  F.I18n.设置语言('zh');
  F.I18n.设置主题('dark');
  check('切回中文 + 深色，全部还原', () => {
    assert.strictEqual(docAttrs.lang, 'zh-CN');
    assert.strictEqual(staticNodes[0].textContent, '测试台设备');
    assert.ok(F.Report.生成Markdown(zhRun).includes('测量结果'));
    assert.ok(F.Report.波形SVG(zhRun).includes('#11151c'));
    assert.ok(els['画布'].innerHTML.includes('设置电压'));
  });

  console.log('');
  console.log(passed + ' smoke checks passed.');
}

main().catch((err) => {
  console.error('');
  console.error('SMOKE TEST FAILED');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
