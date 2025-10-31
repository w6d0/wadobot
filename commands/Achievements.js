/**
 * Achievements.js (修正版)
 * InteractionAlreadyReplied エラー修正版
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
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
    await interaction.deferReply({ ephemeral: true }); // ✅ 先に応答を保留

    const target = interaction.options.getChannel('channel');
    const newNumber = interaction.options.getInteger('number');

    if (!target || !target.isTextBased()) {
      return interaction.editReply('❌ テキストチャンネルを指定してください。');
    }

    if (!target.manageable) {
      return interaction.editReply('⚠️ このチャンネルの名前を変更する権限がありません。');
    }

    const oldName = target.name;
    const match = oldName.match(/(\d+)(?!.*\d)/);
    const newName = match
      ? oldName.slice(0, match.index) + newNumber.toString() + oldName.slice(match.index + match[1].length)
      : oldName + newNumber;

    try {
      await target.setName(newName, `Renamed by ${interaction.user.tag}`);

      await interaction.editReply(`✅ チャンネル名を **${oldName} → ${newName}** に変更しました。`);
      console.log(`🟢 ${interaction.user.tag} が ${oldName} を ${newName} に変更しました。`);

      // ログチャンネル通知（任意）
      const logChannelId = process.env.LOG_CHANNEL_ID;
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
      await interaction.editReply('⚠️ チャンネル名の変更に失敗しました。ボットに適切な権限があるか確認してください。');
    }
  },
};
