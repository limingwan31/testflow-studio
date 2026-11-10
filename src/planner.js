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
 * 自然语言规划器
 * ------------------------------------------------------------
 * 把一句中文或英文测试意图解析成结构化工作流 JSON。
 * 这里用确定性规则解析，接口与 LLM 完全一致：输入描述，输出工作流对象。
 * 接真实模型时只要替换 generate()，让 LLM 通过 MCP 返回同样结构的 JSON 即可，
 * 并且必须用下面的 校验() 做白名单校验后再交给执行引擎。
 */
(function (global) {
  'use strict';
  var FlowLab = global.FlowLab = global.FlowLab || {};

  function 解析(描述) {
    var 文本 = String(描述 || '');
    var 起点 = 5, 终点 = 20, 步进 = null;

    // 「5-20 V」「5 到 20 V」「from 1 to 10 V」
    var m范围 = 文本.match(/(\d+(?:\.\d+)?)\s*(?:[-~～—至到]|\bto\b|\bthrough\b)\s*(\d+(?:\.\d+)?)\s*V/i);
    if (m范围) { 起点 = parseFloat(m范围[1]); 终点 = parseFloat(m范围[2]); }
    if (终点 < 起点) { var tmp = 起点; 起点 = 终点; 终点 = tmp; }

    // 「步进 1 V」「step 1」「in 1 V steps」「in steps of 1」
    var m步进 = 文本.match(/(?:步进|步长|step\s*size|in\s+steps\s+of|steps?\s*of)\s*(\d+(?:\.\d+)?)/i);
    if (!m步进) m步进 = 文本.match(/(?:in|by)\s+(\d+(?:\.\d+)?)\s*V?\s*steps?/i);
    if (m步进) 步进 = parseFloat(m步进[1]);

    var 电压序列;
    if (步进 && 步进 > 0) {
      电压序列 = [];
      for (var v = 起点; v <= 终点 + 1e-9; v += 步进) {
        电压序列.push(+v.toFixed(2));
        if (电压序列.length >= 12) break;
      }
    } else {
      电压序列 = [起点, 起点 + (终点 - 起点) / 3, 起点 + 2 * (终点 - 起点) / 3, 终点]
        .map(function (x) { return +x.toFixed(2); });
    }

    // 「过冲限值 200 mV」「limit 150 mV」「overshoot under 180 mV」
    var m限值 = 文本.match(/(?:限值|上限|不超过|小于|过冲|overshoot\s*limit|dip\s*under|under|below|limit|max(?:imum)?|<)\s*[:：]?\s*(?:of\s*)?<?\s*(\d+(?:\.\d+)?)\s*mV/i);
    var 过冲上限 = m限值 ? parseFloat(m限值[1]) : 200;

    var m电流 = 文本.match(/(\d+(?:\.\d+)?)\s*A(?:\s*(?:负载|load|step|电流|current))?/i);
    var 负载电流 = m电流 ? parseFloat(m电流[1]) : 2.5;

    var m通道 = 文本.match(/CH\s*(\d+)/i);
    var 通道 = m通道 ? 'CH' + m通道[1] : 'CH1';

    var m时基 = 文本.match(/(\d+(?:\.\d+)?)\s*ms\s*(?:时基|timebase)?/i);
    var 时基 = m时基 ? parseFloat(m时基[1]) : 1;

    return {
      电压序列: 电压序列,
      过冲上限: 过冲上限,
      负载电流: 负载电流,
      通道: 通道,
      时基: 时基
    };
  }

  function 动作(序号, 标题, 设备, 能力键, 参数, 说明) {
    return {
      序号: 序号, 类型: '动作', 标题: 标题, 设备: 设备, 能力: 能力键,
      参数: 参数, 说明: 说明 || '', 命令来源: '驱动能力定义文件（AI 不生成命令）'
    };
  }

  function 下一修订(上一个) {
    if (!上一个 || !上一个.修订号) return 'Rev A';
    var m = /Rev\s*([A-Z])/i.exec(上一个.修订号);
    var c = m ? m[1].toUpperCase().charCodeAt(0) : 64;
    return 'Rev ' + String.fromCharCode(Math.min(90, c + 1));
  }

  var 安全预检 = [
    '*RST; *CLS                          // 会话开始先复位并清除错误队列',
    'CURR 3.0,(@2); VOLT:PROT 22        // 先设限流与过压保护，再允许上电',
    'SYST:ERR?                          // 每个配置块之后读取仪器错误队列',
    '…… 执行工作流步骤 ……',
    'finally { OUTP OFF,(@2); LOAD OFF } // 无论成功或异常，输出必须关闭'
  ];

  function 生成(描述, 上一个工作流) {
    var p = 解析(描述);
    var 子步骤 = [
      动作('1', '设置电压', 'psu-01', 'set_voltage', { 电压: '${扫描电压}' }, 'V = ${扫描电压}'),
      动作('2', '打开输出', 'psu-01', 'output_on', {}, 'OUTP ON,(@2)'),
      动作('3', '设置时基', 'scope-01', 'set_timebase', { 时基: p.时基 + 'E-3' }, p.时基 + ' ms/div'),
      { 序号: '4', 类型: '延时', 标题: '稳定等待', 参数: { 时长: 1000 }, 说明: '等待电源与负载稳定' },
      动作('5', '设置负载电流', 'load-01', 'set_load_current', { 电流: p.负载电流 }, p.负载电流 + ' A step'),
      动作('6', '负载导通', 'load-01', 'load_on', {}, 'LOAD ON'),
      动作('7', '测量瞬态参数', 'scope-01', 'measure_overshoot', { 通道: p.通道 }, '过冲 / 下跌 / 纹波 / 稳定时间'),
      动作('8', '回读输出电压', 'dmm-01', 'measure_voltage', {}, 'VOUT 实测值'),
      {
        序号: '9', 类型: '判定', 标题: '过冲限值判定',
        参数: { 指标: '过冲', 上限: '${限值.过冲上限}' },
        说明: '限值来自用户输入，发布后锁定，AI 不可放宽'
      }
    ];

    var 标题 = 'PSU 负载瞬态测试';
    if (/扫描|sweep|scan|VI/i.test(描述) && !/瞬态|transient|过冲|overshoot/i.test(描述)) 标题 = '电源 VI 扫描测试';
    if (/PLC|产线|Modbus|寄存器|production\s*line/i.test(描述)) 标题 = '产线节点巡检测试';

    return {
      名称: 标题,
      修订号: 下一修订(上一个工作流),
      描述: 描述,
      生成方式: '本地规则规划器（接口可直接替换为 LLM / OpenTAP MCP）',
      创建时间: new Date().toISOString(),
      限值: {
        过冲上限: p.过冲上限,
        下跌上限: 200,
        纹波上限: 50,
        稳定时间上限: 3,
        单位: 'mV / ms',
        来源: '用户输入',
        锁定: true
      },
      变量: { 扫描电压: p.电压序列 },
      步骤: [
        { 类型: '开始', 标题: 'Start', 说明: 'session opened' },
        {
          类型: '循环', 标题: '扫描电压', 变量: '扫描电压', 取值: p.电压序列,
          说明: 'Loop × ' + p.电压序列.length + ' · ${扫描电压}', 子步骤: 子步骤
        },
        { 类型: '结束', 标题: 'End', 说明: 'session closed' }
      ],
      安全预检: 安全预检.slice()
    };
  }

  // 交给执行引擎之前的白名单校验：设备、能力、限值来源必须合法
  function 校验(工作流) {
    var 错误 = [];
    if (!工作流 || !工作流.步骤) return ['工作流为空'];
    if (!工作流.限值 || 工作流.限值.来源 !== '用户输入') 错误.push('限值必须来自用户输入，不能由模型设定');
    function 检查(步骤) {
      if (步骤.类型 === '动作') {
        var 设备 = FlowLab.Drivers.取(步骤.设备);
        if (!设备) 错误.push('未登记设备：' + 步骤.设备);
        else if (设备.能力.indexOf(步骤.能力) < 0) 错误.push('设备 ' + 设备.型号 + ' 不支持能力 ' + 步骤.能力);
        if (!FlowLab.Drivers.能力(步骤.能力)) 错误.push('未登记能力：' + 步骤.能力);
      }
      if (步骤.子步骤) 步骤.子步骤.forEach(检查);
    }
    工作流.步骤.forEach(检查);
    return 错误;
  }

  FlowLab.Planner = { 解析: 解析, 生成: 生成, 校验: 校验, 下一修订: 下一修订 };
})(window);
