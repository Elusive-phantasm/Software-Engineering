/**
 * 一致性自检：前端调用的接口路径必须能在后端路由表中找到。
 * 用法：node scripts/check-api-paths.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const routeDir = path.join(root, 'src', 'http', 'routes');

// 1) 收集后端路由（含挂载前缀）
const mounts = {
  'auth.routes.js': '/api',
  'product.routes.js': '/api',
  'verification.routes.js': '/api',
  'order.routes.js': '/api',
  'social.routes.js': '/api',
  'admin.routes.js': '/api/admin',
  'dev.routes.js': '/api/dev'
};

const backend = new Set();
for (const [file, prefix] of Object.entries(mounts)) {
  const src = fs.readFileSync(path.join(routeDir, file), 'utf8');
  const re = /router\.(get|post|patch|delete)\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    backend.add(`${prefix}${m[2]}`.replace(/\/$/, '') || '/');
  }
}
console.log(`后端路由 ${backend.size} 条`);

/**
 * 把模板表达式 ${...}（可能含嵌套花括号）整体替换为 :param
 */
function stripTemplateExprs(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      out += ':param';
      i = j - 1;
    } else {
      out += s[i];
    }
  }
  return out;
}

// 2) 收集前端调用（去掉查询串，把 ${...} 统一替换为 :param）
const frontFiles = ['public/assets/student.js', 'public/assets/admin.js', 'public/assets/api.js'];
const calls = new Set();
for (const f of frontFiles) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const re = /['"`](\/api\/[^'"`]*)['"`]/g;
  let m;
  while ((m = re.exec(src))) {
    let p = m[1].split('?')[0]; // 先丢掉查询串（其中可能含模板表达式）
    p = stripTemplateExprs(p);
    calls.add(p);
  }
}
console.log(`前端引用的接口路径 ${calls.size} 条`);

// 3) 比对：把后端路由里的 :xxx 也替换为 :param 后比对
const normalize = (p) => p.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':param');
const backendNorm = new Set([...backend].map(normalize));

const missing = [...calls].filter((c) => {
  const n = normalize(c);
  // 形如 `/api/products${qs(...)}` 的写法，插值其实是查询串，去掉尾部 :param 再比一次
  return !backendNorm.has(n) && !backendNorm.has(n.replace(/\/?:param$/, ''));
});
if (missing.length === 0) {
  console.log('\n✓ 前端引用的所有接口路径都在后端路由表中');
} else {
  console.log('\n✗ 以下前端路径在后端找不到对应路由：');
  for (const m of missing) console.log('   ', m);
  process.exitCode = 1;
}

// 4) 反向提示：后端有、前端未用（不是错误，仅提示）
const unused = [...backendNorm].filter((b) => ![...calls].some((c) => normalize(c) === b));
console.log(`\n后端已有但前端未调用（${unused.length} 条，供参考）：`);
for (const u of unused.sort()) console.log('   ', u);
