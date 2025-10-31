/**
 * global-drop.js
 * 配布投稿を作成し、受取ボタンとともにEmbedを送信します。
 * データは指定DMに保存し、受取時にはDM送信とログ記録を行います。
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ComponentType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('global-drop')
    .setDescription('配布投稿を作成します')

    // ✅ 必須オプションは先にまとめる
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

    // ✅ 任意オプション（file/image の場合のみ）
    .addAttachmentOption(option =>
      option
        .setName('attachment')
        .setDescription('ファイルまたは画像（file / image の場合のみ使用）')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const attachment = interaction.options.getAttachment('attachment');

    // --------------------------
    // バリデーション
    // --------------------------
    if ((type === 'file' || type === 'image') && !attachment) {
      return interaction.editReply('❌ ファイルまたは画像を添付してください。');
    }
    if ((type === 'link' || type === 'text') && attachment) {
      return interaction.editReply('❌ リンクまたはテキストの場合、添付ファイルは不要です。');
    }

    // --------------------------
    // Embed 作成
    // --------------------------
    const embed = new EmbedBuilder()
      .setTitle(`🎁 ${title}`)
      .setDescription(description)
      .setColor(0x00AE86)
      .setFooter({ text: `配布タイプ: ${type}` })
      .setTimestamp();

    if (attachment && (type === 'file' || type === 'image')) {
      if (type === 'image') embed.setImage(attachment.url);
      else embed.addFields({ name: '📎 添付ファイル', value: `[ダウンロード](${attachment.url})` });
    }

    // --------------------------
    // ボタン作成
    // --------------------------
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${interaction.id}`)
        .setLabel('🎁 受け取る')
        .setStyle(ButtonStyle.Success)
    );

    const message = await interaction.channel.send({ embeds: [embed], components: [row] });

    // --------------------------
    // データ保存（707800417131692104 のDMに送信）
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
            { name: '概要', value: description }
          )
          .setColor(0x3498db)
          .setTimestamp();

        if (attachment) saveEmbed.addFields({ name: '添付URL', value: attachment.url });

        await saveChannel.send({ embeds: [saveEmbed] });
      }
    } catch (err) {
      console.error('❌ データ保存DM送信失敗:', err);
    }

    await interaction.editReply('✅ 配布投稿を作成しました。');

    // --------------------------
    // ボタン押下処理
    // --------------------------
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 0, // 無制限（手動で停止させない限り永続）
    });

    collector.on('collect', async (btnInteraction) => {
      if (!btnInteraction.customId.startsWith('claim_')) return;

      await btnInteraction.deferReply({ ephemeral: true });

      try {
        // ✅ ユーザーにDM送信
        const user = btnInteraction.user;
        const dm = await user.createDM();

        const receivedEmbed = new EmbedBuilder()
          .setTitle(`🎁 ${title}`)
          .setDescription(`以下の配布を受け取りました。\n\n${description}`)
          .setColor(0x00AE86)
          .setTimestamp();

        if (attachment && (type === 'file' || type === 'image')) {
          if (type === 'image') receivedEmbed.setImage(attachment.url);
          else receivedEmbed.addFields({ name: '📎 添付ファイル', value: `[ダウンロード](${attachment.url})` });
        }

        if (type === 'link' || type === 'text') {
          receivedEmbed.addFields({
            name: '内容',
            value:
              type === 'link'
                ? `[こちらのリンクを開く](${description})`
                : description,
          });
        }

        await dm.send({ embeds: [receivedEmbed] });
        await btnInteraction.editReply('📨 DMに配布内容を送信しました！');

        // ✅ サーバーログ通知（1431976352638177320）
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
        console.error('❌ DM送信またはログ通知エラー:', err);
        await btnInteraction.editReply('⚠️ DMを送信できませんでした。DMの受信設定を確認してください。');
      }
    });
  },
};
