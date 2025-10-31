/**
 * global-drop.js (改良完全版)
 * Discord.js v14
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('global-drop')
    .setDescription('配布投稿を作成します')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('配布の種類を選択')
        .setRequired(true)
        .addChoices(
          { name: '📁 ファイル', value: 'file' },
          { name: '🖼️ 画像', value: 'image' },
          { name: '🔗 リンク', value: 'link' },
          { name: '💬 テキスト', value: 'text' },
        )
    )
    .addStringOption(option =>
      option
        .setName('title')
        .setDescription('タイトルを入力')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('概要を入力')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName('attachment')
        .setDescription('ファイルまたは画像（file / image の場合のみ）')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const attachment = interaction.options.getAttachment('attachment');

    // 3秒以内に応答保留
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // --------------------------
    // file/image チェック
    // --------------------------
    if ((type === 'file' || type === 'image') && !attachment) {
      return interaction.editReply('❌ ファイルまたは画像を添付してください。');
    }

    // --------------------------
    // link/text の場合はフォームを開く
    // --------------------------
    if (type === 'link' || type === 'text') {
      const modal = new ModalBuilder()
        .setCustomId(`drop_modal_${interaction.id}`)
        .setTitle('配布内容の入力');

      const contentInput = new TextInputBuilder()
        .setCustomId('drop_content')
        .setLabel(type === 'link' ? 'リンクURLを入力してください' : 'テキスト内容を入力してください')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(contentInput));

      await interaction.editReply('📝 フォームを開いて内容を入力してください。');
      await interaction.showModal(modal);

      // フォーム送信待機
      const modalSubmit = await interaction.awaitModalSubmit({
        filter: i => i.customId === `drop_modal_${interaction.id}`,
        time: 60_000,
      }).catch(() => null);

      if (!modalSubmit) return interaction.followUp({ content: '⏰ 入力がタイムアウトしました。', flags: MessageFlags.Ephemeral });

      const formContent = modalSubmit.fields.getTextInputValue('drop_content');
      await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

      // Embed生成処理を呼び出す
      return await createDrop({
        interaction: modalSubmit,
        title,
        description,
        type,
        content: formContent,
      });
    }

    // --------------------------
    // ファイル / 画像 の場合
    // --------------------------
    await createDrop({
      interaction,
      title,
      description,
      type,
      attachment,
    });
  },
};

/**
 * 実際に投稿とログ、保存を行う関数
 */
async function createDrop({ interaction, title, description, type, attachment, content }) {
  // Embed
  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${title}`)
    .setDescription(description)
    .setColor(0x00AE86)
    .setFooter({ text: `配布タイプ: ${type}` })
    .setTimestamp();

  if (type === 'image' && attachment) embed.setImage(attachment.url);
  if (type === 'file' && attachment) embed.addFields({ name: '📎 添付ファイル', value: `[ダウンロード](${attachment.url})` });
  if (type === 'link' && content) embed.addFields({ name: '🔗 リンク', value: content });
  if (type === 'text' && content) embed.addFields({ name: '💬 テキスト内容', value: content });

  // ボタン
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_${interaction.id}`)
      .setLabel('🎁 受け取る')
      .setStyle(ButtonStyle.Success)
  );

  const message = await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.editReply('✅ 配布投稿を作成しました。');

  // --------------------------
  // 保存チャンネルにデータ保存
  // --------------------------
  try {
    const saveChannel = await interaction.client.channels.fetch('707800417131692104');
    if (saveChannel) {
      const saveEmbed = new EmbedBuilder()
        .setTitle('💾 配布データ保存')
        .addFields(
          { name: 'ID', value: interaction.id, inline: true },
          { name: 'タイトル', value: title, inline: true },
          { name: 'タイプ', value: type, inline: true },
          { name: '概要', value: description },
        )
        .setColor(0x3498db)
        .setTimestamp();
      if (attachment) saveEmbed.addFields({ name: '添付URL', value: attachment.url });
      if (content) saveEmbed.addFields({ name: '内容', value: content });
      await saveChannel.send({ embeds: [saveEmbed] });
    }
  } catch (err) {
    console.error('❌ データ保存チャンネル送信失敗:', err);
  }

  // --------------------------
  // ボタン処理
  // --------------------------
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 0,
  });

  collector.on('collect', async btn => {
    if (!btn.customId.startsWith('claim_')) return;

    await btn.deferReply({ flags: MessageFlags.Ephemeral });

    const user = btn.user;
    try {
      const dm = await user.createDM();
      const dmEmbed = EmbedBuilder.from(embed).setFooter({ text: 'あなた専用の配布内容です。' });
      await dm.send({ embeds: [dmEmbed] });

      await btn.editReply('📨 DMに配布内容を送信しました！');

      // ログ
      const logChannel = await interaction.client.channels.fetch('1431976352638177320').catch(() => null);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📬 配布受取ログ')
          .setDescription(`\`\`\`\n${user.tag} (${user.id}) が配布を受け取りました。\n\`\`\``)
          .setColor(0x2ecc71)
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error('❌ DM送信失敗:', err);
      await btn.editReply('⚠️ DMの送信に失敗しました。DM受信設定を確認してください。');
    }
  });
}
