#!/usr/bin/env node
// 生成可部署到 gficcrew.cn 的后台目录（dist-cn-admin/）。
//
// 为什么不能直接把 dist-app 整个丢上去：
//   server-pull.sh 用 `rsync --delete` 把公开包同步到网站根目录。后台的 JS/CSS
//   如果和公开站一起放在 /_astro/，下一次拉包就会被当成"多余文件"删掉。
//   所以这里把后台资源独立成 /admin-assets/，后台页面、接口各自一个前缀，
//   三者都在 server-pull.sh 的 exclude 列表里。
//
// 产物结构：
//   dist-cn-admin/admin/index.html   后台页面（资源引用已改写）
//   dist-cn-admin/admin-assets/      后台专用 JS/CSS
//   dist-cn-admin/api/               PHP 数据接口（不含任何口令或数据）
//
// 数据文件不在这里 —— 它在服务器的 /www/gfic-data/，网站根目录之外。

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const appDir = path.join(root, 'dist-app');
const outDir = path.join(root, 'dist-cn-admin');
const adminHtml = path.join(appDir, 'admin', 'index.html');

if (!fs.existsSync(adminHtml)) {
  console.error('缺少 dist-app/admin/index.html，请先运行 npm run build:all && npm run app:prepare');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'admin'), { recursive: true });

// 1. 后台页面：资源前缀改成独立目录，并确保不会被收录。
let html = fs.readFileSync(adminHtml, 'utf8');
const refs = html.match(/\/_astro\//g) || [];
html = html.split('/_astro/').join('/admin-assets/');
if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) {
  console.error('后台页面缺少 noindex meta，已中止。');
  process.exit(1);
}
fs.writeFileSync(path.join(outDir, 'admin', 'index.html'), html);

// 2. 后台资源。整目录复制：Astro 可能按页面拆分 chunk，只复制被直接引用的文件
//    会漏掉间接依赖，而整个 _astro 也就几百 KB，不值得为它引入脆弱的分析。
fs.cpSync(path.join(appDir, '_astro'), path.join(outDir, 'admin-assets'), { recursive: true });

// 3. PHP 接口。install.php 只允许 CLI 执行，部署后由服务器初始化脚本调用。
fs.cpSync(path.join(root, 'server', 'api'), path.join(outDir, 'api'), { recursive: true });

// 4. 明确不写进去的东西，给后来人一条可检查的断言。
for (const forbidden of ['data.json', 'config.php', '.adminpw', '.export-token']) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === forbidden) found.push(full);
    }
  };
  walk(outDir);
  if (found.length) {
    console.error(`部署包里混入了 ${forbidden}：${found.join(', ')}`);
    process.exit(1);
  }
}

const sizeOf = (dir) => {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size;
  }
  return total;
};

console.log(`已生成 dist-cn-admin（${Math.round(sizeOf(outDir) / 1024)} KB）：`);
console.log(`  admin/index.html   后台页面，改写了 ${refs.length} 处资源引用，含 noindex`);
console.log('  admin-assets/      后台专用静态资源，与公开站 /_astro/ 隔离');
console.log('  api/               PHP 接口，口令与数据都在网站根目录之外');
console.log('下一步：上传到服务器网站根目录，再运行服务器初始化脚本。');
