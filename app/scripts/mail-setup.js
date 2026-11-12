/**
 * 交互式配置真实 SMTP 发信：npm run mail:setup
 *
 * 作用：把 SMTP 凭据写入 config/mail.json（已被 .gitignore 忽略），
 * 并立刻发一封自检邮件验证通道是否可用。凭据不会出现在日志、审计或 git 里。
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ROOT = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const MAIL_FILE = path.join(ROOT, 'config', 'mail.json');

const PRESETS = {
  '1': { name: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, secure: true },
  '2': { name: '163 邮箱', host: 'smtp.163.com', port: 465, secure: true },
  '3': { name: '126 邮箱', host: 'smtp.126.com', port: 465, secure: true },
  '4': { name: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true },
  '5': { name: 'Outlook / Office365', host: 'smtp.office365.com', port: 587, secure: false }
};

const rl = readline.createInterface({ input, output });

// 若非交互环境（stdin 不是终端、例如被管道喂入或直接 EOF），给出明确提示而不是静默退出
let finished = false;
rl.on('close', () => {
  if (!finished) {
    console.log('\n输入结束，已取消配置（未修改任何文件）。请在本机终端里交互运行：npm run mail:setup');
    process.exitCode = 0;
  }
});

function tip(text) {
  console.log(`\n${text}`);
}

/**
 * 用真实网络自检（不发邮件，只做 SMTP 握手与认证）。
 * 独立实现一份最简握手，避免把 mailer 的完整发送逻辑带进来。
 */
async function handshake(cfg) {
  const net = await import('node:net');
  const tls = await import('node:tls');

  const connect = () =>
    new Promise((resolve, reject) => {
      const socket = cfg.secure
        ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: cfg.allowInvalidCert !== true })
        : net.connect({ host: cfg.host, port: cfg.port });
      const ev = cfg.secure ? 'secureConnect' : 'connect';
      socket.setTimeout(12000, () => reject(new Error('连接超时（12 秒）')));
      socket.once('error', reject);
      socket.once(ev, () => resolve(socket));
    });

  const lines = (socket) => {
    let buf = '';
    const queue = [];
    const waiters = [];
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      for (;;) {
        const i = buf.indexOf('\r\n');
        if (i < 0) break;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const m = /^(\d{3})([ -])?/.exec(line);
        if (!m) continue;
        const resp = { code: Number(m[1]), text: line };
        const w = waiters.shift();
        if (w) w(resp);
        else queue.push(resp);
      }
    });
    return () =>
      queue.length
        ? Promise.resolve(queue.shift())
        : new Promise((res) => waiters.push(res));
  };

  let socket = await connect();
  const next = lines(socket);
  const greet = await next();
  if (greet.code !== 220) throw new Error(`服务器问候异常：${greet.text}`);

  const ehlo = async () => {
    socket.write(`EHLO campus-reuse.local\r\n`);
    const r = await next();
    if (r.code !== 250) throw new Error(`EHLO 失败：${r.text}`);
    return r;
  };
  let hello = await ehlo();

  if (!cfg.secure) {
    // 587 端口通常要求 STARTTLS
    socket.write('STARTTLS\r\n');
    const r = await next();
    if (r.code !== 220) throw new Error(`STARTTLS 失败：${r.text}`);
    socket = tls.connect({
      socket,
      servername: cfg.host,
      rejectUnauthorized: cfg.allowInvalidCert !== true
    });
    await new Promise((res, rej) => {
      socket.once('secureConnect', res);
      socket.once('error', rej);
    });
    hello = await ehlo();
  }

  if (cfg.user && cfg.pass) {
    socket.write('AUTH LOGIN\r\n');
    if ((await next()).code !== 334) throw new Error('服务器未接受 AUTH LOGIN');
    socket.write(Buffer.from(cfg.user, 'utf8').toString('base64') + '\r\n');
    if ((await next()).code !== 334) throw new Error('用户名被拒绝');
    socket.write(Buffer.from(cfg.pass, 'utf8').toString('base64') + '\r\n');
    const auth = await next();
    if (auth.code !== 235) throw new Error(`认证失败：${auth.text}（授权码是否正确？是否已开启 SMTP 服务？）`);
  } else {
    throw new Error('未填写账号或授权码');
  }

  socket.write('QUIT\r\n');
  socket.destroy();
  return true;
}

try {
  console.log('=== 拾光二手 · SMTP 发信配置向导 ===\n');
  console.log('说明：验证码邮件需要一个可发信的邮箱账号。授权码不是登录密码，');
  console.log('      在邮箱网页版「设置 → 账户 → POP3/SMTP 服务」里开启后生成。\n');
  console.log('请选择邮箱服务商：');
  for (const [k, v] of Object.entries(PRESETS)) console.log(`  ${k}) ${v.name}（${v.host}:${v.port}）`);
  console.log('  9) 其它 / 学校邮箱（手动填写主机与端口）');

  const choice = (await rl.question('\n输入序号 [1]：')) || '1';
  let host, port, secure;

  if (PRESETS[choice]) {
    ({ host, port, secure } = PRESETS[choice]);
    console.log(`已选择 ${PRESETS[choice].name}：${host}:${port}（${secure ? 'SSL' : 'STARTTLS'}）`);
  } else {
    host = (await rl.question('SMTP 主机（如 smtp.example.edu）：')).trim();
    port = Number((await rl.question('端口（465 用 SSL，587 用 STARTTLS）[465]：')) || 465);
    secure = port === 465;
  }

  const user = (await rl.question('\n发件邮箱账号（完整邮箱地址）：')).trim();
  console.log('请在下面粘贴「SMTP 授权码」（输入内容会显示在终端，粘贴后回车）：');
  const pass = (await rl.question('SMTP 授权码：')).trim();
  const from = (await rl.question(`\n发件人显示名后的地址（直接回车 = 用 ${user}）：`)).trim() || user;

  if (!user || !pass) throw new Error('账号或授权码为空，已取消');

  const cfg = {
    transport: 'smtp',
    host,
    port,
    secure,
    requireTLS: true,
    user,
    pass,
    from: from.includes('<') ? from : `拾光二手 <${from}>`,
    ehloName: 'campus-reuse.local',
    allowInvalidCert: false
  };

  tip('正在做 SMTP 握手 + 认证自检（不发送邮件）…');
  await handshake(cfg);
  console.log('✓ 连接与认证成功');

  fs.writeFileSync(MAIL_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log(`\n✓ 已写入 ${path.relative(ROOT, MAIL_FILE)}（该文件已被 .gitignore 忽略）`);

  const to = (await rl.question('\n要发一封测试邮件到哪个地址？（直接回车 = 发给发件邮箱）：')).trim() || user;
  tip(`正在发送测试邮件到 ${to} …`);
  const { mailSelfTest } = await import('../src/core/mailer.js');
  const res = await mailSelfTest(to);
  if (res.ok) {
    console.log('✓ 测试邮件已通过 SMTP 发出，请到收件箱确认（也检查垃圾箱）');
  } else {
    console.log(`✗ 发送失败：${res.error}`);
    console.log('  凭据已保存，但可能仍不可用；修正后重跑 npm run mail:setup');
  }
  console.log('\n最后一步：重启服务（Ctrl+C 后 npm start），之后注册/找回密码的验证码会走真实邮件。');
  finished = true;
} catch (err) {
  finished = true;
  console.log(`\n✗ 配置未完成：${err.message}`);
  console.log('  可稍后重跑 npm run mail:setup；期间保持本地开发邮箱模式不受影响。');
  process.exitCode = 1;
} finally {
  rl.close();
}
