/* VoxLedger 데모 셸 — FastAPI(:8765) 서버를 자식 프로세스로 띄우고 창에 로드한다.
 *
 * - 이미 :8765 에 서버가 떠 있으면 그대로 재사용 (개발 중 uvicorn 수동 구동과 공존)
 * - 아니면 ~/zipa-mac/zipa-env 파이썬으로 uvicorn 을 spawn — ZIPA CoreML 세션
 *   초기화에 수 초 걸리므로 /api/bootstrap 이 200 을 줄 때까지 폴링 후 로드
 * - 앱 종료 시 자식 서버도 함께 종료
 *
 * 패키징(.app)하면 __dirname 이 앱 번들 내부가 되므로 레포 경로는
 * VOX_REPO 환경변수 → 소스트리 추정 → 고정 경로 순으로 해석한다.
 */
'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const PORT = 8765;
const BASE_URL = 'http://127.0.0.1:' + PORT;

function resolveRepo() {
  if (process.env.VOX_REPO) return process.env.VOX_REPO;
  const fromSource = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(fromSource, 'server', 'main.py'))) return fromSource;
  return '/Users/junehwi/phorock'; // 패키징된 .app 용 (이 데모는 머신 로컬 전제)
}

const REPO = resolveRepo();
const PYTHON = path.join(os.homedir(), 'zipa-mac', 'zipa-env', 'bin', 'python');

let serverProc = null;
let serverLog = '';
let win = null;

function ping() {
  return new Promise(function (resolve) {
    const req = http.get(BASE_URL + '/api/bootstrap', function (res) {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', function () { resolve(false); });
    req.setTimeout(1000, function () { req.destroy(); resolve(false); });
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function ensureServer() {
  if (await ping()) return 'reused';
  if (!fs.existsSync(PYTHON)) throw new Error('zipa-env python not found: ' + PYTHON);
  serverProc = spawn(PYTHON, ['-m', 'uvicorn', 'server.main:app', '--port', String(PORT)], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const tail = function (d) {
    serverLog = (serverLog + String(d)).slice(-4000);
  };
  serverProc.stdout.on('data', tail);
  serverProc.stderr.on('data', tail);
  // ZIPA int8 ONNX + CoreML EP 초기화 대기 (첫 구동 수 초)
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (serverProc.exitCode !== null) {
      throw new Error('server exited (' + serverProc.exitCode + ')\n' + serverLog);
    }
    if (await ping()) return 'spawned';
  }
  throw new Error('server not ready in 60s\n' + serverLog);
}

function stopServer() {
  if (serverProc && serverProc.exitCode === null) {
    try { serverProc.kill('SIGTERM'); } catch (e) { /* 이미 종료 */ }
  }
  serverProc = null;
}

const LOADING_HTML = 'data:text/html;charset=utf-8,' + encodeURIComponent(
  '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;' +
  'background:#f4f2ee;font:14px -apple-system,sans-serif;color:#57534e">' +
  '<div style="text-align:center"><div style="font-size:26px;margin-bottom:12px">🎙️</div>' +
  '<strong style="color:#1c1917">VoxLedger</strong><div style="margin-top:6px">' +
  'ZIPA 음소인식 서버 시작 중… (첫 구동은 몇 초 걸립니다)</div></div></body>'
);

function createWindow() {
  win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: 'VoxLedger — Hinglish Audit Desk',
    backgroundColor: '#f4f2ee',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.on('closed', function () { win = null; });
  win.loadURL(LOADING_HTML);
}

async function boot() {
  createWindow();
  try {
    await ensureServer();
    if (win) await win.loadURL(BASE_URL);
  } catch (err) {
    dialog.showErrorBox('VoxLedger 서버 구동 실패', String(err && err.message ? err.message : err));
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', function () {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(boot);
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) boot();
  });
}

app.on('window-all-closed', function () { app.quit(); });
app.on('will-quit', stopServer);
process.on('exit', stopServer);
