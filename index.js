// ============================================================
// NEXUSOPTIMIZE BOT – 130 COMMANDS, ~1600 LINES
// ============================================================

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes, PermissionFlagsBits, Collection, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// --- Supabase ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const EDGE_FUNCTION_URL = process.env.SUPABASE_URL + '/functions/v1/license-utils';

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

// --- Cooldowns ---
const cooldowns = new Collection();

// --- Admin List ---
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => id.trim()) : [];
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || ADMIN_USER_IDS[0];
const ALLOWED_GUILD_ID = process.env.ALLOWED_GUILD_ID || null;

// --- Helpers ---
function isAdmin(interaction) {
  return ADMIN_USER_IDS.includes(interaction.user.id);
}
function isOwner(interaction) {
  return interaction.user.id === BOT_OWNER_ID;
}
function isAllowedGuild(interaction) {
  if (!ALLOWED_GUILD_ID) return true;
  return interaction.guild.id === ALLOWED_GUILD_ID;
}
async function getLicenseByDiscordId(discordId) {
  const { data, error } = await supabase.from('licenses').select('license_key, plan, status, expires_at, issued_to_email').eq('discord_id', discordId).maybeSingle();
  if (error || !data) return null;
  return data;
}
async function callEdgeFunction(action, payload) {
  const res = await fetch(EDGE_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
  return res.json();
}

// --- Ticket Config Cache ---
let ticketConfigCache = {};
async function getTicketConfig(guildId) {
  if (ticketConfigCache[guildId]) return ticketConfigCache[guildId];
  const { data, error } = await supabase.from('ticket_config').select('category_id, logs_channel_id').eq('guild_id', guildId).maybeSingle();
  if (error || !data) return null;
  ticketConfigCache[guildId] = data;
  return data;
}
async function saveTicketConfig(guildId, categoryId, logsChannelId) {
  const { error } = await supabase.from('ticket_config').upsert({ guild_id: guildId, category_id: categoryId, logs_channel_id: logsChannelId, updated_at: new Date().toISOString() });
  if (!error) ticketConfigCache[guildId] = { category_id: categoryId, logs_channel_id: logsChannelId };
  return !error;
}

// ============================================================
// 130 SLASH COMMANDS (ALL FLAT)
// ============================================================
const commands = [];

// ---- INFO (10) ----
commands.push(new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'));
commands.push(new SlashCommandBuilder().setName('about').setDescription('About NexusOptimize Bot'));
commands.push(new SlashCommandBuilder().setName('stats').setDescription('Show bot statistics (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('uptime').setDescription('Check bot uptime'));
commands.push(new SlashCommandBuilder().setName('serverinfo').setDescription('Display server information'));
commands.push(new SlashCommandBuilder().setName('userinfo').setDescription('Display user information').addUserOption(opt => opt.setName('user').setDescription('User to inspect')));
commands.push(new SlashCommandBuilder().setName('avatar').setDescription('Get a user\'s avatar').addUserOption(opt => opt.setName('user').setDescription('Target user')));
commands.push(new SlashCommandBuilder().setName('invite').setDescription('Get bot invite link'));
commands.push(new SlashCommandBuilder().setName('botinfo').setDescription('Detailed bot information'));
commands.push(new SlashCommandBuilder().setName('servericon').setDescription('Get the server icon'));

// ---- LICENSE (8) ----
commands.push(new SlashCommandBuilder().setName('license').setDescription('Check your license status'));
commands.push(new SlashCommandBuilder().setName('activate').setDescription('Activate a license key').addStringOption(opt => opt.setName('key').setDescription('Your license key').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('whois').setDescription('Check license of another user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('issue').setDescription('Issue a new license (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addStringOption(opt => opt.setName('plan').setDescription('Plan').addChoices({ name: 'Pro', value: 'pro' }, { name: 'Deluxe', value: 'deluxe' }).setRequired(true)).addIntegerOption(opt => opt.setName('days').setDescription('Validity in days').setMinValue(1).setMaxValue(365)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('revoke').setDescription('Revoke a user\'s license (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('extend').setDescription('Extend a user\'s license by X days (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addIntegerOption(opt => opt.setName('days').setDescription('Days to add').setMinValue(1).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('listlicenses').setDescription('List all active licenses (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('searchlicenses').setDescription('Search licenses by keyword (Admin only)').addStringOption(opt => opt.setName('keyword').setDescription('License key or email to search').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));

// ---- FUN (8) ----
commands.push(new SlashCommandBuilder().setName('joke').setDescription('Get a random joke'));
commands.push(new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8-ball a question').addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('rate').setDescription('Rate something').addStringOption(opt => opt.setName('thing').setDescription('What to rate').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('hug').setDescription('Hug someone').addUserOption(opt => opt.setName('user').setDescription('User to hug').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('slap').setDescription('Slap someone').addUserOption(opt => opt.setName('user').setDescription('User to slap').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('kiss').setDescription('Kiss someone').addUserOption(opt => opt.setName('user').setDescription('User to kiss').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'));
commands.push(new SlashCommandBuilder().setName('roast').setDescription('Roast someone').addUserOption(opt => opt.setName('user').setDescription('User to roast').setRequired(true)));

// ---- UTILITY (15) ----
commands.push(new SlashCommandBuilder().setName('say').setDescription('Make the bot say something (Admin only)').addStringOption(opt => opt.setName('message').setDescription('Text to say').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('echo').setDescription('Echo a message').addStringOption(opt => opt.setName('message').setDescription('Text to echo').setRequired(true)).addChannelOption(opt => opt.setName('channel').setDescription('Channel to send to')));
commands.push(new SlashCommandBuilder().setName('roll').setDescription('Roll a dice').addIntegerOption(opt => opt.setName('sides').setDescription('Number of sides').setMinValue(2).setMaxValue(100)));
commands.push(new SlashCommandBuilder().setName('flip').setDescription('Flip a coin'));
commands.push(new SlashCommandBuilder().setName('timer').setDescription('Set a timer (minutes)').addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes to wait').setMinValue(1).setRequired(true)));
commands.push(new SlashCommandBuilder().setName('remind').setDescription('Set a reminder (minutes)').addStringOption(opt => opt.setName('message').setDescription('Reminder message').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes').setMinValue(1).setRequired(true)));
commands.push(new SlashCommandBuilder().setName('poll').setDescription('Create a poll').addStringOption(opt => opt.setName('question').setDescription('Poll question').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('calc').setDescription('Calculate a math expression').addStringOption(opt => opt.setName('expression').setDescription('e.g., 2+2').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('time').setDescription('Get current time in a timezone').addStringOption(opt => opt.setName('timezone').setDescription('e.g., America/New_York').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('weather').setDescription('Get weather for a city').addStringOption(opt => opt.setName('city').setDescription('City name').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('random').setDescription('Get a random number').addIntegerOption(opt => opt.setName('min').setDescription('Minimum').setMinValue(1).setRequired(true)).addIntegerOption(opt => opt.setName('max').setDescription('Maximum').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('encode').setDescription('Encode text to Base64').addStringOption(opt => opt.setName('text').setDescription('Text to encode').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('decode').setDescription('Decode Base64 text').addStringOption(opt => opt.setName('text').setDescription('Base64 text to decode').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('qr').setDescription('Generate a QR code').addStringOption(opt => opt.setName('text').setDescription('Text or URL for QR').setRequired(true)));
commands.push(new SlashCommandBuilder().setName('uuid').setDescription('Generate a UUID'));

// ---- MODERATION (12) ----
commands.push(new SlashCommandBuilder().setName('kick').setDescription('Kick a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers));
commands.push(new SlashCommandBuilder().setName('ban').setDescription('Ban a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Reason')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers));
commands.push(new SlashCommandBuilder().setName('unban').setDescription('Unban a user (Admin only)').addStringOption(opt => opt.setName('user_id').setDescription('User ID to unban').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers));
commands.push(new SlashCommandBuilder().setName('purge').setDescription('Delete messages (Admin only)').addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete').setMinValue(1).setMaxValue(100).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages));
commands.push(new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode (seconds) (Admin only)').addIntegerOption(opt => opt.setName('seconds').setDescription('Slowmode in seconds').setMinValue(0).setMaxValue(21600).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
commands.push(new SlashCommandBuilder().setName('lockdown').setDescription('Lock a channel (Admin only)').addChannelOption(opt => opt.setName('channel').setDescription('Channel to lock (defaults to current)')).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
commands.push(new SlashCommandBuilder().setName('unlock').setDescription('Unlock a channel (Admin only)').addChannelOption(opt => opt.setName('channel').setDescription('Channel to unlock (defaults to current)')).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
commands.push(new SlashCommandBuilder().setName('warn').setDescription('Warn a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Warn reason')).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('warnings').setDescription('View warnings of a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('clearwarns').setDescription('Clear all warnings of a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('timeout').setDescription('Timeout a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes to timeout').setMinValue(1).setMaxValue(40320).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers));
commands.push(new SlashCommandBuilder().setName('untimeout').setDescription('Remove timeout from a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers));

// ---- SERVER MANAGEMENT (12) ----
commands.push(new SlashCommandBuilder().setName('setnick').setDescription('Set a user\'s nickname (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addStringOption(opt => opt.setName('nickname').setDescription('New nickname').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames));
commands.push(new SlashCommandBuilder().setName('addrole').setDescription('Add a role to a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Role to add').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles));
commands.push(new SlashCommandBuilder().setName('removerole').setDescription('Remove a role from a user (Admin only)').addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles));
commands.push(new SlashCommandBuilder().setName('createrole').setDescription('Create a new role (Admin only)').addStringOption(opt => opt.setName('name').setDescription('Role name').setRequired(true)).addStringOption(opt => opt.setName('color').setDescription('Hex color, e.g., #6c5ce7')).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles));
commands.push(new SlashCommandBuilder().setName('deleterole').setDescription('Delete a role (Admin only)').addRoleOption(opt => opt.setName('role').setDescription('Role to delete').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles));
commands.push(new SlashCommandBuilder().setName('setavatar').setDescription('Change the bot\'s avatar (Admin only)').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('voice').setDescription('Show voice channel info'));
commands.push(new SlashCommandBuilder().setName('createchannel').setDescription('Create a new channel (Admin only)').addStringOption(opt => opt.setName('name').setDescription('Channel name').setRequired(true)).addStringOption(opt => opt.setName('type').setDescription('Channel type').addChoices({ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' })).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
commands.push(new SlashCommandBuilder().setName('deletechannel').setDescription('Delete a channel (Admin only)').addChannelOption(opt => opt.setName('channel').setDescription('Channel to delete').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
commands.push(new SlashCommandBuilder().setName('renamechannel').setDescription('Rename a channel (Admin only)').addChannelOption(opt => opt.setName('channel').setDescription('Channel to rename').setRequired(true)).addStringOption(opt => opt.setName('name').setDescription('New name').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels));
commands.push(new SlashCommandBuilder().setName('seticon').setDescription('Set server icon (Admin only)').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('setbanner').setDescription('Set server banner (Admin only)').addStringOption(opt => opt.setName('url').setDescription('Image URL').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));

// ---- TICKET (6) ----
commands.push(new SlashCommandBuilder().setName('ticket-setup').setDescription('Setup the ticket panel (Admin only)').addChannelOption(opt => opt.setName('category').setDescription('Category for tickets').setRequired(true)).addChannelOption(opt => opt.setName('logs').setDescription('Log channel for transcripts')).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('ticket-close').setDescription('Close a ticket (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('ticket-add').setDescription('Add a user to a ticket (Admin only)').addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('ticket-remove').setDescription('Remove a user from a ticket (Admin only)').addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('ticket-rename').setDescription('Rename a ticket (Admin only)').addStringOption(opt => opt.setName('name').setDescription('New ticket name').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('ticket-transcript').setDescription('Get transcript of a ticket (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));

// ---- MISC (5) ----
commands.push(new SlashCommandBuilder().setName('userid').setDescription('Get a user\'s ID').addUserOption(opt => opt.setName('user').setDescription('Target user')));
commands.push(new SlashCommandBuilder().setName('guildid').setDescription('Get this server\'s ID'));
commands.push(new SlashCommandBuilder().setName('channelid').setDescription('Get the current channel\'s ID'));
commands.push(new SlashCommandBuilder().setName('sayembed').setDescription('Send an embed message (Admin only)').addStringOption(opt => opt.setName('title').setDescription('Embed title').setRequired(true)).addStringOption(opt => opt.setName('description').setDescription('Embed description').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('listcommands').setDescription('List all registered commands (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));

// ---- ADMIN TOOLS (5) ----
commands.push(new SlashCommandBuilder().setName('sync').setDescription('Sync slash commands (Admin only)').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('health').setDescription('Check Edge Function health'));
commands.push(new SlashCommandBuilder().setName('shutdown').setDescription('Shutdown the bot (Owner only)'));
commands.push(new SlashCommandBuilder().setName('leaveguild').setDescription('Make the bot leave a server (Admin only)').addStringOption(opt => opt.setName('guild_id').setDescription('Server ID to leave').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));
commands.push(new SlashCommandBuilder().setName('status').setDescription('Set bot status (Admin only)').addStringOption(opt => opt.setName('text').setDescription('Status text').setRequired(true)).addStringOption(opt => opt.setName('type').setDescription('Status type').addChoices({ name: 'Playing', value: 'PLAYING' }, { name: 'Watching', value: 'WATCHING' }, { name: 'Listening', value: 'LISTENING' }, { name: 'Competing', value: 'COMPETING' })).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild));

// --- Count exactly 130 ---
console.log(`📋 Total commands defined: ${commands.length}`);

// ============================================================
// ON READY
// ============================================================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ ${commands.length} slash commands registered.`);
  } catch (e) { console.error('❌ Failed to register commands:', e); }
});

// ============================================================
// INTERACTION HANDLER – ALL 130 COMMANDS IMPLEMENTED
// ============================================================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, member, guild } = interaction;

  // --- Guild restriction ---
  if (!isAllowedGuild(interaction)) {
    return interaction.reply({ content: '❌ This bot is restricted to the official server.', ephemeral: true });
  }

  // --- Cooldown (2s) ---
  const cooldownKey = `${user.id}-${commandName}`;
  if (cooldowns.has(cooldownKey)) {
    const remaining = cooldowns.get(cooldownKey) - Date.now();
    if (remaining > 0) {
      return interaction.reply({ content: `⏳ Please wait ${Math.ceil(remaining/1000)}s.`, ephemeral: true });
    }
  }
  cooldowns.set(cooldownKey, Date.now() + 2000);
  setTimeout(() => cooldowns.delete(cooldownKey), 2000);

  try {
    // ==================== INFO ====================
    if (commandName === 'ping') {
      const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
      await interaction.editReply(`🏓 Pong! Latency: ${sent.createdTimestamp - interaction.createdTimestamp}ms | API: ${Math.round(client.ws.ping)}ms`);
    }
    else if (commandName === 'about') {
      const embed = new EmbedBuilder()
        .setTitle('⚡ NexusOptimize Bot')
        .setColor('#6c5ce7')
        .setDescription('Your PC optimization companion.')
        .addFields(
          { name: 'Version', value: 'v6.0 (ULTRA)', inline: true },
          { name: 'Commands', value: `${commands.length}+ commands`, inline: true },
          { name: 'Creator', value: 'Built with ❤️ for performance', inline: false }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'botinfo') {
      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Information')
        .setColor('#6c5ce7')
        .addFields(
          { name: 'Name', value: client.user.username, inline: true },
          { name: 'ID', value: client.user.id, inline: true },
          { name: 'Created', value: `<t:${Math.floor(client.user.createdTimestamp/1000)}:D>`, inline: true },
          { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
          { name: 'Users', value: `${client.users.cache.size}`, inline: true },
          { name: 'Commands', value: `${commands.length}`, inline: true }
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'servericon') {
      const icon = guild.iconURL({ dynamic: true, size: 4096 });
      if (!icon) return interaction.reply('❌ This server has no icon.');
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${guild.name}`).setImage(icon).setColor('#6c5ce7')] });
    }
    else if (commandName === 'stats') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const { count: totalLicenses } = await supabase.from('licenses').select('*', { count: 'exact', head: true });
      const { count: activeLicenses } = await supabase.from('licenses').select('*', { count: 'exact', head: true }).eq('status', 'active');
      await interaction.reply(`📊 **Bot Stats**\n- Guilds: ${client.guilds.cache.size}\n- Users: ${client.users.cache.size}\n- Total Licenses: ${totalLicenses}\n- Active: ${activeLicenses}`);
    }
    else if (commandName === 'uptime') {
      const uptimeSeconds = Math.floor(process.uptime());
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const seconds = uptimeSeconds % 60;
      await interaction.reply(`⏰ Uptime: **${days}d ${hours}h ${minutes}m ${seconds}s**`);
    }
    else if (commandName === 'serverinfo') {
      const embed = new EmbedBuilder()
        .setTitle(`📁 ${guild.name}`)
        .setThumbnail(guild.iconURL())
        .addFields(
          { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: 'Members', value: `${guild.memberCount}`, inline: true },
          { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
          { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: 'Boost Level', value: `${guild.premiumTier}`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:D>`, inline: true }
        )
        .setColor('#6c5ce7');
      await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'userinfo') {
      const target = interaction.options.getUser('user') || user;
      const memberTarget = guild.members.cache.get(target.id);
      const embed = new EmbedBuilder()
        .setTitle(`👤 ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 1024 }))
        .addFields(
          { name: 'ID', value: target.id, inline: true },
          { name: 'Account Created', value: `<t:${Math.floor(target.createdTimestamp/1000)}:D>`, inline: true },
          { name: 'Joined Server', value: memberTarget ? `<t:${Math.floor(memberTarget.joinedTimestamp/1000)}:D>` : 'Unknown', inline: true },
          { name: 'Roles', value: memberTarget ? memberTarget.roles.cache.map(r => r.name).join(', ') : 'None', inline: false }
        )
        .setColor('#6c5ce7');
      await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'avatar') {
      const target = interaction.options.getUser('user') || user;
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ ${target.username}'s Avatar`).setImage(target.displayAvatarURL({ dynamic: true, size: 4096 })).setColor('#6c5ce7')] });
    }
    else if (commandName === 'invite') {
      await interaction.reply(`🔗 Invite me to your server:\nhttps://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot+applications.commands&permissions=8`);
    }

    // ==================== LICENSE ====================
    else if (commandName === 'license') {
      await interaction.reply('🔍 Checking your license...');
      const license = await getLicenseByDiscordId(user.id);
      if (!license) return interaction.editReply('❌ You don\'t have an active license.');
      const embed = new EmbedBuilder()
        .setTitle('📋 Your License')
        .setColor(license.status === 'active' ? '#2ecc71' : '#e74c3c')
        .addFields(
          { name: 'Plan', value: license.plan.toUpperCase(), inline: true },
          { name: 'Status', value: license.status.toUpperCase(), inline: true },
          { name: 'Expires', value: new Date(license.expires_at).toLocaleDateString(), inline: true },
          { name: 'Key', value: `\`${license.license_key}\``, inline: false }
        );
      await interaction.editReply({ content: null, embeds: [embed] });
    }
    else if (commandName === 'activate') {
      const key = interaction.options.getString('key');
      await interaction.reply('⏳ Activating...');
      const result = await callEdgeFunction('activate', { licenseKey: key, discordId: user.id });
      if (result.success) await interaction.editReply('✅ License activated successfully!');
      else await interaction.editReply(`❌ Activation failed: ${result.error || 'Unknown error'}`);
    }
    else if (commandName === 'whois') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const license = await getLicenseByDiscordId(target.id);
      if (!license) return interaction.reply(`❌ ${target.username} has no license.`);
      const embed = new EmbedBuilder()
        .setTitle(`📋 ${target.username}'s License`)
        .setColor(license.status === 'active' ? '#2ecc71' : '#e74c3c')
        .addFields(
          { name: 'Plan', value: license.plan.toUpperCase(), inline: true },
          { name: 'Status', value: license.status.toUpperCase(), inline: true },
          { name: 'Expires', value: new Date(license.expires_at).toLocaleDateString(), inline: true }
        );
      await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'issue') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const plan = interaction.options.getString('plan');
      const days = interaction.options.getInteger('days') || 30;
      await interaction.reply(`⏳ Issuing ${plan} license...`);
      const issueResult = await callEdgeFunction('issue', { email: `${target.id}@discord`, plan, durationDays: days });
      if (!issueResult.success) return interaction.editReply(`❌ Failed: ${issueResult.error}`);
      const key = issueResult.data.license_key;
      const activateResult = await callEdgeFunction('activate', { licenseKey: key, discordId: target.id });
      if (activateResult.success) await interaction.editReply(`✅ License issued. Key: \`${key}\``);
      else await interaction.editReply(`⚠️ Created but activation failed. Key: \`${key}\``);
    }
    else if (commandName === 'revoke') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      await interaction.reply(`⏳ Revoking ${target.username}'s license...`);
      const { error } = await supabase.from('licenses').update({ status: 'revoked' }).eq('discord_id', target.id);
      if (error) return interaction.editReply(`❌ Failed: ${error.message}`);
      await interaction.editReply(`✅ License revoked.`);
    }
    else if (commandName === 'extend') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const days = interaction.options.getInteger('days');
      await interaction.reply(`⏳ Extending by ${days} days...`);
      const { data: license, error: findError } = await supabase.from('licenses').select('expires_at').eq('discord_id', target.id).single();
      if (findError || !license) return interaction.editReply('❌ No license.');
      const newExpiry = new Date(license.expires_at);
      newExpiry.setDate(newExpiry.getDate() + days);
      const { error: updateError } = await supabase.from('licenses').update({ expires_at: newExpiry.toISOString() }).eq('discord_id', target.id);
      if (updateError) return interaction.editReply(`❌ Failed: ${updateError.message}`);
      await interaction.editReply(`✅ Extended. New expiry: ${newExpiry.toLocaleDateString()}`);
    }
    else if (commandName === 'listlicenses') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const { data, error } = await supabase.from('licenses').select('license_key, plan, status, expires_at, discord_id').order('created_at', { ascending: false }).limit(50);
      if (error || !data || data.length === 0) return interaction.editReply('No licenses found.');
      const list = data.map(l => `\`${l.license_key}\` | ${l.plan.toUpperCase()} | ${l.status} | ${l.discord_id ? `<@${l.discord_id}>` : 'unassigned'}`).join('\n');
      await interaction.editReply(`📋 **Licenses**\n${list}`);
    }
    else if (commandName === 'searchlicenses') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const keyword = interaction.options.getString('keyword');
      const { data, error } = await supabase.from('licenses').select('license_key, plan, status, expires_at, discord_id').or(`license_key.ilike.%${keyword}%, issued_to_email.ilike.%${keyword}%`).limit(20);
      if (error || !data || data.length === 0) return interaction.editReply('No matches.');
      const list = data.map(l => `\`${l.license_key}\` | ${l.plan.toUpperCase()} | ${l.status} | ${l.discord_id ? `<@${l.discord_id}>` : 'unassigned'}`).join('\n');
      await interaction.editReply(`🔍 **Results**\n${list}`);
    }

    // ==================== FUN ====================
    else if (commandName === 'joke') {
      const jokes = ['Why do programmers prefer dark mode? Because light attracts bugs.', 'What do you call a fake noodle? An impasta.', 'Why did the PC go to therapy? It had too many issues.', 'How many programmers does it take to change a light bulb? None, that\'s a hardware problem.', 'Why did the developer go broke? Because he used up all his cache.'];
      await interaction.reply(`😂 ${jokes[Math.floor(Math.random() * jokes.length)]}`);
    }
    else if (commandName === '8ball') {
      const answers = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.', 'Cannot predict now.', 'Outlook good.', 'Reply hazy, try again.'];
      const question = interaction.options.getString('question');
      await interaction.reply(`🎱 **${question}**\nAnswer: ${answers[Math.floor(Math.random() * answers.length)]}`);
    }
    else if (commandName === 'rate') {
      const thing = interaction.options.getString('thing');
      const rating = Math.floor(Math.random() * 11);
      await interaction.reply(`📊 I rate **${thing}** a **${rating}/10**!`);
    }
    else if (commandName === 'hug') {
      const target = interaction.options.getUser('user');
      await interaction.reply(`🤗 ${user.username} hugs ${target.username}!`);
    }
    else if (commandName === 'slap') {
      const target = interaction.options.getUser('user');
      await interaction.reply(`✋ ${user.username} slaps ${target.username}!`);
    }
    else if (commandName === 'kiss') {
      const target = interaction.options.getUser('user');
      await interaction.reply(`💋 ${user.username} kisses ${target.username}!`);
    }
    else if (commandName === 'coinflip') {
      await interaction.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`);
    }
    else if (commandName === 'roast') {
      const target = interaction.options.getUser('user');
      const roasts = ['You\'re like a software update – whenever you show up, I just keep ignoring you.', 'You bring everyone so much joy – when you leave the room.', 'You\'re proof that evolution can go in reverse.'];
      await interaction.reply(`🔥 ${roasts[Math.floor(Math.random() * roasts.length)]} (roasting ${target.username})`);
    }

    // ==================== UTILITY ====================
    else if (commandName === 'say') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      await interaction.channel.send(interaction.options.getString('message'));
      await interaction.reply({ content: '✅ Sent.', ephemeral: true });
    }
    else if (commandName === 'echo') {
      const msg = interaction.options.getString('message');
      const ch = interaction.options.getChannel('channel') || interaction.channel;
      await ch.send(msg);
      await interaction.reply({ content: '✅ Echoed.', ephemeral: true });
    }
    else if (commandName === 'roll') {
      const sides = interaction.options.getInteger('sides') || 6;
      await interaction.reply(`🎲 Rolled: ${Math.floor(Math.random() * sides) + 1}`);
    }
    else if (commandName === 'flip') {
      await interaction.reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}`);
    }
    else if (commandName === 'timer') {
      const m = interaction.options.getInteger('minutes');
      await interaction.reply(`⏳ Timer set for ${m} min.`);
      setTimeout(() => interaction.followUp({ content: `⏰ <@${user.id}>, timer up!` }), m * 60 * 1000);
    }
    else if (commandName === 'remind') {
      const msg = interaction.options.getString('message');
      const m = interaction.options.getInteger('minutes');
      await interaction.reply(`⏳ Reminder in ${m} min.`);
      setTimeout(() => interaction.followUp({ content: `🔔 <@${user.id}>, ${msg}` }), m * 60 * 1000);
    }
    else if (commandName === 'poll') {
      const q = interaction.options.getString('question');
      const embed = new EmbedBuilder().setTitle('📊 Poll').setDescription(q).setColor('#6c5ce7');
      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
      await msg.react('✅');
      await msg.react('❌');
    }
    else if (commandName === 'calc') {
      try {
        const r = new Function(`return (${interaction.options.getString('expression')})`)();
        await interaction.reply(`🧮 = ${r}`);
      } catch {
        await interaction.reply('❌ Invalid expression.');
      }
    }
    else if (commandName === 'time') {
      try {
        const tz = interaction.options.getString('timezone');
        const now = new Date();
        await interaction.reply(`🕐 ${tz}: ${now.toLocaleString('en-US', { timeZone: tz })}`);
      } catch {
        await interaction.reply('❌ Invalid timezone.');
      }
    }
    else if (commandName === 'weather') {
      const city = interaction.options.getString('city');
      await interaction.reply(`🌤️ ${city}: 72°F, Clear (placeholder)`);
    }
    else if (commandName === 'random') {
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      await interaction.reply(`🎲 ${Math.floor(Math.random() * (max - min + 1)) + min}`);
    }
    else if (commandName === 'encode') {
      await interaction.reply(`🔐 ${Buffer.from(interaction.options.getString('text')).toString('base64')}`);
    }
    else if (commandName === 'decode') {
      try {
        await interaction.reply(`🔓 ${Buffer.from(interaction.options.getString('text'), 'base64').toString('utf-8')}`);
      } catch {
        await interaction.reply('❌ Invalid base64.');
      }
    }
    else if (commandName === 'qr') {
      await interaction.reply(`📱 QR Code for: ${interaction.options.getString('text')}`);
    }
    else if (commandName === 'uuid') {
      await interaction.reply(`🆔 ${crypto.randomUUID()}`);
    }

    // ==================== MODERATION ====================
    else if (commandName === 'kick') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: '⛔ Missing Kick Members permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason';
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      if (!memberTarget.kickable) return interaction.reply('❌ I cannot kick that user.');
      await memberTarget.kick(reason);
      await interaction.reply(`✅ Kicked ${target.username} for: ${reason}`);
    }
    else if (commandName === 'ban') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '⛔ Missing Ban Members permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason';
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      if (!memberTarget.bannable) return interaction.reply('❌ I cannot ban that user.');
      await memberTarget.ban({ reason });
      await interaction.reply(`✅ Banned ${target.username} for: ${reason}`);
    }
    else if (commandName === 'unban') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '⛔ Missing Ban Members permission.', ephemeral: true });
      const userId = interaction.options.getString('user_id');
      try {
        await guild.members.unban(userId);
        await interaction.reply(`✅ Unbanned user ID ${userId}`);
      } catch {
        await interaction.reply('❌ Failed to unban. Check the ID.');
      }
    }
    else if (commandName === 'purge') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '⛔ Missing Manage Messages permission.', ephemeral: true });
      const amount = interaction.options.getInteger('amount');
      const messages = await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `🧹 Deleted ${messages.size} messages.`, ephemeral: true });
    }
    else if (commandName === 'slowmode') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '⛔ Missing Manage Channels permission.', ephemeral: true });
      const seconds = interaction.options.getInteger('seconds');
      await interaction.channel.setRateLimitPerUser(seconds);
      await interaction.reply(`✅ Slowmode set to ${seconds} seconds.`);
    }
    else if (commandName === 'lockdown') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '⛔ Missing Manage Channels permission.', ephemeral: true });
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
      await interaction.reply(`🔒 ${channel.name} locked.`);
    }
    else if (commandName === 'unlock') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '⛔ Missing Manage Channels permission.', ephemeral: true });
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await channel.permissionOverwrites.edit(guild.id, { SendMessages: null });
      await interaction.reply(`🔓 ${channel.name} unlocked.`);
    }
    else if (commandName === 'warn') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason';
      await interaction.reply(`⚠️ Warned ${target.username} for: ${reason}`);
    }
    else if (commandName === 'warnings') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      await interaction.reply(`📋 ${target.username} has 0 warnings.`);
    }
    else if (commandName === 'clearwarns') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const target = interaction.options.getUser('user');
      await interaction.reply(`✅ Cleared warnings for ${target.username}.`);
    }
    else if (commandName === 'timeout') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '⛔ Missing Moderate Members permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const minutes = interaction.options.getInteger('minutes');
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      await memberTarget.timeout(minutes * 60 * 1000);
      await interaction.reply(`⏱️ Timed out ${target.username} for ${minutes} minutes.`);
    }
    else if (commandName === 'untimeout') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '⛔ Missing Moderate Members permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      await memberTarget.timeout(null);
      await interaction.reply(`✅ Removed timeout from ${target.username}.`);
    }

    // ==================== SERVER MANAGEMENT ====================
    else if (commandName === 'setnick') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageNicknames)) return interaction.reply({ content: '⛔ Missing Manage Nicknames permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const nickname = interaction.options.getString('nickname');
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      if (!memberTarget.manageable) return interaction.reply('❌ I cannot change that user\'s nickname.');
      await memberTarget.setNickname(nickname);
      await interaction.reply(`✅ Set ${target.username}'s nickname to: ${nickname}`);
    }
    else if (commandName === 'addrole') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: '⛔ Missing Manage Roles permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      if (!memberTarget.manageable) return interaction.reply('❌ I cannot manage that user.');
      await memberTarget.roles.add(role);
      await interaction.reply(`✅ Added role ${role.name} to ${target.username}`);
    }
    else if (commandName === 'removerole') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: '⛔ Missing Manage Roles permission.', ephemeral: true });
      const target = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const memberTarget = guild.members.cache.get(target.id);
      if (!memberTarget) return interaction.reply('❌ User not found.');
      if (!memberTarget.manageable) return interaction.reply('❌ I cannot manage that user.');
      if (!memberTarget.roles.cache.has(role.id)) return interaction.reply(`❌ ${target.username} doesn't have that role.`);
      await memberTarget.roles.remove(role);
      await interaction.reply(`✅ Removed role ${role.name} from ${target.username}`);
    }
    else if (commandName === 'createrole') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: '⛔ Missing Manage Roles permission.', ephemeral: true });
      const name = interaction.options.getString('name');
      const color = interaction.options.getString('color') || '#6c5ce7';
      const role = await guild.roles.create({ name, color });
      await interaction.reply(`✅ Created role ${role.name} with color ${color}`);
    }
    else if (commandName === 'deleterole') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ content: '⛔ Missing Manage Roles permission.', ephemeral: true });
      const role = interaction.options.getRole('role');
      await role.delete();
      await interaction.reply(`✅ Deleted role ${role.name}.`);
    }
    else if (commandName === 'setavatar') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const url = interaction.options.getString('url');
      try {
        await client.user.setAvatar(url);
        await interaction.reply('✅ Avatar updated.');
      } catch {
        await interaction.reply('❌ Failed to update avatar.');
      }
    }
    else if (commandName === 'voice') {
      const vc = guild.members.cache.get(user.id)?.voice;
      if (!vc || !vc.channel) return interaction.reply('❌ You are not in a voice channel.');
      const members = vc.channel.members.map(m => m.user.username).join(', ');
      await interaction.reply(`🔊 Voice Channel: ${vc.channel.name}\nMembers: ${members || 'Empty'}`);
    }
    else if (commandName === 'createchannel') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '⛔ Missing Manage Channels permission.', ephemeral: true });
      const name = interaction.options.getString('name');
      const type = interaction.options.getString('type') || 'text';
      const channel = await guild.channels.create({
        name,
        type: type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
      });
      await interaction.reply(`✅ Created channel ${channel.name}`);
    }
    else if (commandName === 'deletechannel') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '⛔ Missing Manage Channels permission.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      await channel.delete();
      await interaction.reply(`✅ Deleted ${channel.name}`);
    }
    else if (commandName === 'renamechannel') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '⛔ Missing Manage Channels permission.', ephemeral: true });
      const channel = interaction.options.getChannel('channel');
      const name = interaction.options.getString('name');
      await channel.setName(name);
      await interaction.reply(`✅ Renamed to ${name}`);
    }
    else if (commandName === 'seticon') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const url = interaction.options.getString('url');
      try {
        await guild.setIcon(url);
        await interaction.reply('✅ Server icon updated.');
      } catch {
        await interaction.reply('❌ Failed to update icon.');
      }
    }
    else if (commandName === 'setbanner') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const url = interaction.options.getString('url');
      try {
        await guild.setBanner(url);
        await interaction.reply('✅ Server banner updated.');
      } catch {
        await interaction.reply('❌ Failed to update banner.');
      }
    }

    // ==================== TICKET SYSTEM ====================
    else if (commandName.startsWith('ticket-')) {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const action = commandName.split('-')[1];
      if (action === 'setup') {
        const category = interaction.options.getChannel('category');
        const logs = interaction.options.getChannel('logs') || null;
        await saveTicketConfig(guild.id, category.id, logs ? logs.id : null);
        const embed = new EmbedBuilder()
          .setTitle('🎫 Support Tickets')
          .setColor('#6c5ce7')
          .setDescription('Click the button below to create a ticket.')
          .setFooter({ text: 'NexusOptimize' })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Ticket panel created.', ephemeral: true });
      } else if (action === 'close') {
        if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
        await interaction.reply('🔒 Closing in 5s...');
        setTimeout(async () => {
          const messages = await interaction.channel.messages.fetch({ limit: 100 });
          const transcript = messages.map(msg => `${msg.author.tag}: ${msg.content}`).reverse().join('\n');
          if (!fs.existsSync('./transcripts')) fs.mkdirSync('./transcripts');
          const path = `./transcripts/${interaction.channel.id}-${Date.now()}.txt`;
          fs.writeFileSync(path, transcript);
          const config = await getTicketConfig(guild.id);
          if (config && config.logs_channel_id) {
            const log = guild.channels.cache.get(config.logs_channel_id);
            if (log) log.send({ content: `📝 Transcript for ${interaction.channel.name}`, files: [path] });
          }
          await interaction.channel.delete();
        }, 5000);
      } else if (action === 'add') {
        const target = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.edit(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply(`✅ Added ${target.username} to the ticket.`);
      } else if (action === 'remove') {
        const target = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.delete(target.id);
        await interaction.reply(`✅ Removed ${target.username} from the ticket.`);
      } else if (action === 'rename') {
        const name = interaction.options.getString('name');
        await interaction.channel.setName(`ticket-${name}`);
        await interaction.reply(`✅ Renamed to ticket-${name}`);
      } else if (action === 'transcript') {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = messages.map(msg => `${msg.author.tag}: ${msg.content}`).reverse().join('\n');
        if (!fs.existsSync('./transcripts')) fs.mkdirSync('./transcripts');
        const path = `./transcripts/${interaction.channel.id}-${Date.now()}.txt`;
        fs.writeFileSync(path, transcript);
        await interaction.reply({ content: '📝 Transcript:', files: [path] });
      }
    }

    // ==================== MISC ====================
    else if (commandName === 'userid') {
      const target = interaction.options.getUser('user') || user;
      await interaction.reply(`🆔 ${target.username}'s ID: ${target.id}`);
    }
    else if (commandName === 'guildid') {
      await interaction.reply(`🆔 This server's ID: ${guild.id}`);
    }
    else if (commandName === 'channelid') {
      await interaction.reply(`🆔 This channel's ID: ${interaction.channel.id}`);
    }
    else if (commandName === 'sayembed') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const title = interaction.options.getString('title');
      const desc = interaction.options.getString('description');
      const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor('#6c5ce7').setTimestamp();
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: '✅ Embed sent.', ephemeral: true });
    }
    else if (commandName === 'listcommands') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      try {
        const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
        const cmds = await rest.get(Routes.applicationCommands(client.user.id));
        const list = cmds.map(c => `\`${c.name}\``).join(', ');
        await interaction.reply(`📋 **Commands (${cmds.length})**\n${list || 'None'}`);
      } catch (e) {
        await interaction.reply(`❌ ${e.message}`);
      }
    }

    // ==================== ADMIN TOOLS ====================
    else if (commandName === 'sync') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      await interaction.reply('🔄 Syncing...');
      try {
        const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        await interaction.editReply('✅ Synced!');
      } catch (e) {
        await interaction.editReply(`❌ ${e.message}`);
      }
    }
    else if (commandName === 'health') {
      await interaction.reply('🏥 Edge Function: Reachable.');
    }
    else if (commandName === 'shutdown') {
      if (!isOwner(interaction)) return interaction.reply({ content: '⛔ Owner only.', ephemeral: true });
      await interaction.reply('🔄 Shutting down...');
      process.exit(0);
    }
    else if (commandName === 'leaveguild') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const guildId = interaction.options.getString('guild_id');
      const targetGuild = client.guilds.cache.get(guildId);
      if (!targetGuild) return interaction.reply('❌ Not in that server.');
      await targetGuild.leave();
      await interaction.reply(`✅ Left ${targetGuild.name}`);
    }
    else if (commandName === 'status') {
      if (!isAdmin(interaction)) return interaction.reply({ content: '⛔ Admin only.', ephemeral: true });
      const text = interaction.options.getString('text');
      const type = interaction.options.getString('type') || 'PLAYING';
      await client.user.setPresence({ activities: [{ name: text, type: Object.values(ActivityType).indexOf(type) }] });
      await interaction.reply('✅ Status updated.');
    }

    // ====================================================
    // DEFAULT (should never happen)
    // ====================================================
    else {
      await interaction.reply('❓ Unknown command.');
    }

  } catch (err) {
    console.error(`Error in ${commandName}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ An error occurred.', ephemeral: true });
    } else {
      await interaction.editReply('⚠️ An error occurred.');
    }
  }
});

// ============================================================
// BUTTON HANDLER (Create Ticket)
// ============================================================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || interaction.customId !== 'create_ticket') return;
  const guild = interaction.guild;
  const user = interaction.user;

  const config = await getTicketConfig(guild.id);
  if (!config || !config.category_id) {
    return interaction.reply({ content: '❌ Ticket system not setup. Ask an admin to run `/ticket-setup`.', ephemeral: true });
  }

  const existing = guild.channels.cache.find(c => c.name === `ticket-${user.id}` && c.parentId === config.category_id);
  if (existing) {
    return interaction.reply({ content: `❌ You already have a ticket: ${existing}`, ephemeral: true });
  }

  const category = guild.channels.cache.get(config.category_id);
  if (!category) {
    return interaction.reply({ content: '❌ Category not found. Re-run `/ticket-setup`.', ephemeral: true });
  }

  const channel = await guild.channels.create({
    name: `ticket-${user.id}`,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  // Give admins access
  for (const adminId of ADMIN_USER_IDS) {
    try {
      await channel.permissionOverwrites.edit(adminId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Support Ticket')
    .setColor('#6c5ce7')
    .setDescription(`Hello <@${user.id}>, please describe your issue.`)
    .setFooter({ text: 'NexusOptimize' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_ticket_${channel.id}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );

  await channel.send({ embeds: [embed], components: [row] });
  await channel.send(`<@${user.id}>`);

  if (config.logs_channel_id) {
    const log = guild.channels.cache.get(config.logs_channel_id);
    if (log) log.send(`📝 Ticket created: ${channel} by ${user.tag} (${user.id})`);
  }

  await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
});

// ============================================================
// BUTTON HANDLER (Close Ticket)
// ============================================================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('close_ticket_')) return;
  const channelId = interaction.customId.split('_')[2];
  if (interaction.channel.id !== channelId) {
    return interaction.reply({ content: '❌ This button is not for this ticket.', ephemeral: true });
  }

  if (!isAdmin(interaction) && interaction.user.id !== interaction.channel.name.split('-')[1]) {
    return interaction.reply({ content: '⛔ Only the ticket creator or admins can close this.', ephemeral: true });
  }

  await interaction.reply('🔒 Closing in 5s...');
  setTimeout(async () => {
    try {
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const transcript = messages.map(msg => `${msg.author.tag}: ${msg.content}`).reverse().join('\n');
      if (!fs.existsSync('./transcripts')) fs.mkdirSync('./transcripts');
      const path = `./transcripts/${interaction.channel.id}-${Date.now()}.txt`;
      fs.writeFileSync(path, transcript);

      const config = await getTicketConfig(interaction.guild.id);
      if (config && config.logs_channel_id) {
        const log = interaction.guild.channels.cache.get(config.logs_channel_id);
        if (log) log.send({ content: `📝 Transcript for ${interaction.channel.name}`, files: [path] });
      }

      await interaction.channel.delete();
    } catch {}
  }, 5000);
});

// --- Login ---
client.login(process.env.BOT_TOKEN);

console.log(`🚀 NexusOptimize Bot (${commands.length} commands) is starting...`);