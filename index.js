// ===============================
// Street Aces Bot — index.js (COMPLET)
// - Etat IG (embed + réactions, persistance)
// - /avert avec styles + rôles + exilé/ban
// - /etatmsg pour recréer l’embed d’état
// - Initialise le système de tickets (ticket.js)
// ===============================

import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  REST,
  Routes,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { initTickets } from './ticket.js';

// ===============================
// ⚙️ ENV
// ===============================
const {
  TOKEN,
  GUILD_ID,
  CHANNEL_ID,                // Salon pour l'état IG
  MESSAGE_ID,                // (optionnel) ID existant du message d'état
  BROADCAST_CHANNEL_ID,      // Salon d’annonce avertissements
  WARN_ROLE_1_ID,
  WARN_ROLE_2_ID,
  WARN_ROLE_3_ID,
  EXILED_ROLE_ID,
} = process.env;

if (!TOKEN) {
  console.error('❌ TOKEN manquant dans .env');
  process.exit(1);
}

// ===============================
// 🗂️ Persistences (state.json)
// ===============================
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
  } catch (e) {
    console.error('❌ Impossible de lire state.json', e);
    return {};
  }
}

function saveState(obj) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error('❌ Impossible d’écrire state.json', e);
  }
}

let state = loadState(); // { statusMessageId, ticketsMenuMessageId }

// ===============================
// 🤖 Client
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ===============================
/** 🧩 Slash Commands (ORDRE CORRIGÉ) */
// ===============================
const commands = [
  {
    name: 'avert',
    description: 'Donner un avertissement à un membre',
    default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
    options: [
      {
        name: 'membre',
        description: 'Membre à avertir',
        type: 6, // USER
        required: true
      },
      {
        name: 'niveau',
        description: 'Niveau (1, 2 ou 3)',
        type: 4, // INTEGER
        required: true,
        choices: [
          { name: '1 - Avertissement léger', value: 1 },
          { name: '2 - Avertissement sévère', value: 2 },
          { name: '3 - Avertissement critique', value: 3 }
        ]
      },
      {
        name: 'raison',
        description: 'Raison de l’avertissement',
        type: 3, // STRING
        required: true
      },
      {
        name: 'style',
        description: 'Style du message (facultatif)',
        type: 3, // STRING
        required: false,
        choices: [
          // Niv 1
          { name: 'Rappel 1 (niv.1)', value: 'rappel_1' },
          // Niv 2
          { name: 'Dernier rappel (niv.2)', value: 'dernier_rappel' },
          { name: 'Descente en grade (niv.2)', value: 'descente_en_grade_2' },
          // Niv 3
          { name: 'Exilé (niv.3)', value: 'exile' },
          { name: 'Bannissement (niv.3)', value: 'ban' },
          { name: 'Descente en grade (niv.3)', value: 'descente_en_grade_3' },
        ]
      }
    ]
  },
  {
    name: 'etatmsg',
    description: 'Récrée le message d’état IG dans le salon configuré',
    default_member_permissions: PermissionFlagsBits.ManageMessages.toString()
  }
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const app = await client.application.fetch();
  await rest.put(Routes.applicationGuildCommands(app.id, GUILD_ID), { body: commands });
  console.log('✅ Commandes slash enregistrées');
}

// ===============================
// 📍 Etat IG — helpers
// ===============================
function baseEtatEmbed() {
  return new EmbedBuilder()
    .setTitle('📍 État en ville')
    .setDescription(
      'Réagis pour mettre à jour ton état :\n' +
      '🟢 **En ville** | 🟡 **Ne pas déranger** | 🔴 **Hors ligne**'
    )
    .setColor(0x2f3136)
    .addFields(
      { name: '🟢 En ville', value: 'Personne', inline: true },
      { name: '🟡 Ne pas déranger', value: 'Personne', inline: true },
      { name: '🔴 Hors ligne', value: 'Personne', inline: true },
    );
}

