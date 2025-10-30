const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
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
      return interaction.reply({ content: 'テキストチャンネルを指定してください。', ephemeral: true });
    }

    if (!target.manageable) {
      return interaction.reply({ content: 'このチャンネルの名前を変更する権限がありません。', ephemeral: true });
    }

    const oldName = target.name;
    const match = oldName.match(/(\d+)(?!.*\d)/);
    let newName;
    if (match) {
      const num = BigInt(match[1]);
      const incremented = (num + BigInt(1)).toString();
      newName = oldName.slice(0, match.index) + incremented + oldName.slice(match.index + match[1].length);
    } else {
      newName = oldName + '1';
    }

    const embed = new EmbedBuilder();
    embed.setTitle('チャンネル名変更の確認');
    embed.setDescription('チャンネル名\n' + oldName + ' を\n' + newName + ' に変更しますか？');
    embed.setColor(0x00AE86);
    embed.setTimestamp();

    const confirmId = `achieve_confirm_${interaction.id}`;
    const cancelId = `achieve_cancel_${interaction.id}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('許可する').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(cancelId).setLabel('キャンセル').setStyle(ButtonStyle.Danger)
    );

    const reply = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });

    try {
      const filter = i => i.user.id === interaction.user.id && (i.customId === confirmId || i.customId === cancelId);
      const collected = await reply.awaitMessageComponent({ filter, componentType: ComponentType.Button, time: 30000 });

      if (collected.customId === cancelId) {
        row.components.forEach(c => c.setDisabled(true));
        const canceled = EmbedBuilder.from(embed).setColor(0xFF0000).setTitle('キャンセルされました');
        await collected.update({ embeds: [canceled], components: [row] });
        return;
      }

      try {
        await target.setName(newName, `Renamed by ${interaction.user.tag}`);
        row.components.forEach(c => c.setDisabled(true));
        const done = EmbedBuilder.from(embed).setColor(0x00FF7F).setTitle('変更完了').setDescription('**' + oldName + '** を **' + newName + '** に変更しました。');
        await collected.update({ embeds: [done], components: [row] });
      } catch (err) {
        console.error('Failed to rename channel:', err);
        row.components.forEach(c => c.setDisabled(true));
        const fail = EmbedBuilder.from(embed).setColor(0xFF0000).setTitle('変更失敗').setDescription('チャンネル名の変更に失敗しました。権限を確認してください。');
        await collected.update({ embeds: [fail], components: [row] });
      }
    } catch (err) {
      row.components.forEach(c => c.setDisabled(true));
      const timed = EmbedBuilder.from(embed).setColor(0xFFA500).setTitle('タイムアウト').setDescription('応答がありませんでした。操作をキャンセルしました。');
      try {
        await interaction.editReply({ embeds: [timed], components: [row] });
      } catch (e) {}
    }
  },
};
