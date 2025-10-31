/**
 * global-drop.js
 * 配布コマンド
 * - ファイル、画像、リンク、テキストを配布可能
 * - DMに内容を保存し、サーバーログへ「受け取り記録」を送信
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');

const SAVE_DM_CHANNEL_ID = '707800417131692104'; // 保存用DM（BOT用）
const LOG_CHANNEL_ID = '1431976352638177320'; // サーバーログ用

module.exports = {
  data: new SlashCommandBuilder()
    .setName('global-drop')
    .setDescription('配布を作成します（ファイル、画像、リンク、またはテキスト）')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('配布の種類を選択')
        .addChoices(
          { name: 'ファイル', value: 'file' },
          { name: '画像', value: 'image' },
          { name: 'リンク', value: 'link' },
          { name: 'テキスト', value: 'text' },
        )
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName('attachment')
        .setDescription('ファイルまたは画像をアップロード（type=file/imageのとき）')
    )
    .addStringOption(option =>
      option.setName('title').setDescription('タイトル').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('description').setDescription('概要').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const attachment = interaction.options.getAttachment('attachment');

    try {
      // ========================
      // file / image の場合
      // ========================
      if (type === 'file' || type === 'image') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!attachment) {
          return interaction.editReply('❌ ファイルまたは画像を添付してください。');
        }

        return await createDrop({
          interaction,
          title,
          description,
          type,
          attachment,
        });
      }

      // ========================
      // link / text の場合
      // ========================
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
        await interaction.showModal(modal);

        const modalSubmit = await interaction
          .awaitModalSubmit({
            filter: i => i.customId === `drop_modal_${interaction.id}`,
            time: 60_000,
          })
          .catch(() => null);

        if (!modalSubmit) return;

        await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

        const content = modalSubmit.fields.getTextInputValue('drop_content');

        return await createDrop({
          interaction: modalSubmit,
          title,
          description,
          type,
          content,
        });
      }
    } catch (err) {
      console.error('💥 コマンド実行エラー (global-drop):', err);
      try {
        await interaction.reply({
          content: '⚠️ コマンド実行中にエラーが発生しました。',
          flags: MessageFlags.Ephemeral,
        });
      } catch {}
    }
  },
};

/**
 * 配布処理本体
 */
async function createDrop({ interaction, title, description, type, attachment, content }) {
  const embed = new EmbedBuilder()
    .setTitle(`📦 配布: ${title}`)
    .setDescription(description)
    .setColor(0x00b0f4)
    .setTimestamp();

  if (type === 'image' && attachment) embed.setImage(attachment.url);
  if (type === 'file' && attachment) embed.addFields({ name: '📁 添付ファイル', value: `[ダウンロード](${attachment.url})` });
  if (type === 'link' && content) embed.addFields({ name: '🔗 リンク', value: content });
  if (type === 'text' && content) embed.addFields({ name: '📝 テキスト', value: content });

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`receive_${interaction.user.id}_${Date.now()}`)
      .setLabel('📥 受け取る')
      .setStyle(ButtonStyle.Primary)
  );

  const message = await interaction.channel.send({ embeds: [embed], components: [button] });

  await interaction.editReply(`✅ 配布を作成しました: ${message.url}`);

  // ----------------------------
  // 保存用DMに内容を送信
  // ----------------------------
  try {
    const saveChannel = await interaction.client.channels.fetch(SAVE_DM_CHANNEL_ID);
    if (saveChannel) {
      const saveEmbed = EmbedBuilder.from(embed).setFooter({ text: `作成者: ${interaction.user.tag}` });
      await saveChannel.send({ embeds: [saveEmbed] });
    }
  } catch (err) {
    console.error('❌ データ保存DM送信失敗:', err);
  }

  // ----------------------------
  // ボタンのクリックイベント登録
  // ----------------------------
  const collector = message.createMessageComponentCollector({
    time: 7 * 24 * 60 * 60 * 1000, // 7日間
  });

  collector.on('collect', async i => {
    if (!i.customId.startsWith('receive_')) return;
    await i.deferReply({ flags: MessageFlags.Ephemeral });

    // ユーザーにDM送信
    try {
      const dm = await i.user.createDM();
      await dm.send({ embeds: [embed] });
      await i.editReply('📨 DMに配布を送信しました！');
    } catch {
      await i.editReply('⚠️ DMの送信に失敗しました。DMを許可してください。');
    }

    // サーバーログに記録（内容は非表示）
    try {
      const logChannel = await i.client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📩 配布受け取りログ')
          .setDescription(`\`\`\`\n${i.user.tag} が配布を受け取りました。\n\`\`\``)
          .setColor(0x888888)
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error('❌ ログ送信失敗:', err);
    }
  });
}