async function ensureEtatMessage() {
  if (!CHANNEL_ID) {
    console.warn('⚠️ CHANNEL_ID manquant pour le message d’état.');
    return;
  }
  const channel = await client.channels.fetch(CHANNEL_ID).catch(()=>null);
  if (!channel) {
    console.error('❌ Salon CHANNEL_ID introuvable.');
    return;
  }

  let message = null;
  const knownId = state.statusMessageId || MESSAGE_ID;
  if (knownId) {
    message = await channel.messages.fetch(knownId).catch(()=>null);
  }

  if (!message) {
    const sent = await channel.send({ embeds: [baseEtatEmbed()] });
    try { await sent.react('🟢'); await sent.react('🟡'); await sent.react('🔴'); } catch {}
    state.statusMessageId = sent.id;
    saveState(state);
    console.log(`✅ Message état IG créé: ${sent.id}`);
    return sent;
  } else {
    // s'assurer que les réactions sont présentes
    const reactions = message.reactions.cache;
    const need = ['🟢','🟡','🔴'].filter(e=>!reactions.get(e));
    for (const e of need) { try { await message.react(e); } catch {} }
    if (!state.statusMessageId || state.statusMessageId !== message.id) {
      state.statusMessageId = message.id;
      saveState(state);
    }
    return message;
  }
}

function updateList(list, userId, present) {
  let arr = list.split('\n').filter(Boolean).filter(v=>v!=='Personne');
  arr = arr.filter(v => v !== `<@${userId}>`);
  if (present) arr.push(`<@${userId}>`);
  if (arr.length === 0) return 'Personne';
  arr = [...new Set(arr)];
  return arr.join('\n');
}

// ===============================
// 🧠 Ready
// ===============================
client.once('clientReady', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'Street Aces RP', type: ActivityType.Playing }],
    status: 'online'
  });

  await registerCommands();
  await ensureEtatMessage();

  // Tickets
  await initTickets(client, state, saveState);
});

// ===============================
// 🎯 Reactions Etat IG
// ===============================
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (!state.statusMessageId) return;
    await reaction.fetch().catch(()=>{});
    if (reaction.message.id !== state.statusMessageId) return;

    const msg = await reaction.message.channel.messages.fetch(state.statusMessageId);
    const embed = EmbedBuilder.from(msg.embeds[0] ?? baseEtatEmbed());
    const fields = embed.data.fields;

    let idx = null;
    if (reaction.emoji.name === '🟢') idx = 0;
    else if (reaction.emoji.name === '🟡') idx = 1;
    else if (reaction.emoji.name === '🔴') idx = 2;
    else return;

    // Retire l'user de toutes les colonnes
    fields[0].value = updateList(fields[0].value, user.id, false);
    fields[1].value = updateList(fields[1].value, user.id, false);
    fields[2].value = updateList(fields[2].value, user.id, false);

    // Ajoute dans la bonne colonne
    fields[idx].value = updateList(fields[idx].value, user.id, true);

    await msg.edit({ embeds: [embed] });
  } catch (e) {
    console.error('Etat IG add error:', e);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (!state.statusMessageId) return;
    await reaction.fetch().catch(()=>{});
    if (reaction.message.id !== state.statusMessageId) return;

    const msg = await reaction.message.channel.messages.fetch(state.statusMessageId);
    const embed = EmbedBuilder.from(msg.embeds[0] ?? baseEtatEmbed());
    const fields = embed.data.fields;

    // Retire l'user de toutes les colonnes
    fields[0].value = updateList(fields[0].value, user.id, false);
    fields[1].value = updateList(fields[1].value, user.id, false);
    fields[2].value = updateList(fields[2].value, user.id, false);

    await msg.edit({ embeds: [embed] });
  } catch (e) {
    console.error('Etat IG remove error:', e);
  }
});

