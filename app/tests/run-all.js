/**
 * 一键跑全部验收测试：冒烟 → UC 级回归 → 场景走查（SC-01～SC-13）→ 前端渲染检查。
 * 前置条件：服务已启动（npm start，默认 127.0.0.1:3081）。
 *
 * 用 stdio:'inherit' 串行执行子进程，便于在受限环境（无法使用管道）中运行。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = [
  ['冒烟测试', 'smoke.js'],
  ['UC 级回归', 'uc/run-uc.js'],
  ['场景走查 SC-01～SC-13', 'sc/run-sc.js'],
  ['前端渲染检查（jsdom 执行 student.js / admin.js）', 'ui/run-ui.js']
];

const results = [];
for (const [label, file] of suites) {
  console.log(`\n${'#'.repeat(70)}\n# ${label}\n${'#'.repeat(70)}`);
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(here, file)], { stdio: 'inherit' });
  results.push({ label, code: r.status });
}

console.log(`\n${'='.repeat(70)}\n验收测试汇总`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? '✓ 通过' : '✗ 失败'}  ${r.label}`);
}
const failed = results.filter((r) => r.code !== 0).length;
console.log(failed === 0 ? '\n全部测试套件通过。' : `\n${failed} 个套件存在失败项。`);
process.exit(failed === 0 ? 0 : 1);
