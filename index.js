/**
 * index.js
 * Discord Achievements Bot (discord.js v14)
 * - .env対応
 * - commands/・events/ 自動ロード
 * - HTTPヘルス & APIサーバー
 * - Self Ping対応（Render等の無料ホスティング対策）
 * - エラー日本語化ログ対応
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https'); // ✅ HTTPS対応
const { Client, Collection, GatewayIntentBits } = require('discord.js');

// ----------------------
// In-memory queue & persistence
// ----------------------
let published = [];
let requests = [];
let request_map = {};

try {
  const pfile = path.join(__dirname, 'published.json');
  if (fs.existsSync(pfile)) {
    const raw = fs.readFileSync(pfile, 'utf8') || '[]';
    published = JSON.parse(raw);
    for (const p of published) request_map[p.request_number] = p;
    console.log(`✅ 保存済みデータを読み込みました（${published.length}件）`);
  }
} catch (e) {
  console.error('❌ published.jsonの読み込みに失敗しました:', e);
}

function savePublished() {
  try {
    fs.writeFileSync(path.join(__dirname, 'published_backup.json'), JSON.stringify(published, null, 2));
    fs.writeFileSync(path.join(__dirname, 'published.json'), JSON.stringify(published, null, 2));
    console.log('💾 published.jsonを保存しました。');
  } catch (e) {
    console.error('❌ published.jsonの保存に失敗しました:', e);
  }
}

class Request {
  constructor(prompt) {
    this.start_time = 0;
    this.prev_img_src = null;
    this.prompt = prompt;
    this.percentage = 0;
    this.job_id = '';
    this.img_src = '';
    this.request_number = Math.floor(Math.random() * 1000000000).toString();
    this.status = 'Waiting';
    this.author = '';
    this.title = '';
    this.description = '';
    this.publish_time = null;
    this.error = '';
    request_map[this.request_number] = this;
  }
}

// ----------------------
// HTTP server
// ----------------------
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  const url = req.url || '/';

  if (url === '/' || url === '/health') {
    const uptime = Math.floor(process.uptime());
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime_seconds: uptime,
      memory_rss_mb: Number((mem.rss / 1024 / 1024).toFixed(2)),
      queue_length: requests.length,
      published_count: published.length,
      timestamp: Date.now(),
    }));
    return;
  }

  if (url.startsWith('/request/')) {
    const prompt = decodeURIComponent(url.slice('/request/'.length));
    if (/^[ a-zA-Z0-9'"\-:\,|\?\.!\_\(\)]*$/.test(prompt) && prompt.length > 0 && prompt.length <= 500) {
      const r = new Request(prompt);
      requests.push(r);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad prompt');
    }
    return;
  }

  if (url.startsWith('/check/')) {
    const request_number = decodeURIComponent(url.slice('/check/'.length));
    const pos = requests.findIndex(r => r.request_number === request_number);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      request: request_map[request_number] || null,
      queue_position: pos === -1 ? 0 : pos + 1,
    }));
    return;
  }

  if (url.startsWith('/publish/')) {
    const parts = url.slice('/publish/'.length).split('/');
    const [request_number, author = '', title = '', description = ''] = parts.map(p => decodeURIComponent(p || ''));
    const request = request_map[request_number];
    if (!request) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Request not found');
      return;
    }
    request.author = author;
    request.title = title;
    request.description = description;
    request.publish_time = Date.now();
    request.status = 'Published';
    published.push(request);
    savePublished();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(request));
    return;
  }

  if (url.startsWith('/show/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (published.length) {
      let shown = published[published.length - 1];
      if (Date.now() - (shown.publish_time || 0) > 120 * 1000) {
        shown = published[Math.floor(Date.now() / (20 * 1000)) % published.length];
      }
      res.end(JSON.stringify({ image: shown, count: published.length }));
    } else {
      res.end(JSON.stringify({ image: null, count: 0 }));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ requests: requests.map(r => r.request_number), request_map }));
});

server.listen(PORT, () => console.log(`🌐 HTTPサーバー起動: ポート${PORT}`));
console.log(`🟢 プロセス開始 (PID=${process.pid})`);
console.log(`🕒 起動時刻: ${new Date().toLocaleString('ja-JP')}`);

// ----------------------
// Discord bot
// ----------------------
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) console.error('❌ BOT_TOKENが設定されていません。');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// --- コマンド読み込み ---
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command.data && command.execute) client.commands.set(command.data.name, command);
      console.log(`📜 コマンド読み込み: ${file}`);
    } catch (e) {
      console.error('❌ コマンド読み込み失敗:', file, e);
    }
  }
}

// --- イベント読み込み ---
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));
      if (event.once) client.once(event.name, (...args) => event.execute(client, ...args));
      else client.on(event.name, (...args) => event.execute(client, ...args));
      console.log(`🎧 イベント登録: ${file}`);
    } catch (e) {
      console.error('❌ イベント読み込み失敗:', file, e);
    }
  }
}

// --- スラッシュコマンド実行 ---
client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    await command.execute(interaction);

  } catch (err) {
    const code = err.code || '不明';
    const reason =
      code === 10062 ? '⏰ Interactionが期限切れまたは無効です（3秒以内に応答できなかった可能性）' :
      code === 40060 ? '⚠️ Interactionは既に応答済みです（二重応答の可能性）' :
      err.message || '未知のエラー';

    console.error(`💥 コマンド実行エラー (${interaction.commandName}): [${code}] ${reason}`);

    if (interaction.replied || interaction.deferred) return;
    try {
      await interaction.reply({
        content: `⚠️ コマンド実行中にエラーが発生しました。\n> **${reason}**`,
        flags: 64,
      });
    } catch (e) {
      console.error('❌ ユーザーへのエラーメッセージ送信に失敗:', e);
    }
  }
});

// --- エラーハンドラ ---
process.on('unhandledRejection', reason => console.error('🚨 未処理のPromise拒否:', reason));
process.on('uncaughtException', err => console.error('🔥 致命的エラー:', err));

// --- ログイン ---
if (TOKEN) {
  console.log(`🔐 Discordにログインを試行中... (PID=${process.pid})`);
  client.login(TOKEN)
    .then(() => console.log('✅ Discordクライアントにログインしました。'))
    .catch(err => console.error('❌ ログインに失敗しました:', err));
}

// --- Self Ping（Render対策） ---
const SELF_URL = process.env.SELF_URL || 'https://your-app-name.onrender.com';
setInterval(() => {
  const lib = SELF_URL.startsWith('https') ? https : http;
  lib.get(`${SELF_URL}/health`, res => {
    console.log(`🔁 Self Ping (${SELF_URL}) → ステータス: ${res.statusCode}`);
  }).on('error', err => {
    console.error('⚠️ Self Ping失敗:', err.message);
  });
}, 5 * 60 * 1000);

// --- Readyイベント ---
client.once('ready', () => {
  console.log(`🎉 準備完了! ログイン中: ${client.user.tag}`);
  client.user.setActivity('✨ わどぼっと 稼働中', { type: 3 });
});
