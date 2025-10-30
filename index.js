/**
 * index.js
 * - dotenv を読み込む（ローカルで .env を使えるように）
 * - commands/ と events/ をロードして Bot を起動
 */
require('dotenv').config(); // .env を読み込む（ローカル用）。Renderではダッシュボードの env を使ってください。

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');

// 必須: BOT_TOKEN（.env または Render 環境変数）
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('Environment variable BOT_TOKEN is required.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// commands を読み込み
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if (command.data && command.execute) client.commands.set(command.data.name, command);
  }
}

// events を読み込み
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) client.once(event.name, (...args) => event.execute(client, ...args));
    else client.on(event.name, (...args) => event.execute(client, ...args));
  }
}

// interaction ハンドリング
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error('Command execution error:', err);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: '実行中にエラーが発生しました。', ephemeral: true });
    else await interaction.reply({ content: '実行中にエラーが発生しました。', ephemeral: true });
  }
});

client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});