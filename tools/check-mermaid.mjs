/**
 * Mermaid 渲染校验：把 Markdown 里的每个 ```mermaid 块真实渲染一遍，报告语法错误。
 * 用法：node tools/check-mermaid.mjs [file.md ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';

const EDGE = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean).find((p) => fs.existsSync(p));

const cwd = process.cwd();
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [path.join(cwd, '..', 'docs', 'architecture', '软件架构设计说明书.md')];

const distDir = path.join(cwd, 'node_modules', 'mermaid', 'dist');
const umd = path.join(distDir, 'mermaid.min.js');
const esm = path.join(distDir, 'mermaid.esm.min.mjs');
const useUmd = fs.existsSync(umd);
const scriptTag = useUmd
  ? '<script src="/node_modules/mermaid/dist/mermaid.min.js"></script>'
  : '<script type="module">import mermaid from "/node_modules/mermaid/dist/mermaid.esm.min.mjs"; window.mermaid = mermaid;</script>';

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
${scriptTag}
<div id="out"></div>
<script>
window.renderBlocks = async (blocks) => {
  const m = window.mermaid;
  m.initialize({ startOnLoad: false, theme: 'default' });
  const results = [];
  for (const [i, text] of blocks.entries()) {
    try {
      await m.parse(text);
      const { svg } = await m.render('g' + i, text);
      results.push({ i, ok: svg.includes('<svg'), len: svg.length });
    } catch (e) {
      results.push({ i, ok: false, error: String(e && e.message ? e.message : e).slice(0, 300) });
    }
  }
  return results;
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  const file = path.join(cwd, decodeURIComponent(url));
  if (file.startsWith(path.join(cwd, 'node_modules')) && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404);
  res.end('nf');
});

await new Promise((r) => server.listen(8899, r));

const blocks = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) blocks.push({ file: path.basename(f), body: m[1] });
}
console.log(`待校验的 Mermaid 图：${blocks.length} 个（${files.map((f) => path.basename(f)).join(', ')}）`);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8899/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.mermaid !== 'undefined', { timeout: 15000 });
const results = await page.evaluate((bodies) => window.renderBlocks(bodies), blocks.map((b) => b.body));
await browser.close();
server.close();

let bad = 0;
results.forEach((r) => {
  const b = blocks[r.i];
  if (r.ok) {
    console.log(`  ✓ #${r.i + 1} ${b.file}（${r.len} 字节 svg）`);
  } else {
    bad++;
    console.log(`  ✗ #${r.i + 1} ${b.file}: ${r.error}`);
    console.log('    --- 片段 ---');
    console.log(b.body.split('\n').slice(0, 6).map((l) => '    ' + l).join('\n'));
  }
});
console.log(`\n结果：${results.length - bad} 通过 / ${bad} 失败`);
process.exitCode = bad ? 1 : 0;
