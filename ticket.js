// ===============================
// Street Aces Bot — ticket.js (COMPLET)
// ===============================

import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import * as Transcripts from 'discord-html-transcripts';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import 'dotenv/config';

const DATA_DIR = './data';
const STATE_PATH = `${DATA_DIR}/state.json`;

function loadState() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(STATE_PATH)) {
      writeFileSync(STATE_PATH, JSON.stringify({}), 'utf-8');
      return {};
    }
    const raw = readFileSync(STATE_PATH, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function saveState(obj) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {}
}

export async function initTickets(client, state, persist) {
  const {
    TICKETS_MENU_CHANNEL_ID,
    TICKETS_CATEGORY_ID,
    TICKETS_LOGS_CHANNEL_ID,
    TICKET_QUESTION_ROLES,
    TICKET_RECRUTEMENT_ROLES,
    TICKET_PARTENARIAT_ROLES,
    TICKET_HELP_ROLES
  } = process.env;

  function parseRoles(str) {
    if (!str) return [];
    return str.split(',').map(s => s.trim()).filter(Boolean);
  }

  const menuChannel = await client.channels.fetch(TICKETS_MENU_CHANNEL_ID).catch(()=>null);
  if (!menuChannel) {
    console.error('❌ TICKETS_MENU_CHANNEL_ID introuvable');
    return;
  }

  async function ensureMenu() {
    let msg = null;
    if (state.ticketsMenuMessageId) {
      msg = await menuChannel.messages.fetch(state.ticketsMenuMessageId).catch(()=>null);
    }
    const embed = new EmbedBuilder()
      .setTitle('🎟️ | Ouvrir un ticket')
      .setDescription(
`**Information**
❓・Questions :
👉 Si vous avez des questions sur le crew ou besoin d’infos, c’est ici !

📝・Recrutement :
👉 Envie de rejoindre le Crew Street Aces ? Postulez ici !

🤝・Partenariats :
👉 Vous souhaitez établir un partenariat avec le crew ? Contactez-nous ici !

🆘・Help :
👉 Pour tout problème, signalement ou demande particulière (avertissement, conflit, etc.), ouvrez un ticket ici !`
      )
      .setColor(0x2b2d31);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket-menu')
      .setPlaceholder('📌 Choisis le type de ticket')
      .addOptions(
        { label: '❓ Questions', value: 'question', description: 'Obtenir une réponse du staff' },
        { label: '📝 Recrutement', value: 'recrutement', description: 'Postuler pour rejoindre le Crew' },
        { label: '🤝 Partenariats', value: 'partenariat', description: 'Proposer une collaboration' },
        { label: '🆘 Help', value: 'help', description: 'Signaler un problème' },
      );

    const row = new ActionRowBuilder().addComponents(menu);

    if (!msg) {
      const sent = await menuChannel.send({ embeds: [embed], components: [row] });
      state.ticketsMenuMessageId = sent.id;
      persist(state);
      console.log(`✅ Menu de tickets envoyé: ${sent.id}`);
    } else if (msg.components.length === 0) {
      await msg.edit({ embeds: [embed], components: [row] });
      console.log(`♻️ Menu de tickets réactivé`);
    }
  }

  await ensureMenu();

  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isStringSelectMenu()) return;
      if (interaction.customId !== 'ticket-menu') return;

      const type = interaction.values[0];
      const staffRoles = {
        question: parseRoles(TICKET_QUESTION_ROLES),
        recrutement: parseRoles(TICKET_RECRUTEMENT_ROLES),
        partenariat: parseRoles(TICKET_PARTENARIAT_ROLES),
        help: parseRoles(TICKET_HELP_ROLES),
      }[type];

      const name = `${type}-${interaction.user.username}`.toLowerCase().replace(/\s+/g,'-');

      const channel = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: TICKETS_CATEGORY_ID,
        topic: `opener:${interaction.user.id};type:${type}`,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ...staffRoles.map(rid => ({ id: rid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]})),
        ]
      });

      // 🎫 Message personnalisé selon le type
      let description = '';
      if (type === 'question') {
        description = `📌 **Ticket — Question**\n\nBonjour 👋\nUn membre de la direction sera en contact avec toi d’ici peu.\nEn attendant, installe-toi confortablement et explique-nous en détail ta question ou ta demande, afin que nous puissions te répondre efficacement. 📝`;
      } else if (type === 'recrutement') {
        description = `📝 **Ticket — Recrutement**\n\nBonjour 👋\nUn membre de la direction sera en contact avec toi d’ici peu.\nEn attendant, installe-toi et remplis le formulaire ci-dessous :\n\n• 🧍 Âge IRL :\n• 🎮 Expérience RP / CREW :\n• 🕒 Disponibilités en jeu :\n• 🗣️ Motivations pour rejoindre le crew :\n• ❓ Autres infos utiles (facultatif) :\n\nMerci de répondre avec le plus de détails possible afin de faciliter le traitement de ta candidature. 🚀`;
      } else if (type === 'partenariat') {
        description = `🤝 **Ticket — Partenariat**\n\nBonjour 👋\nUn membre de la direction sera en contact avec toi d’ici peu.\nEn attendant, installe-toi et réponds aux questions suivantes pour que nous puissions analyser ta proposition 👇\n\n• 📌 Nom de ton projet :\n• 👥 Communauté / audience actuelle :\n• 🎯 Ce que tu proposes comme partenariat :\n• ⚡ Les avantages pour les deux côtés :\n• 📢 Moyens de communication ou de promotion prévus :\n• 📎 Autres informations pertinentes :\n\nPlus ta présentation est claire et détaillée, plus le partenariat pourra être évalué rapidement. ✨`;
      } else if (type === 'help') {
        description = `🆘 **Ticket — Help / Support**\n\nBonjour 👋\nUn membre de la direction sera en contact avec toi d’ici peu.\nEn attendant, installe-toi et explique-nous précisément ton problème ou ta demande. 🛠️\n\nEssaie d’inclure un maximum de détails (type d’erreur, contexte, captures si possible…) pour que nous puissions t’aider efficacement. 🧠`;
      }

      const intro = new EmbedBuilder()
        .setTitle(`🎫 Ticket ${type}`)
        .setDescription(description)
        .setColor(0x5865F2);

      const btnClose = new ButtonBuilder().setCustomId('ticket-close').setLabel('Fermer le ticket').setStyle(ButtonStyle.Secondary);
      const btnDelete = new ButtonBuilder().setCustomId('ticket-delete').setLabel('Supprimer + Transcript').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(btnClose, btnDelete);

      await channel.send({
        content: staffRoles.length ? staffRoles.map(id=>`<@&${id}>`).join(' ') : null,
        embeds: [intro],
        components: [row]
      });

      const logs = await client.channels.fetch(TICKETS_LOGS_CHANNEL_ID).catch(()=>null);
      if (logs) {
        const logEmb = new EmbedBuilder()
          .setTitle('📥 Ticket ouvert')
          .addFields(
            { name: 'Auteur', value: `${interaction.user} (${interaction.user.tag})`, inline: true },
            { name: 'Type', value: type, inline: true },
            { name: 'Salon', value: `<#${channel.id}>`, inline: true }
          )
          .setTimestamp()
          .setColor(0x57F287);
        logs.send({ embeds: [logEmb] });
      }

      await interaction.reply({ content: `✅ Ticket créé : ${channel}`, ephemeral: true });
    } catch (e) {
      console.error('Ticket select error:', e);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!['ticket-close', 'ticket-delete'].includes(interaction.customId)) return;

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const logs = await client.channels.fetch(TICKETS_LOGS_CHANNEL_ID).catch(()=>null);

    if (interaction.customId === 'ticket-close') {
      const openerMatch = channel.topic?.match(/opener:(\d{17,20})/);
      const openerId = openerMatch?.[1];
      if (openerId) {
        try { await channel.permissionOverwrites.edit(openerId, { ViewChannel: false }); } catch {}
      }
      const emb = new EmbedBuilder().setTitle('🚪 Ticket fermé').setDescription(`Fermé par ${interaction.user}`).setColor(0xED4245).setTimestamp();
      if (logs) logs.send({ embeds: [emb] });
      await interaction.reply({ content: '✅ Ticket fermé (l’auteur n’a plus accès).', ephemeral: true });
    }

    if (interaction.customId === 'ticket-delete') {
      try {
        const attachment = await Transcripts.createTranscript(channel, {
          saveImages: true,
          poweredBy: false,
          returnBuffer: false,
          fileName: `transcript-${channel.id}.html`
        });
        if (logs) await logs.send({ content: `🧾 Transcript du ticket ${channel.name}`, files: [attachment] });
      } catch (e) {
        console.warn('⚠️ Transcript échoué:', e?.message);
      }
      await interaction.reply({ content: '🧨 Ticket supprimé.', ephemeral: true });
      setTimeout(()=> channel.delete().catch(()=>{}), 1500);
    }
  });
}
