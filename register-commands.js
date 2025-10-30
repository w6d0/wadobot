/**
 * register-commands.js
 * - dotenv を読み込む（ローカルで .env を使えるように）
 * - commands/ 配下の SlashCommandBuilder をまとめて Discord に登録する
 * - 必須: BOT_TOKEN, CLIENT_ID
 * - 任意: GUILD_ID（指定するとギルド単位で即時登録される）
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // optional

if (!TOKEN || !CLIENT_ID) {
  console.error('環境変数 BOT_TOKEN と CLIENT_ID が必要です。ローカルでは .env に設定してください。');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) commands.push(command.data.toJSON());
  }
}

async function register() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      console.log(`Registering ${commands.length} commands to guild ${GUILD_ID}...`);
      const data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`Registered ${data.length} commands to guild ${GUILD_ID}.`);
    } else {
      console.log(`Registering ${commands.length} global commands... (may take up to 1 hour)`);
      const data = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`Registered ${data.length} global commands.`);
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

register();