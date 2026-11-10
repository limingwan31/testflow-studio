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

// 零依赖静态校验：JS 语法、HTML 资源引用、DOM id 引用。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let failures = 0;

function fail(message) {
  console.error('FAIL  ' + message);
  failures++;
}
function ok(message) {
  console.log('OK    ' + message);
}

// 1. 所有 src 下的 JS 必须能被解析
const srcDir = path.join(root, 'src');
const jsFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
for (const name of jsFiles) {
  const file = path.join(srcDir, name);
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: 'src/' + name });
    ok('syntax  src/' + name);
  } catch (err) {
    fail('syntax  src/' + name + ' :: ' + err.message);
  }
}

// 2. index.html 引用的本地资源必须存在
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((r) => !/^(https?:|data:|#|mailto:)/.test(r));
for (const ref of refs) {
  if (fs.existsSync(path.join(root, ref))) ok('asset   ' + ref);
  else fail('asset   missing: ' + ref);
}

// 3. app.js 里 $(...) 引用的 id 必须存在于 HTML，或属于运行时动态生成的元素
const app = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const dynamicIds = new Set(['新设备', '新能力', '新参数区', '确认添加', '取消添加']);
const usedIds = new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
const missingIds = [...usedIds].filter((id) => !htmlIds.has(id) && !dynamicIds.has(id));
if (missingIds.length) fail('dom-id  unresolved: ' + missingIds.join(', '));
else ok('dom-id  ' + usedIds.size + ' references resolved');

// 4. 许可证与核心文档必须存在
const required = ['LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'NOTICE.md', 'CHANGELOG.md'];
for (const f of required) {
  if (fs.existsSync(path.join(root, f))) ok('doc     ' + f);
  else fail('doc     missing: ' + f);
}

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed.');
  process.exit(1);
}
console.log('All static checks passed.');
