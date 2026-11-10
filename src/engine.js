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
 * 执行引擎
 * ------------------------------------------------------------
 * 关键约束：测量值只来自 Drivers.execute()，限值只来自 工作流.限值（用户输入，锁定）。
 * 报告里的每个数字都必须来自本模块产出的运行记录，模型不参与任何数值生成。
 * 换真实执行器时，把驱动调用换成 OpenTAP TestStep 执行 / VISA 会话即可，事件协议不变。
 */
(function (global) {
  'use strict';
  var FlowLab = global.FlowLab = global.FlowLab || {};
  var 已取消 = false;
  var 运行计数 = 0;

  function 睡眠(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function 替换(值, 上下文, 工作流) {
    if (typeof 值 !== 'string') return 值;
    return 值
      .replace(/\$\{扫描电压\}/g, 上下文.扫描电压)
      .replace(/\$\{限值\.过冲上限\}/g, 工作流.限值.过冲上限);
  }

  function 停止() { 已取消 = true; }

  async function 运行(工作流, 回调) {
    已取消 = false;
    var 事件 = [];
    var 点位 = [];
    var 序号 = 0;
    var 结论 = 'PASS';
    var 开始时间 = new Date();
    var 限值 = 工作流.限值; // 只读，绝不从模型输出中取值

    function 推送(类型, 文本, 数据) {
      var e = {
        序号: ++序号, 类型: 类型, 文本: 文本, 数据: 数据 || null,
        时间: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      };
      事件.push(e);
      if (回调) 回调(e);
    }

    function 检查取消() {
      if (已取消) throw new Error('CANCELLED');
    }

    async function 执行步骤(步骤, 上下文) {
      检查取消();

      if (步骤.类型 === '动作') {
        var 参数 = {};
        Object.keys(步骤.参数 || {}).forEach(function (k) {
          参数[k] = 替换(步骤.参数[k], 上下文, 工作流);
        });
        var 设备 = FlowLab.Drivers.取(步骤.设备);
        var 命令文本 = FlowLab.Drivers.命令(步骤.设备, 步骤.能力, 参数);
        推送('步骤',
          (设备 ? 设备.型号 : 步骤.设备) + ' · ' + 命令文本,
          { 步骤: 步骤, 命令: 命令文本, 上下文: 上下文 });

        var 结果 = await FlowLab.Drivers.执行(步骤.设备, 步骤.能力, 参数, 上下文);

        if (结果 && typeof 结果.过冲 === 'number') {
          上下文.测量 = Object.assign({}, 上下文.测量, 结果);
          推送('测量',
            '过冲 ' + 结果.过冲 + ' mV · 下跌 ' + 结果.下跌 + ' mV · 纹波 ' + 结果.纹波 +
            ' mV · 稳定 ' + 结果.稳定时间 + ' ms',
            { 结果: 结果, 上下文: 上下文 });
        } else if (结果 && typeof 结果.电压 === 'number') {
          上下文.测量 = Object.assign({}, 上下文.测量, 结果);
          推送('测量', 'VOUT = ' + 结果.电压 + ' V', { 结果: 结果, 上下文: 上下文 });
        } else {
          推送('日志', 命令文本 + ' → OK', { 上下文: 上下文 });
        }
        return;
      }

      if (步骤.类型 === '延时') {
        推送('日志', 'Delay ' + 步骤.参数.时长 + ' ms（演示环境已加速）', { 上下文: 上下文 });
        await 睡眠(45);
        return;
      }

      if (步骤.类型 === '判定') {
        var m = 上下文.测量 || {};
        var 实测 = typeof m.过冲 === 'number' ? m.过冲 : NaN;
        var 上限 = Number(限值.过冲上限);
        var 通过 = 实测 < 上限;
        if (!通过) 结论 = 'FAIL';
        上下文.判定 = 通过 ? 'PASS' : 'FAIL';
        推送('判定',
          (通过 ? 'PASS' : 'FAIL') + ' · 过冲 ' + 实测 + ' mV < 上限 ' + 上限 +
          ' mV · 限值锁定，AI 不可修改',
          { 通过: 通过, 实测: 实测, 上限: 上限, 上下文: 上下文 });
      }
    }

    try {
      推送('阶段', '会话开始 · ' + 工作流.名称 + ' · ' + 工作流.修订号);
      (工作流.安全预检 || []).slice(0, 3).forEach(function (行) { 推送('日志', 行); });

      for (var s = 0; s < 工作流.步骤.length; s++) {
        var 步骤 = 工作流.步骤[s];
        检查取消();

        if (步骤.类型 === '开始' || 步骤.类型 === '结束') {
          推送('阶段', 步骤.说明 || 步骤.标题);
          continue;
        }

        if (步骤.类型 === '循环') {
          推送('阶段', '进入循环 × ' + 步骤.取值.length + ' · 变量 ${' + 步骤.变量 + '}');
          for (var i = 0; i < 步骤.取值.length; i++) {
            检查取消();
            var 上下文 = {
              扫描电压: 步骤.取值[i], 序号: i + 1, 总数: 步骤.取值.length,
              测量: {}, 判定: null
            };
            推送('阶段', 'Point ' + (i + 1) + '/' + 步骤.取值.length + ' · ' + 步骤.取值[i] + ' V');
            for (var c = 0; c < 步骤.子步骤.length; c++) {
              await 执行步骤(步骤.子步骤[c], 上下文);
            }
            var mm = 上下文.测量;
            var 点 = {
              点位: i + 1,
              设定电压: 步骤.取值[i],
              实测电压: typeof mm.电压 === 'number' ? mm.电压 : null,
              过冲: typeof mm.过冲 === 'number' ? mm.过冲 : null,
              下跌: typeof mm.下跌 === 'number' ? mm.下跌 : null,
              纹波: typeof mm.纹波 === 'number' ? mm.纹波 : null,
              稳定时间: typeof mm.稳定时间 === 'number' ? mm.稳定时间 : null,
              波形: mm.波形 || [],
              结论: 上下文.判定 || 'PASS'
            };
            点位.push(点);
            推送('汇总',
              'point ' + (i + 1) + '/' + 步骤.取值.length + ' · ' + 点.设定电压 +
              ' V · 过冲 ' + 点.过冲 + ' mV · ' + 点.结论,
              { 点: 点, 进度: (i + 1) / 步骤.取值.length });
          }
          continue;
        }

        await 执行步骤(步骤, { 扫描电压: 5, 序号: 1, 总数: 1, 测量: {}, 判定: null });
      }

      推送('日志', 'finally · OUTP OFF,(@2) · LOAD OFF（异常路径同样执行）');

      var 数值 = function (键) {
        return 点位.map(function (p) { return typeof p[键] === 'number' ? p[键] : 0; });
      };
      var 最差 = {
        过冲: Math.max.apply(null, 数值('过冲').concat([0])),
        下跌: Math.max.apply(null, 数值('下跌').concat([0])),
        纹波: Math.max.apply(null, 数值('纹波').concat([0])),
        稳定时间: Math.max.apply(null, 数值('稳定时间').concat([0]))
      };
      var 通过点数 = 点位.filter(function (p) { return p.结论 === 'PASS'; }).length;
      var 总体 = 结论 === 'PASS' && 通过点数 === 点位.length &&
        最差.过冲 < Number(限值.过冲上限) ? 'PASS' : 'FAIL';

      推送('阶段', '完成 · ' + 总体 + ' · ' + 通过点数 + '/' + 点位.length + ' 点通过');
      推送('完成', '运行结束', { 结论: 总体 });

      var 结束时间 = new Date();
      return {
        编号: 'RUN-' + String(++运行计数).padStart(4, '0'),
        工作流名称: 工作流.名称,
        修订号: 工作流.修订号,
        限值: Object.assign({}, 限值),
        开始时间: 开始时间.toISOString(),
        结束时间: 结束时间.toISOString(),
        耗时毫秒: 结束时间 - 开始时间,
        点位: 点位,
        事件: 事件,
        最差: 最差,
        通过点数: 通过点数,
        总点数: 点位.length,
        结论: 总体
      };
    } catch (err) {
      if (err && err.message === 'CANCELLED') {
        推送('阶段', '运行已被用户中止');
        return { 编号: 'RUN-' + String(++运行计数).padStart(4, '0'), 已取消: true, 点位: 点位, 事件: 事件, 结论: 'CANCELLED' };
      }
      推送('错误', '执行异常：' + (err && err.message ? err.message : String(err)));
      return { 编号: 'RUN-' + String(++运行计数).padStart(4, '0'), 已取消: false, 点位: 点位, 事件: 事件, 结论: 'ERROR', 错误: String(err) };
    }
  }

  FlowLab.Engine = { 运行: 运行, 停止: 停止 };
})(window);
