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
 * 报告层
 * ------------------------------------------------------------
 * 所有数字只从「运行记录」读取，报告模板由代码填充。
 * 模型可以写目的、设置说明、偏差备注，但绝不作为任何测量值或结论的来源。
 * 导出文本与波形配色会跟随当前界面语言和主题。
 */
(function (global) {
  'use strict';
  var FlowLab = global.FlowLab = global.FlowLab || {};

  function T(s) {
    var 文本 = String(s == null ? '' : s);
    if (global.FlowLab && global.FlowLab.I18n) return global.FlowLab.I18n.tr(文本);
    return 文本;
  }

  function 生成CSV(记录) {
    if (!记录 || !记录.点位) return '';
    var 行 = [[
      '点位', '设定电压(V)', '实测电压(V)', '过冲(mV)', '下跌(mV)',
      '纹波(mV)', '稳定时间(ms)', '结论'
    ]];
    记录.点位.forEach(function (p) {
      行.push([
        p.点位, p.设定电压, p.实测电压, p.过冲, p.下跌,
        p.纹波, p.稳定时间, p.结论
      ]);
    });
    if (记录.最差) {
      行.push(['最差', '', '', 记录.最差.过冲, 记录.最差.下跌, 记录.最差.纹波, 记录.最差.稳定时间, 记录.结论]);
    }
    var 输出 = 行.map(function (r) { return r.join(','); }).join('\r\n');
    return '\uFEFF' + T(输出);
  }

  function 生成Markdown(记录) {
    if (!记录 || !记录.点位) return '';
    var L = [];
    L.push('# ' + 记录.工作流名称 + ' · 测试报告');
    L.push('');
    L.push('- 运行编号：' + 记录.编号);
    L.push('- 工作流版本：' + 记录.修订号);
    L.push('- 结论：**' + 记录.结论 + '**（' + 记录.通过点数 + '/' + 记录.总点数 + ' 点通过）');
    L.push('- 开始时间：' + 记录.开始时间);
    L.push('- 限值来源：用户输入（发布后锁定，AI 不可修改）');
    L.push('');
    L.push('## 测量结果');
    L.push('');
    L.push('| 点位 | 设定电压 | 实测电压 | 过冲 | 下跌 | 纹波 | 稳定时间 | 结论 |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    记录.点位.forEach(function (p) {
      L.push('| ' + p.点位 + ' | ' + p.设定电压 + ' V | ' + p.实测电压 + ' V | ' +
        p.过冲 + ' mV | ' + p.下跌 + ' mV | ' + p.纹波 + ' mV | ' +
        p.稳定时间 + ' ms | ' + p.结论 + ' |');
    });
    L.push('');
    L.push('## 最差值与限值');
    L.push('');
    L.push('| 指标 | 实测最差 | 限值 | 判定 |');
    L.push('| --- | --- | --- | --- |');
    var 限 = 记录.限值 || {};
    L.push('| 过冲 | ' + 记录.最差.过冲 + ' mV | < ' + 限.过冲上限 + ' mV | ' +
      (记录.最差.过冲 < 限.过冲上限 ? 'PASS' : 'FAIL') + ' |');
    L.push('| 下跌 | ' + 记录.最差.下跌 + ' mV | < ' + 限.下跌上限 + ' mV | ' +
      (记录.最差.下跌 < 限.下跌上限 ? 'PASS' : 'FAIL') + ' |');
    L.push('| 纹波 | ' + 记录.最差.纹波 + ' mV | < ' + 限.纹波上限 + ' mV | ' +
      (记录.最差.纹波 < 限.纹波上限 ? 'PASS' : 'FAIL') + ' |');
    L.push('| 稳定时间 | ' + 记录.最差.稳定时间 + ' ms | < ' + 限.稳定时间上限 + ' ms | ' +
      (记录.最差.稳定时间 < 限.稳定时间上限 ? 'PASS' : 'FAIL') + ' |');
    L.push('');
    L.push('> 本报告全部数值由运行记录 ' + 记录.编号 + ' 渲染生成，未经过语言模型。');
    return T(L.join('\r\n'));
  }

  // 用最后一个点位的实测波形绘制 SVG（纯数据驱动，不含任何模型生成内容）
  function 波形SVG(记录, 宽, 高) {
    var W = 宽 || 560, H = 高 || 168;
    var 左 = 38, 右 = 12, 上 = 14, 下 = 24;
    var 绘图宽 = W - 左 - 右, 绘图高 = H - 上 - 下;
    var 点 = (记录 && 记录.点位 && 记录.点位.length) ? 记录.点位[记录.点位.length - 1] : null;
    var 数据 = 点 && 点.波形 && 点.波形.length ? 点.波形 : [];
    var 设定 = 点 ? 点.设定电压 : 20;
    var 上限 = 点 ? 点.过冲 : 151;

    var 浅色 = global.FlowLab && global.FlowLab.I18n && global.FlowLab.I18n.主题() === 'light';
    var 色 = 浅色
      ? { 底: '#ffffff', 格: '#dde3ec', 字: '#8792a1', 线: '#0f8a5f', 限: '#c0392b' }
      : { 底: '#11151c', 格: '#2a303b', 字: '#7f8a9c', 线: '#3ddc97', 限: '#e2705f' };

    var 网格 = [];
    for (var g = 0; g <= 4; g++) {
      var gy = 上 + 绘图高 * g / 4;
      网格.push('<line x1="' + 左 + '" y1="' + gy + '" x2="' + (W - 右) + '" y2="' + gy +
        '" stroke="' + 色.格 + '" stroke-width="0.5"/>');
    }
    for (var h = 0; h <= 8; h++) {
      var gx = 左 + 绘图宽 * h / 8;
      网格.push('<line x1="' + gx + '" y1="' + 上 + '" x2="' + gx + '" y2="' + (上 + 绘图高) +
        '" stroke="' + 色.格 + '" stroke-width="0.5"/>');
    }

    var 坐标 = function (v, i, n) {
      var x = 左 + 绘图宽 * (i / Math.max(n - 1, 1));
      var y = 上 + 绘图高 * (1 - (v / 1.35));
      return [x, y];
    };

    var 折线 = '';
    if (数据.length) {
      var pts = 数据.map(function (v, i) {
        var c = 坐标(v, i, 数据.length);
        return c[0].toFixed(1) + ',' + c[1].toFixed(1);
      });
      折线 = '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + 色.线 +
        '" stroke-width="1.8" stroke-linejoin="round"/>';
    }

    var 限值y = 坐标(1 + (Number(上限) / 1000) / Math.max(设定, 1), 0, 2)[1];
    var 限值线 = '<line x1="' + 左 + '" y1="' + 限值y.toFixed(1) + '" x2="' + (W - 右) +
      '" y2="' + 限值y.toFixed(1) + '" stroke="' + 色.限 + '" stroke-width="0.8" stroke-dasharray="4 4"/>' +
      '<text x="' + (W - 右 - 4) + '" y="' + (限值y - 5).toFixed(1) +
      '" fill="' + 色.限 + '" font-size="10" text-anchor="end">' +
      T('过冲实测') + ' ' + 上限 + ' mV</text>';

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img">' +
      '<rect x="' + 左 + '" y="' + 上 + '" width="' + 绘图宽 + '" height="' + 绘图高 +
      '" fill="' + 色.底 + '" stroke="' + 色.格 + '" stroke-width="0.5"/>' +
      网格.join('') + 折线 + 限值线 +
      '<text x="6" y="' + (上 + 10) + '" fill="' + 色.字 + '" font-size="10">CH1</text>' +
      '<text x="' + 左 + '" y="' + (H - 7) + '" fill="' + 色.字 + '" font-size="10">1 ms/div · trig CH1 ↗ 2.5 V</text>' +
      '<text x="' + (W - 右) + '" y="' + (H - 7) + '" fill="' + 色.字 + '" font-size="10" text-anchor="end">' +
      设定 + ' V level · ' + (点 ? 点.实测电压 : '') + ' V mean</text>' +
      '</svg>';
  }

  FlowLab.Report = { 生成CSV: 生成CSV, 生成Markdown: 生成Markdown, 波形SVG: 波形SVG };
})(window);
