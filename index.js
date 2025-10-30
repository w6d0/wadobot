/**
 * index.js
 * - dotenv を読み込む（ローカルで .env を使えるように）
 * - commands/ と events/ をロードして Bot を起動
 * - 軽量なヘルス & API サーバ（/health, /request, /check, /publish, /show）
 *
 * NOTE: Puppeteer/ウェブUI自動操作は含めていません（利用規約リスク）。ここでは安全なキュー管理基盤を提供します。
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

// ----------------------
// In-memory queue & persistence
// ----------------------
let published = [];
let requests = [];
let request_map = {};

// Load published.json if exists
try {
  const pfile = path.join(__dirname, 'published.json');
  if (fs.existsSync(pfile)) {
    const raw = fs.readFileSync(pfile, 'utf8') || '[]';
    published = JSON.parse(raw);
    for (const p of published) request_map[p.request_number] = p;
    console.log(`Loaded ${published.length} published items`);
  }
} catch (e) {
  console.error('Failed to load published.json:', e);
}

function savePublished() {
  try {
    fs.writeFileSync(path.join(__dirname, 'published_backup.json'), JSON.stringify(published, null, 2));
    fs.writeFileSync(path.join(__dirname, 'published.json'), JSON.stringify(published, null, 2));
  } catch (e) {
    console.error('Failed to save published.json:', e);
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
// HTTP server: health + API
// ----------------------
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  const url = req.url || '/';

  // Health endpoint
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

  // Enqueue a prompt
  if (url.startsWith('/request/')) {
    const prompt = decodeURIComponent(url.slice('/request/'.length));
    // Basic validation: letters, numbers, spaces and limited punctuation
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

  // Check request status / queue position
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

  // Publish a request (mark as published)
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

  // Show last published (with simple time-based rotation)
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

  // Default: list queued request ids and map
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ requests: requests.map(r => r.request_number), request_map }));
});

server.listen(PORT, () => console.log(`Health & API server listening on port ${PORT}`));

// --- Added: startup logs to help detect duplicate processes ---
console.log(`Process started. PID=${process.pid}, argv=${process.argv.join(' ')}, cwd=${process.cwd()}`);
console.log(`Startup timestamp: ${new Date().toISOString()}`);

// ----------------------
// Discord bot part
// ----------------------

// BOT_TOKEN is required to run bot features (commands/events)
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Environment variable BOT_TOKEN is required. Set it in .env or Render env vars.');
  // Do not exit immediately if you want the API server to remain alive without bot.
  // If you want to stop the process when BOT_TOKEN is missing, uncomment next line:
  // process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// load commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if (command.data && command.execute) client.commands.set(command.data.name, command);
    } catch (e) {
      console.error('Failed to load command', file, e);
    }
  }
}

// load events with clientReady compatibility
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  for (const file of eventFiles) {
    try {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      if (event.once) {
        client.once(event.name, (...args) => event.execute(client, ...args));
        if (event.name === 'ready') client.once('clientReady', (...args) => event.execute(client, ...args));
      } else {
        client.on(event.name, (...args) => event.execute(client, ...args));
        if (event.name === 'ready') client.on('clientReady', (...args) => event.execute(client, ...args));
      }
    } catch (e) {
      console.error('Failed to load event', file, e);
    }
  }
}

// interaction handling
client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    await command.execute(interaction);
  } catch (err) {
    console.error('Command execution error:', err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '実行中にエラーが発生しました。', flags: 64 });
      } else {
        await interaction.reply({ content: '実行中にエラーが発生しました。', flags: 64 });
      }
    } catch (e) {
      console.error('Failed to notify user about error:', e);
    }
  }
});

// global error handlers
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// --- Added: guarded login with logs to make duplicate-start detection easier ---
let loginAttempted = false;
if (TOKEN) {
  if (!loginAttempted) {
    loginAttempted = true;
    console.log(`Attempting Discord client.login (PID=${process.pid})`);
    client.login(TOKEN)
      .then(() => console.log('Discord client login resolved'))
      .catch(err => console.error('Failed to login:', err));
  } else {
    console.log('Login already attempted in this process; skipping duplicate login.');
  }
} else {
  console.log('BOT_TOKEN not provided; Discord client will not login in this process.');
}
