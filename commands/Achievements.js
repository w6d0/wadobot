const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('指定したチャンネル名の末尾の数字を1増やす（または数字が無ければ1を追加）')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('対象のチャンネルを選択してください')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const target = interaction.options.getChannel('channel');

    if (!target || !target.isTextBased()) {
      return interaction.reply({
        content: 'テキストチャンネルを指定してください。',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!target.manageable) {
      return interaction.reply({
        content: 'このチャンネルの名前を変更する権限がありません。',
        flags: MessageFlags.Ephemeral,
      });
    }

    const oldName = target.name;
    const match = oldName.match(/(\d+)(?!.*\d)/);
    const newName = match
      ? oldName.slice(0, match.index) + (BigInt(match[1]) + 1n).toString() + oldName.slice(match.index + match[1].length)
      : oldName + '1';

    // 🔹 Interactionのタイムアウトを防ぐ
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const embed = new EmbedBuilder()
      .setTitle('チャンネル名変更の確認')
      .setDescription(`チャンネル名\n${oldName} を\n${newName} に変更しますか？`)
      .setColor(0x00AE86)
      .setTimestamp();

    const confirmId = `achieve_confirm_${interaction.id}`;
    const cancelId = `achieve_cancel_${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('許可する').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(cancelId).setLabel('キャンセル').setStyle(ButtonStyle.Danger)
    );

    // defer後なので editReply を使用
    await interaction.editReply({ embeds: [embed], components: [row] });

    try {
      const reply = await interaction.fetchReply();
      const filter = i =>
        i.user.id === interaction.user.id &&
        (i.customId === confirmId || i.customId === cancelId);

      const collected = await reply.awaitMessageComponent({
        filter,
        componentType: ComponentType.Button,
        time: 30000,
      });

      row.components.forEach(c => c.setDisabled(true));

      if (collected.customId === cancelId) {
        const canceled = EmbedBuilder.from(embed)
          .setColor(0xff0000)
          .setTitle('キャンセルされました');
        await collected.update({ embeds: [canceled], components: [row] });
        return;
      }

      // ✅ チャンネル名変更処理
      try {
        await target.setName(newName, `Renamed by ${interaction.user.tag}`);
        const done = EmbedBuilder.from(embed)
          .setColor(0x00ff7f)
          .setTitle('変更完了')
          .setDescription(`**${oldName}** を **${newName}** に変更しました。`);
        await collected.update({ embeds: [done], components: [row] });
      } catch (err) {
        console.error('Failed to rename channel:', err);
        const fail = EmbedBuilder.from(embed)
          .setColor(0xff0000)
          .setTitle('変更失敗')
          .setDescription('チャンネル名の変更に失敗しました。権限を確認してください。');
        await collected.update({ embeds: [fail], components: [row] });
      }
    } catch (err) {
      // ⏱ タイムアウト
      row.components.forEach(c => c.setDisabled(true));
      const timed = EmbedBuilder.from(embed)
        .setColor(0xffa500)
        .setTitle('タイムアウト')
        .setDescription('応答がありませんでした。操作をキャンセルしました。');
      await interaction.editReply({ embeds: [timed], components: [row] }).catch(() => {});
    }
  },
};
