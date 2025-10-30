const { EmbedBuilder } = require('discord.js');
const os = require('os');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    try {
      const channelId = '1428771914372874319';
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch) {
        console.warn(`bot-log: チャンネル ${channelId} を取得できませんでした。`);
        return;
      }

      const mem = process.memoryUsage();
      const totalMem = os.totalmem();
      const usedMem = mem.rss;
      const memPct = ((usedMem / totalMem) * 100).toFixed(2);

      const cpuInfo = os.cpus()[0];
      const cpuModel = cpuInfo ? cpuInfo.model : 'Unknown';

      // CPU usage via process.cpuUsage() (microseconds)
      const cpuUsage = process.cpuUsage();
      const cpuUser = (cpuUsage.user / 1000).toFixed(2); // ms
      const cpuSystem = (cpuUsage.system / 1000).toFixed(2); // ms

      const embed = new EmbedBuilder()
        .setTitle('BOT 起動ログ')
        .addFields(
          { name: 'Bot', value: `${client.user.tag} (${client.user.id})`, inline: false },
          { name: 'Uptime', value: `${process.uptime().toFixed(0)}s`, inline: true },
          { name: 'Memory RSS', value: `${(usedMem / 1024 / 1024).toFixed(2)} MB (${memPct}%)`, inline: true },
          { name: 'CPU Model', value: cpuModel, inline: false },
          { name: 'CPU time (process)', value: `user: ${cpuUser} ms\nsystem: ${cpuSystem} ms`, inline: false }
        )
        .setColor(0x3498db)
        .setTimestamp()
        .setFooter({ text: 'bot-log' });

      // Use environment variable to override the miku gif URL if desired
      const mikuUrl = process.env.MIKU_GIF_URL || 'https://i.imgur.com/4M7IWwP.gif';
      embed.setImage(mikuUrl);

      await ch.send({ embeds: [embed] }).catch(err => console.error('Failed to send bot-log embed:', err));
    } catch (err) {
      console.error('bot-log error:', err);
    }
  },
};
