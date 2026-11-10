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
 * 可插拔驱动层
 * ------------------------------------------------------------
 * 设计要点：AI 只允许引用「能力名」，协议命令字符串一律来自这里的能力定义文件。
 * 这是硬件测试平台最重要的安全边界：模型不能自由生成 SCPI / Modbus 命令。
 * 后续接真机时，只需把「模拟」类设备的 execute 换成 NI-VISA / Modbus / HTTP 适配器，
 * 上层工作流、执行引擎、报告层完全不用改。
 */
(function (global) {
  'use strict';
  var FlowLab = global.FlowLab = global.FlowLab || {};

  // 能力定义（命令白名单）。{xxx} 由工作流参数填充，执行前可完整预览。
  var 能力库 = {
    reset: { 名称: '复位与清错', 命令: '*RST; *CLS', 参数: [] },
    set_current_limit: { 名称: '设置限流与过压保护', 命令: 'CURR {限流},(@2); VOLT:PROT {过压}', 参数: ['限流', '过压'] },
    set_voltage: { 名称: '设置电压', 命令: 'VOLT {电压},(@2)', 参数: ['电压'] },
    output_on: { 名称: '打开输出', 命令: 'OUTP ON,(@2)', 参数: [] },
    output_off: { 名称: '关闭输出', 命令: 'OUTP OFF,(@2)', 参数: [] },
    query_error: { 名称: '查询系统错误', 命令: 'SYST:ERR?', 参数: [] },
    set_timebase: { 名称: '设置时基', 命令: 'HORizontal:SCAle {时基}', 参数: ['时基'] },
    measure_overshoot: { 名称: '测量过冲 / 下跌 / 纹波 / 稳定时间', 命令: 'MEAS1:RESUlts:CURRentacq:{通道}?', 参数: ['通道'] },
    set_load_current: { 名称: '设置负载电流', 命令: 'CURR:STAT:L1 {电流}', 参数: ['电流'] },
    load_on: { 名称: '负载导通', 命令: 'LOAD ON', 参数: [] },
    load_off: { 名称: '负载关闭', 命令: 'LOAD OFF', 参数: [] },
    measure_voltage: { 名称: '测量直流电压', 命令: 'MEAS:VOLT:DC?', 参数: [] },
    read_holding_register: { 名称: '读保持寄存器', 命令: 'Modbus FC03 · addr={地址}', 参数: ['地址'] },
    write_coil: { 名称: '写线圈', 命令: 'Modbus FC05 · addr={地址} value={值}', 参数: ['地址', '值'] },
    http_get: { 名称: '发起 HTTP 请求', 命令: 'GET {路径}', 参数: ['路径'] }
  };

  // 测试台设备清单。状态为「占位」的驱动只登记接口，不会真的执行。
  var 设备列表 = [
    {
      id: 'psu-01', 名称: '程控电源', 厂商: 'Keysight', 型号: 'E36312A',
      地址: 'TCPIP0::10.0.0.21::inst0::INSTR', 类别: 'VISA / SCPI', 状态: '在线', 实现: '模拟仪器',
      能力: ['reset', 'set_current_limit', 'set_voltage', 'output_on', 'output_off', 'query_error'],
      说明: 'CH2 输出，先设保护再上电'
    },
    {
      id: 'scope-01', 名称: '示波器', 厂商: 'Tektronix', 型号: 'MSO68B',
      地址: 'TCPIP0::10.0.0.22::inst0::INSTR', 类别: 'VISA / SCPI', 状态: '在线', 实现: '模拟仪器',
      能力: ['set_timebase', 'measure_overshoot'],
      说明: 'CH1 捕获负载瞬态波形'
    },
    {
      id: 'load-01', 名称: '电子负载', 厂商: 'Chroma', 型号: '63004-150-60',
      地址: 'TCPIP0::10.0.0.23::inst0::INSTR', 类别: 'VISA / SCPI', 状态: '在线', 实现: '模拟仪器',
      能力: ['set_load_current', 'load_on', 'load_off'],
      说明: '2.5 A 阶跃负载'
    },
    {
      id: 'dmm-01', 名称: '数字万用表', 厂商: 'Keysight', 型号: '34465A',
      地址: 'USB0::0x2A8D::0x0101::MY5::INSTR', 类别: 'VISA / SCPI', 状态: '在线', 实现: '模拟仪器',
      能力: ['measure_voltage'],
      说明: '回读输出电压实测值'
    },
    {
      id: 'plc-01', 名称: '产线 PLC 节点', 厂商: '通用', 型号: 'Modbus TCP',
      地址: '192.168.1.50:502', 类别: '工业协议', 状态: '占位', 实现: '待接入',
      能力: ['read_holding_register', 'write_coil'],
      说明: '换上 Modbus/OPC UA 适配器即可驱动真实设备'
    },
    {
      id: 'api-01', 名称: '被测 Web 服务', 厂商: '通用', 型号: 'HTTP / REST',
      地址: 'http://127.0.0.1:8080', 类别: '软件接口', 状态: '占位', 实现: '待接入',
      能力: ['http_get'],
      说明: '换上 Playwright / HttpClient 适配器即可测软件'
    }
  ];

  function 列出() {
    return 设备列表.map(function (d) { return Object.assign({}, d); });
  }

  function 取(id) {
    for (var i = 0; i < 设备列表.length; i++) {
      if (设备列表[i].id === id) return 设备列表[i];
    }
    return null;
  }

  function 能力(键) {
    return 能力库[键] || null;
  }

  // 命令只从能力定义的模板生成，不从工作流或模型输出里读取命令字符串
  function 命令(设备id, 能力键, 参数) {
    var 定义 = 能力库[能力键];
    if (!定义) return '（未登记的能力，已阻止执行）';
    var 文本 = 定义.命令;
    var p = 参数 || {};
    Object.keys(p).forEach(function (k) {
      文本 = 文本.split('{' + k + '}').join(String(p[k]));
    });
    return 文本.replace(/\{[^}]+\}/g, '');
  }

  function 睡眠(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // 生成一条带过冲与振铃衰减的阶跃响应曲线（确定性，复跑结果一致）
  function 生成波形(设定电压, 过冲mV) {
    var 点 = [];
    var 幅度 = (过冲mV / 1000) / Math.max(设定电压, 1);
    for (var n = 0; n < 96; n++) {
      var t = n / 95;
      var y;
      if (t < 0.16) {
        y = 0.04 + 0.006 * Math.sin(t * 40);
      } else {
        var x = (t - 0.16) / 0.84;
        y = 1 + 幅度 * 2.6 * Math.exp(-x * 5.5) * Math.sin(x * 10.5 + 0.9)
              + 0.008 * Math.sin(x * 55);
        y -= Math.exp(-x * 26) * 0.35;
      }
      点.push(+y.toFixed(4));
    }
    return 点;
  }

  // 模拟仪器读数。真实接入时，这里替换为 VISA / Modbus / HTTP 调用。
  async function 执行(设备id, 能力键, 参数, 上下文) {
    var 设备 = 取(设备id);
    if (!设备) throw new Error('找不到设备：' + 设备id);
    if (设备.状态 !== '在线') throw new Error(设备.名称 + ' 的驱动尚未接入真实设备（占位）');

    await 睡眠(38);

    var v = Number(上下文 && 上下文.扫描电压) || 5;
    var i = Number(上下文 && 上下文.序号) || 1;
    var t = (v - 5) / 15;

    switch (能力键) {
      case 'measure_overshoot': {
        var 过冲 = Math.round(138 + t * 13);
        var 下跌 = Math.round(121 + t * 17);
        var 纹波 = Math.round(34 + t * 4);
        var 稳定时间 = +(1.6 + t * 0.2).toFixed(1);
        return {
          过冲: 过冲, 下跌: 下跌, 纹波: 纹波, 稳定时间: 稳定时间,
          波形: 生成波形(v, 过冲), 通道: (参数 && 参数.通道) || 'CH1'
        };
      }
      case 'measure_voltage':
        return { 电压: +(v + 0.01 + (i % 3) * 0.005).toFixed(3) };
      default:
        return { 确认: true };
    }
  }

  FlowLab.Drivers = {
    能力库: 能力库,
    设备列表: 设备列表,
    列出: 列出,
    取: 取,
    能力: 能力,
    命令: 命令,
    执行: 执行
  };
})(window);