// ===============================
// 🧾 Handler commandes
// ===============================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'etatmsg') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Permission insuffisante.', ephemeral: true });
    }
    const msg = await ensureEtatMessage();
    if (!msg) return interaction.reply({ content: '❌ Impossible de créer le message.', ephemeral: true });
    return interaction.reply({
      content: `✅ Message d’état prêt: https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${msg.id}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'avert') {
    const membre =
      interaction.options.getMember('membre') ??
      await interaction.guild.members.fetch(interaction.options.getUser('membre').id).catch(() => null);

    const niveau = interaction.options.getInteger('niveau');
    const raison = interaction.options.getString('raison');
    let style = interaction.options.getString('style');

    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });

    // Style par défaut selon le niveau
    if (!style) style = (niveau === 1) ? 'rappel_1' : (niveau === 2) ? 'dernier_rappel' : 'exile';

    // Vérifie compatibilité style/niveau
    const allowed = {
      1: ['rappel_1'],
      2: ['dernier_rappel', 'descente_en_grade_2'],
      3: ['exile', 'ban', 'descente_en_grade_3']
    };
    if (!allowed[niveau].includes(style)) {
      return interaction.reply({
        content: '❌ Style incompatible avec le niveau choisi.',
        ephemeral: true
      });
    }

    // Textes
    const templates = {
      1: {
        rappel_1: {
          title: `[Street Aces] – Avertissement 1`,
          desc: `Ceci est un simple rappel à l’ordre.\n**Raison :** ${raison}\n\nFais attention, nous n’en sommes qu’au premier avertissement.`
        }
      },
      2: {
        dernier_rappel: {
          title: `[Street Aces] – Avertissement 2 • Dernier rappel`,
          desc: `Tu viens de recevoir ton **deuxième avertissement**.\n**Raison :** ${raison}\n\nCeci est ton **dernier rappel**. À partir de maintenant, la moindre erreur pourra entraîner une sanction plus lourde.`
        },
        descente_en_grade_2: {
          title: `[Street Aces] – Avertissement 2 • Descente en grade`,
          desc: `Tu viens de recevoir ton **deuxième avertissement**.\n**Sanction :** descente en grade.\n**Raison :** ${raison}\n\nLa prochaine erreur pourrait t’écarter du Crew.`
        }
      },
      3: {
        exile: {
          title: `[Street Aces] – Avertissement 3 • Exilé`,
          desc: `Tu viens de recevoir ton **troisième avertissement**.\n**Sanction :** passage en rôle **EXILÉ** (perte totale de tes rôles).\n**Durée :** 1 à 3 semaines.\n**Raison :** ${raison}`
        },
        ban: {
          title: `[Street Aces] – Avertissement 3 • Bannissement`,
          desc: `Tu viens de recevoir ton **troisième avertissement**.\n**Sanction :** **Bannissement définitif** des Street Aces.\n**Raison :** ${raison}`
        },
        descente_en_grade_3: {
          title: `[Street Aces] – Avertissement 3 • Descente en grade`,
          desc: `Tu viens de recevoir ton **troisième avertissement**.\n**Sanction :** descente en grade **immédiate**.\n**Raison :** ${raison}\n\nUne nouvelle erreur pourrait signifier ton exclusion totale.`
        }
      }
    };

    const tpl = templates[niveau][style];

    // Application des rôles/sanctions
    try {
      if (niveau === 1 && WARN_ROLE_1_ID) await membre.roles.add(WARN_ROLE_1_ID);
      if (niveau === 2 && WARN_ROLE_2_ID) await membre.roles.add(WARN_ROLE_2_ID);
      if (niveau === 3) {
        // retire tous les rôles (sauf @everyone) puis exilé
        const rolesToKeep = new Set([interaction.guild.id]); // @everyone
        const toRemove = membre.roles.cache.filter(r => !rolesToKeep.has(r.id) && r.id !== EXILED_ROLE_ID);
        if (toRemove.size) await membre.roles.remove(toRemove);
        if (EXILED_ROLE_ID) await membre.roles.add(EXILED_ROLE_ID);
        if (style === 'ban') {
          await membre.ban({ reason: `Avert 3 — ${raison}` }).catch(e => console.warn('⚠️ Ban impossible:', e?.message));
        } else if (WARN_ROLE_3_ID) {
          await membre.roles.add(WARN_ROLE_3_ID).catch(()=>{});
        }
      }
    } catch (e) {
      console.warn('⚠️ Impossible d’appliquer les rôles:', e?.message);
    }

    // Envoi embeds
    const warnColor = (niveau === 1) ? 0xffd166 : (niveau === 2) ? 0xfca311 : 0xef233c;
    const embed = new EmbedBuilder()
      .setTitle(tpl.title)
      .setDescription([
        `**Membre :** ${membre}`,
        `**Niveau :** ${niveau}`,
        '',
        tpl.desc
      ].join('\n'))
      .setColor(warnColor)
      .setTimestamp();

    try { await interaction.reply({ embeds: [embed], ephemeral: true }); } catch {}
    try {
      if (BROADCAST_CHANNEL_ID) {
        const bc = await client.channels.fetch(BROADCAST_CHANNEL_ID).catch(()=>null);
        if (bc) await bc.send({ content: `${membre}`, embeds: [embed] });
      }
    } catch {}
  }
});

// ===============================
// 🚀 Start
// ===============================
client.login(TOKEN);
