/**
 * global-drop.js
 * Discord.js v14
 *
 * 機能:
 * - /global-drop コマンドで「ファイル・画像・リンク・テキスト」から1つ選び、配布投稿を作成
 * - タイトルと概要は必須
 * - ファイル/画像 → アップロード
 * - リンク/テキスト → モーダルフォーム入力
 * - 投稿後、配布データを DM (ID: 707800417131692104) にEmbedとして保存
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const SAVE_USER_ID = '707800417131692104'; // DM保存先ユーザーID

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
    .addAttachmentOption(option =>
      option
        .setName('attachment')
        .setDescription('ファイルまたは画像（type=file または image の場合のみ必須）')
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const attachment = interaction.options.getAttachment('attachment');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');

    // 🔸 入力チェック
    if ((type === 'file' || type === 'image') && !attachment) {
      return interaction.reply({ content: '❌ ファイルまたは画像をアップロードしてください。', ephemeral: true });
    }

    if ((type === 'link' || type === 'text') && attachment) {
      return interaction.reply({ content: '❌ リンクまたはテキストタイプではファイルを添付できません。', ephemeral: true });
    }

    // 🔸 リンク or テキストの場合 → モーダル入力
    if (type === 'link' || type === 'text') {
      const modal = new ModalBuilder()
        .setCustomId(`globalDropModal_${interaction.id}`)
        .setTitle(type === 'link' ? 'リンク入力' : 'テキスト入力');

      const inputField = new TextInputBuilder()
        .setCustomId('contentInput')
        .setLabel(type === 'link' ? '配布リンクを入力' : '配布テキストを入力')
        .setStyle(type === 'link' ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(inputField));
      await interaction.showModal(modal);

      const modalSubmit = await interaction.awaitModalSubmit({
        filter: i => i.customId === `globalDropModal_${interaction.id}` && i.user.id === interaction.user.id,
        time: 120000,
      }).catch(() => null);

      if (!modalSubmit) {
        return interaction.followUp({ content: '⏰ 入力がタイムアウトしました。', ephemeral: true });
      }

      const userContent = modalSubmit.fields.getTextInputValue('contentInput');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .addFields({ name: '配布内容', value: userContent })
        .setColor(0x00AE86)
        .setFooter({ text: `投稿者: ${interaction.user.tag}` })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setCustomId('get_drop')
        .setLabel('受け取る')
        .setStyle(ButtonStyle.Success);

      await modalSubmit.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
      });

      // ✅ DMに保存
      await saveToDM(interaction.client, {
        type, title, description, content: userContent, author: interaction.user.tag,
      });
      return;
    }

    // 🔸 ファイル or 画像タイプ
    if (type === 'file' || type === 'image') {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(0x00AE86)
        .setFooter({ text: `投稿者: ${interaction.user.tag}` })
        .setTimestamp();

      if (type === 'image') embed.setImage(attachment.url);
      else embed.addFields({ name: 'ファイル名', value: `[ダウンロード](${attachment.url})` });

      const button = new ButtonBuilder()
        .setCustomId('get_drop')
        .setLabel('受け取る')
        .setStyle(ButtonStyle.Success);

      await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
      });

      // ✅ DMに保存
      await saveToDM(interaction.client, {
        type, title, description, attachment: attachment.url, author: interaction.user.tag,
      });
    }
  },
};

// 🔹 DM保存関数
async function saveToDM(client, data) {
  try {
    const user = await client.users.fetch(SAVE_USER_ID);
    const embed = new EmbedBuilder()
      .setTitle('📦 Global Drop 保存')
      .setColor(0x0099ff)
      .addFields(
        { name: 'タイプ', value: data.type, inline: true },
        { name: 'タイトル', value: data.title, inline: true },
        { name: '概要', value: data.description },
      )
      .setFooter({ text: `投稿者: ${data.author}` })
      .setTimestamp();

    if (data.content) embed.addFields({ name: '内容', value: data.content });
    if (data.attachment) embed.addFields({ name: '添付', value: data.attachment });

    await user.send({ embeds: [embed] });
    console.log(`💾 GlobalDrop を DM に保存しました (${data.title})`);
  } catch (err) {
    console.error('❌ DM保存失敗:', err);
  }
}
