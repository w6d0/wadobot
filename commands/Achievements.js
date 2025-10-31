/**
 * Achievements.js
 * 指定したチャンネル名の末尾の数字を任意の数値に変更
 * - ボタン確認なし（即変更）
 * - エラーハンドリング・日本語ログ付き
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('指定したチャンネル名の末尾の数字を指定した数値に変更します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('対象のチャンネルを選択してください')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addIntegerOption(option =>
      option
        .setName('number')
        .setDescription('変更後の数字を指定（例：10）')
        .setRequired(true)
        .setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const target = interaction.options.getChannel('channel');
    const newNumber = interaction.options.getInteger('number');

    // --------------------------
    // チャンネルの有効性チェック
    // --------------------------
    if (!target || !target.isTextBased()) {
      return interaction.reply({
        content: '❌ テキストチャンネルを指定してください。',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!target.manageable) {
      return interaction.reply({
        content: '⚠️ このチャンネルの名前を変更する権限がありません。',
        flags: MessageFlags.Ephemeral,
      });
    }

    const oldName = target.name;

    // --------------------------
    // 数字を置き換え（なければ追加）
    // --------------------------
    let newName;
    const match = oldName.match(/(\d+)(?!.*\d)/);
    if (match) {
      newName = oldName.slice(0, match.index) + newNumber.toString() + oldName.slice(match.index + match[1].length);
    } else {
      newName = oldName + newNumber;
    }

    // --------------------------
    // チャンネル名変更
    // --------------------------
    try {
      await target.setName(newName, `Renamed by ${interaction.user.tag}`);

      // 実行者への通知
      await interaction.reply({
        content: `✅ チャンネル名を **${oldName} → ${newName}** に変更しました。`,
        flags: MessageFlags.Ephemeral,
      });

      console.log(`🟢 ${interaction.user.tag} が ${oldName} を ${newName} に変更しました。`);

      // --------------------------
      // BOTログチャンネルへの通知（任意）
      // --------------------------
      const logChannelId = process.env.LOG_CHANNEL_ID; // .envで指定できるようにする
      if (logChannelId) {
        const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle('🏆 チャンネル名変更')
            .setDescription(`**${interaction.user.tag}** がチャンネル名を変更しました。`)
            .addFields(
              { name: '旧チャンネル名', value: oldName, inline: true },
              { name: '新チャンネル名', value: newName, inline: true },
            )
            .setColor(0x00AE86)
            .setTimestamp();
          await logChannel.send({ embeds: [embed] });
        }
      }

    } catch (err) {
      console.error('❌ チャンネル名変更失敗:', err);
      await interaction.reply({
        content: '⚠️ チャンネル名の変更に失敗しました。ボットに適切な権限があるか確認してください。',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
