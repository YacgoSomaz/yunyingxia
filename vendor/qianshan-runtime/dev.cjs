// 主进程 dev 启动器：在 Electron 运行时下用 tsx 加载 TS 源码。
// preload.ts 需要先同步转译一次（Electron 读取磁盘 js，不走 require 钩子）。
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV ||= 'development';

// 同步把 preload.ts 编译到 src/preload.js，供 BrowserWindow.webPreferences.preload 使用。
const preloadTs = path.join(__dirname, 'src', 'preload.ts');
const preloadJs = path.join(__dirname, 'src', 'preload.js');
const esbuildBin = path.join(
  __dirname,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'
);

try {
  execFileSync(
    esbuildBin,
    [preloadTs, '--format=cjs', '--target=node20', `--outfile=${preloadJs}`],
    { shell: process.platform === 'win32', stdio: 'inherit' }
  );
} catch (err) {
  console.error('[dev.cjs] preload transpile failed:', err && err.message);
  process.exit(1);
}

// 注册 tsx 的 CJS 钩子，让 require 能处理 .ts 文件。
require('tsx/cjs');
require('./src/index.ts');
