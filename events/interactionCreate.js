// events/interactionCreate.js
const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    try {
      // Slash Command 以外のイベントは無視
      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);

      // 存在しないコマンド（登録漏れなど）
      if (!command) {
        console.warn(`⚠️ Unknown command: ${interaction.commandName}`);
        await interaction.reply({
          content: `❌ コマンド「${interaction.commandName}」は登録されていません。`,
          ephemeral: true,
        }).catch(() => {});
        return;
      }

      // コマンドの実行
      await command.execute(interaction);

    } catch (error) {
      console.error(`💥 Error executing command ${interaction.commandName}:`, error);

      // ユーザーへエラーメッセージ通知
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '⚠️ コマンド実行中にエラーが発生しました。',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '⚠️ コマンド実行中にエラーが発生しました。',
            ephemeral: true,
          });
        }
      } catch (err) {
        console.error('❗ Failed to send error message to user:', err);
      }
    }
  },
};
