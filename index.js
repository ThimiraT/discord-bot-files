const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env")
});
require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const WELCOME_CHANNEL_ID = "1503265887405342720";
const ANNOUNCEMENT_CHANNEL_ID = "1503265936512127036";
const LOG_CHANNEL_ID = "1503567053624311908";
const NORMAL_CUSTOMER_ROLE_ID = "1503396537298976939";
const VIP_CUSTOMER_ROLE_ID = "1503398322264735784";
const STAFF_ROLE_ID = "1503276885084475472";

// Optional welcome image URL (set in werdant-bot/.env)
const WELCOME_IMAGE_URL = process.env.WELCOME_IMAGE_URL || null;

// Track purchases per user
const purchases = new Map();

// Recent sends to avoid duplicates (guildId:type -> {content, time})
const recentSends = new Map();
const DUPLICATE_WINDOW_MS = 5000; // 5 seconds

function isDuplicateRecent(guildId, type, content) {
  const key = `${guildId}:${type}`;
  const entry = recentSends.get(key);
  const now = Date.now();
  if (entry && entry.content === content && now - entry.time < DUPLICATE_WINDOW_MS) {
    return true;
  }
  recentSends.set(key, { content, time: now });
  return false;
}

// Security: Command cooldowns (per user, in milliseconds)
const commandCooldowns = new Map();
const COOLDOWN_DURATION = 3000; // 3 seconds between commands per user
const MAX_ANNOUNCEMENT_LENGTH = 2000;

// Comprehensive Logging System
function formatTimestamp() {
  return new Date().toISOString();
}

// Helper to send logs to Discord channel
async function sendLogToDiscord(embedBuilder) {
  try {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send({ embeds: [embedBuilder] }).catch(err => {
        console.error("Failed to send log to Discord:", err.message);
      });
    }
  } catch (error) {
    console.error("Error sending log to Discord:", error.message);
  }
}

// Security: Log admin actions
function logAdminAction(admin, action, details) {
  const timestamp = formatTimestamp();
  console.log(`[ADMIN LOG] ${timestamp} | Admin: ${admin.tag} | Action: ${action} | Details: ${details}`);
  
  const embed = new EmbedBuilder()
    .setTitle("🔐 Admin Action")
    .setDescription(`**Admin:** ${admin.tag}\n**Action:** ${action}\n**Details:** ${details}`)
    .setColor(0xFFA500)
    .setTimestamp();
  
  sendLogToDiscord(embed);
}

// Voice Logging
function logVoiceEvent(member, eventType, details) {
  const timestamp = formatTimestamp();
  console.log(`[VOICE LOG] ${timestamp} | User: ${member.user.tag} | Guild: ${member.guild.name} | Event: ${eventType} | Details: ${details}`);
  
  const embed = new EmbedBuilder()
    .setTitle(`🎤 Voice Event: ${eventType}`)
    .setDescription(`**User:** ${member.user.tag}\n**Guild:** ${member.guild.name}\n**Details:** ${details}`)
    .setColor(0x3498DB)
    .setTimestamp();
  
  sendLogToDiscord(embed);
}

// Role Logging
function logRoleChange(member, changeType, roleNames, modifiedBy = 'System') {
  const timestamp = formatTimestamp();
  console.log(`[ROLE LOG] ${timestamp} | User: ${member.user.tag} | Guild: ${member.guild.name} | Action: ${changeType} | Roles: ${roleNames} | Modified By: ${modifiedBy}`);
  
  const embed = new EmbedBuilder()
    .setTitle(`👥 Role Change: ${changeType}`)
    .setDescription(`**User:** ${member.user.tag}\n**Guild:** ${member.guild.name}\n**Roles:** ${roleNames}\n**Modified By:** ${modifiedBy}`)
    .setColor(changeType === "ROLE_ADDED" ? 0x27AE60 : 0xE74C3C)
    .setTimestamp();
  
  sendLogToDiscord(embed);
}

// Member Logging
function logMemberEvent(member, eventType, details = '') {
  const timestamp = formatTimestamp();
  console.log(`[MEMBER LOG] ${timestamp} | User: ${member.user.tag} | Guild: ${member.guild.name} | Event: ${eventType} | Details: ${details}`);
  
  const embed = new EmbedBuilder()
    .setTitle(`👤 Member Event: ${eventType}`)
    .setDescription(`**User:** ${member.user.tag}\n**Guild:** ${member.guild.name}\n**Details:** ${details}`)
    .setColor(eventType === "MEMBER_JOINED" ? 0x27AE60 : 0xE74C3C)
    .setTimestamp();
  
  sendLogToDiscord(embed);
}

// Message Logging
function logMessageEvent(message, eventType, details) {
  const timestamp = formatTimestamp();
  console.log(`[MESSAGE LOG] ${timestamp} | Author: ${message.author.tag} | Guild: ${message.guild?.name || 'DM'} | Channel: ${message.channel?.name || 'DM'} | Event: ${eventType} | Details: ${details}`);
  
  const embed = new EmbedBuilder()
    .setTitle(`💬 Message Event: ${eventType}`)
    .setDescription(`**Author:** ${message.author.tag}\n**Guild:** ${message.guild?.name || 'DM'}\n**Channel:** ${message.channel?.name || 'DM'}\n**Details:** ${details}`)
    .setColor(0x9B59B6)
    .setTimestamp();
  
  sendLogToDiscord(embed);
}

// Channel/Server Logging
function logChannelEvent(channel, guild, eventType, details) {
  const timestamp = formatTimestamp();
  console.log(`[CHANNEL LOG] ${timestamp} | Channel: ${channel.name} | Guild: ${guild.name} | Event: ${eventType} | Details: ${details}`);
  
  const embed = new EmbedBuilder()
    .setTitle(`📺 Channel Event: ${eventType}`)
    .setDescription(`**Channel:** ${channel.name}\n**Guild:** ${guild.name}\n**Details:** ${details}`)
    .setColor(0xF39C12)
    .setTimestamp();
  
  sendLogToDiscord(embed);
}

client.once("ready", () => {
  console.log(`${client.user.tag} is online!`);

  const announceCommand = new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an announcement to a channel (Staff role required)")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The announcement text")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to post the announcement in")
        .setRequired(true)
    );

  const addPurchaseCommand = new SlashCommandBuilder()
    .setName("addpurchase")
    .setDescription("Record a purchase for a customer")
    .addUserOption((option) =>
      option
        .setName("customer")
        .setDescription("The customer who made the purchase")
        .setRequired(true)
    );

  const purchasesCommand = new SlashCommandBuilder()
    .setName("purchases")
    .setDescription("Check purchase count for a customer")
    .addUserOption((option) =>
      option
        .setName("customer")
        .setDescription("The customer to check")
        .setRequired(true)
    );

  const testWelcomeCommand = new SlashCommandBuilder()
    .setName("testwelcome")
    .setDescription("Send the welcome message for a specific member (admin only)")
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("The member to welcome")
        .setRequired(true)
    );

  const onlineCommand = new SlashCommandBuilder()
    .setName("online")
    .setDescription("Check if the bot is online");

  client.guilds.cache.forEach((guild) => {
    guild.commands.set([
      announceCommand.toJSON(),
      addPurchaseCommand.toJSON(),
      purchasesCommand.toJSON(),
      testWelcomeCommand.toJSON(),
      onlineCommand.toJSON()
    ]).catch((error) => {
      console.error(`Failed to register commands for ${guild.name}:`, error);
    });
  });

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "WERDANT WEAR",
        type: 3
      }
    ]
  });
});

// HELPER FUNCTIONS

function getPurchaseCount(userId) {
  return purchases.get(userId) || 0;
}

// Security: Check command cooldown
function checkCooldown(userId, commandName) {
  const key = `${userId}-${commandName}`;
  const now = Date.now();
  const cooldownTime = commandCooldowns.get(key);

  if (cooldownTime && now < cooldownTime) {
    return cooldownTime - now;
  }

  commandCooldowns.set(key, now + COOLDOWN_DURATION);
  return null;
}

function assignRoleByPurchases(member, purchaseCount) {
  const normalRole = member.guild.roles.cache.get(NORMAL_CUSTOMER_ROLE_ID);
  const vipRole = member.guild.roles.cache.get(VIP_CUSTOMER_ROLE_ID);

  if (purchaseCount >= 7) {
    if (vipRole && !member.roles.cache.has(VIP_CUSTOMER_ROLE_ID)) {
      member.roles.add(vipRole).catch((e) => {
        console.error("Failed to add VIP role:", e.message);
      });
      logRoleChange(member, "ROLE_ADDED", vipRole.name, "Automatic (Purchase)");
    }
    if (normalRole && member.roles.cache.has(NORMAL_CUSTOMER_ROLE_ID)) {
      member.roles.remove(normalRole).catch((e) => {
        console.error("Failed to remove normal role:", e.message);
      });
      logRoleChange(member, "ROLE_REMOVED", normalRole.name, "Automatic (Purchase)");
    }
  } else if (purchaseCount >= 1) {
    if (normalRole && !member.roles.cache.has(NORMAL_CUSTOMER_ROLE_ID)) {
      member.roles.add(normalRole).catch((e) => {
        console.error("Failed to add customer role:", e.message);
      });
      logRoleChange(member, "ROLE_ADDED", normalRole.name, "Automatic (Purchase)");
    }
    if (vipRole && member.roles.cache.has(VIP_CUSTOMER_ROLE_ID)) {
      member.roles.remove(vipRole).catch((e) => {
        console.error("Failed to remove VIP role:", e.message);
      });
      logRoleChange(member, "ROLE_REMOVED", vipRole.name, "Automatic (Purchase)");
    }
  }
}

// ANNOUNCEMENT COMMAND

// Voice State Update Logging
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
      logVoiceEvent(member, "VOICE_JOIN", `Joined: ${newState.channel.name}`);
    }
    // User left a voice channel
    else if (oldState.channel && !newState.channel) {
      logVoiceEvent(member, "VOICE_LEAVE", `Left: ${oldState.channel.name}`);
    }
    // User switched voice channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      logVoiceEvent(member, "VOICE_SWITCH", `From: ${oldState.channel.name} → To: ${newState.channel.name}`);
    }
    // User muted/unmuted
    if (oldState.mute !== newState.mute) {
      const muteStatus = newState.mute ? "MUTED" : "UNMUTED";
      logVoiceEvent(member, `VOICE_${muteStatus}`, `Channel: ${newState.channel?.name || 'None'}`);
    }
    // User deafened/undeafened
    if (oldState.deaf !== newState.deaf) {
      const deafStatus = newState.deaf ? "DEAFENED" : "UNDEAFENED";
      logVoiceEvent(member, `VOICE_${deafStatus}`, `Channel: ${newState.channel?.name || 'None'}`);
    }
    // User started/stopped streaming
    if (oldState.streaming !== newState.streaming) {
      const streamStatus = newState.streaming ? "STREAM_START" : "STREAM_END";
      logVoiceEvent(member, streamStatus, `Channel: ${newState.channel?.name || 'None'}`);
    }
    // User enabled/disabled video
    if (oldState.selfVideo !== newState.selfVideo) {
      const videoStatus = newState.selfVideo ? "VIDEO_ON" : "VIDEO_OFF";
      logVoiceEvent(member, videoStatus, `Channel: ${newState.channel?.name || 'None'}`);
    }
  } catch (error) {
    console.error("[VOICE LOG ERROR]", error.message);
  }
});

// Member Update Logging (Role changes)
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (oldMember.user.bot) return;

    const rolesAdded = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const rolesRemoved = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

    // Log added roles
    if (rolesAdded.size > 0) {
      const roleNames = rolesAdded.map(r => r.name).join(', ');
      logRoleChange(newMember, "ROLE_ADDED", roleNames);
    }

    // Log removed roles
    if (rolesRemoved.size > 0) {
      const roleNames = rolesRemoved.map(r => r.name).join(', ');
      logRoleChange(newMember, "ROLE_REMOVED", roleNames);
    }

    // Log nickname changes
    if (oldMember.nickname !== newMember.nickname) {
      const oldNick = oldMember.nickname || 'None';
      const newNick = newMember.nickname || 'None';
      logMemberEvent(newMember, "NICKNAME_CHANGED", `${oldNick} → ${newNick}`);
    }
  } catch (error) {
    console.error("[MEMBER UPDATE LOG ERROR]", error.message);
  }
});

// Member Leave Logging
client.on("guildMemberRemove", (member) => {
  try {
    if (member.user.bot) return;
    logMemberEvent(member, "MEMBER_LEFT", `Roles: ${member.roles.cache.map(r => r.name).join(', ')}`);
  } catch (error) {
    console.error("[MEMBER LEAVE LOG ERROR]", error.message);
  }
});

// Message Delete Logging
client.on("messageDelete", (message) => {
  try {
    if (message.author?.bot) return;
    if (!message.guild) return;

    const messagePreview = message.content?.substring(0, 100) || '[Embed/File]';
    logMessageEvent(message, "MESSAGE_DELETED", `Content: "${messagePreview}"`);
  } catch (error) {
    console.error("[MESSAGE DELETE LOG ERROR]", error.message);
  }
});

// Message Edit Logging
client.on("messageUpdate", (oldMessage, newMessage) => {
  try {
    if (newMessage.author?.bot) return;
    if (!newMessage.guild) return;

    const oldContent = oldMessage.content?.substring(0, 80) || '[Embed/File]';
    const newContent = newMessage.content?.substring(0, 80) || '[Embed/File]';
    logMessageEvent(newMessage, "MESSAGE_EDITED", `Old: "${oldContent}" → New: "${newContent}"`);
  } catch (error) {
    console.error("[MESSAGE EDIT LOG ERROR]", error.message);
  }
});

// Channel Create Logging
client.on("channelCreate", (channel) => {
  try {
    if (!channel.guild) return;
    const channelType = channel.type;
    logChannelEvent(channel, channel.guild, "CHANNEL_CREATED", `Type: ${channelType}`);
  } catch (error) {
    console.error("[CHANNEL CREATE LOG ERROR]", error.message);
  }
});

// Channel Delete Logging
client.on("channelDelete", (channel) => {
  try {
    if (!channel.guild) return;
    logChannelEvent(channel, channel.guild, "CHANNEL_DELETED", `Type: ${channel.type}`);
  } catch (error) {
    console.error("[CHANNEL DELETE LOG ERROR]", error.message);
  }
});

// Channel Update Logging
client.on("channelUpdate", (oldChannel, newChannel) => {
  try {
    if (!newChannel.guild) return;

    const changes = [];
    if (oldChannel.name !== newChannel.name) {
      changes.push(`Name: ${oldChannel.name} → ${newChannel.name}`);
    }
    if (oldChannel.topic !== newChannel.topic) {
      changes.push(`Topic changed`);
    }
    if (oldChannel.nsfw !== newChannel.nsfw) {
      changes.push(`NSFW: ${oldChannel.nsfw} → ${newChannel.nsfw}`);
    }

    if (changes.length > 0) {
      logChannelEvent(newChannel, newChannel.guild, "CHANNEL_UPDATED", changes.join(' | '));
    }
  } catch (error) {
    console.error("[CHANNEL UPDATE LOG ERROR]", error.message);
  }
});

// ANNOUNCEMENT COMMAND

// Member Join Logging
client.on("guildMemberAdd", async (member) => {
  try {
    logMemberEvent(member, "MEMBER_JOINED", `Account created: ${member.user.createdAt.toISOString()}`);

    // Welcome message logic
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel) return;
    
    const rawWelcome = process.env.WELCOME_MESSAGE && process.env.WELCOME_MESSAGE.length
      ? process.env.WELCOME_MESSAGE
      : `✨ Welcome {user} to WERDANT WEAR!\nEnjoy your stay 💚`;
    const welcomeText = rawWelcome.replace(/{user}/g, `${member}`);
    if (isDuplicateRecent(member.guild.id, 'welcome', welcomeText)) {
      console.log('Duplicate welcome suppressed for', member.user.tag);
      return;
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`Welcome to ${member.guild.name}!`)
      .setDescription(welcomeText)
      .setColor(0x2ecc71)
      .setTimestamp();

    // Prefer image URL from env, otherwise use local assets/welcome.png if available
    const localImagePath = path.join(__dirname, 'assets', 'welcome.png');
    if (WELCOME_IMAGE_URL) {
      embed.setImage(WELCOME_IMAGE_URL);
      await channel.send({ embeds: [embed] });
    } else if (fs.existsSync(localImagePath)) {
      const attachment = new AttachmentBuilder(localImagePath);
      embed.setImage('attachment://welcome.png');
      await channel.send({ embeds: [embed], files: [attachment] });
    } else {
      // Fallback to plain text if no image
      await channel.send(welcomeText);
    }
  } catch (error) {
    console.error("Member join or welcome message error:", error.message);
  }
});

// SLASH COMMANDS

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const isOnlineCommand = interaction.commandName === "online";

    if (!isOnlineCommand && !interaction.member?.roles?.cache?.has(STAFF_ROLE_ID)) {
      return interaction.reply({
        content: "❌ You need the **Staff** role to use bot commands.",
        ephemeral: true
      });
    }

    // Security: Check cooldown
    const cooldownRemaining = checkCooldown(interaction.user.id, interaction.commandName);
    if (cooldownRemaining) {
      return interaction.reply({
        content: `⏳ Please wait ${Math.ceil(cooldownRemaining / 1000)}s before using another command.`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "announce") {
      const announcement = interaction.options.getString("message", true).trim();
      const targetChannel = interaction.options.getChannel("channel", true);

      if (!announcement || announcement.length === 0) {
        return interaction.reply({
          content: "⚠️ Please provide an announcement message.",
          ephemeral: true
        });
      }

      if (announcement.length > MAX_ANNOUNCEMENT_LENGTH) {
        return interaction.reply({
          content: `⚠️ Announcement too long. Max length: ${MAX_ANNOUNCEMENT_LENGTH} characters.`,
          ephemeral: true
        });
      }

      // Check if channel is text-based
      if (!targetChannel.isTextBased()) {
        return interaction.reply({
          content: "❌ The selected channel must be a text channel.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const announceText = `📢 **WERDANT WEAR ANNOUNCEMENT**\n\n${announcement}`;
      if (isDuplicateRecent(interaction.guild.id, 'announce', announceText)) {
        console.log('Duplicate announcement suppressed for', interaction.user.tag);
        return interaction.editReply({ content: '⚠️ Duplicate announcement suppressed.' });
      }

      try {
        await targetChannel.send(announceText);
        logAdminAction(interaction.user, "ANNOUNCEMENT", `Channel: ${targetChannel.name} | Length: ${announcement.length} chars`);

        return interaction.editReply({
          content: `✅ Announcement sent to ${targetChannel}!`
        });
      } catch (error) {
        return interaction.editReply({
          content: `❌ Failed to send announcement: ${error.message}`
        });
      }
    } else if (interaction.commandName === "addpurchase") {
      await interaction.deferReply({ ephemeral: true });

      const customer = interaction.options.getUser("customer", true);

      // Security: Prevent bot-to-bot abuse
      if (customer.bot) {
        return interaction.editReply({
          content: "❌ Cannot record purchases for bots."
        });
      }

      let member;
      try {
        member = await interaction.guild.members.fetch(customer.id);
      } catch (error) {
        return interaction.editReply({
          content: "❌ Could not fetch member. Make sure they're in the server."
        });
      }

      const currentCount = getPurchaseCount(customer.id);
      const newCount = currentCount + 1;
      purchases.set(customer.id, newCount);

      assignRoleByPurchases(member, newCount);

      let roleStatus = "";
      if (newCount >= 7) {
        roleStatus = " → Assigned VIP role 🌟";
      } else if (newCount === 1) {
        roleStatus = " → Assigned customer role 💚";
      }

      logAdminAction(interaction.user, "ADD_PURCHASE", `User: ${customer.tag} | Total: ${newCount}`);

      return interaction.editReply({
        content: `✅ Recorded purchase for ${customer}. Total purchases: ${newCount}${roleStatus}`
      });
    } else if (interaction.commandName === "purchases") {
      const customer = interaction.options.getUser("customer", true);
      const count = getPurchaseCount(customer.id);

      let roleStatus = "";
      if (count >= 7) {
        roleStatus = "🌟 VIP Customer";
      } else if (count >= 1) {
        roleStatus = "💚 Regular Customer";
      } else {
        roleStatus = "Not yet a customer";
      }

      return interaction.reply({
        content: `**${customer}** has **${count}** purchases. Status: ${roleStatus}`,
        ephemeral: true
      });
    } else if (interaction.commandName === "testwelcome") {
      if (
        !interaction.memberPermissions ||
        !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return interaction.reply({
          content: "❌ You need admin permission.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const target = interaction.options.getUser("member", true);
      if (target.bot) {
        return interaction.editReply({ content: "❌ Cannot test welcome for bots." });
      }

      let member;
      try {
        member = await interaction.guild.members.fetch(target.id);
      } catch (err) {
        return interaction.editReply({ content: "❌ Could not fetch member. Make sure they're in the server." });
      }

      const rawWelcome = process.env.WELCOME_MESSAGE && process.env.WELCOME_MESSAGE.length
        ? process.env.WELCOME_MESSAGE
        : `✨ Welcome {user} to WERDANT WEAR!\nFeel Like Heaven 💚`;
      const welcomeText = rawWelcome.replace(/{user}/g, `${member}`);
      if (isDuplicateRecent(interaction.guild.id, 'welcome', welcomeText)) {
        console.log('Duplicate welcome suppressed (test) for', member.user.tag);
        return interaction.editReply({ content: '⚠️ Duplicate welcome suppressed.' });
      }

      const channel = interaction.guild.channels.cache.get(WELCOME_CHANNEL_ID);
      if (!channel) {
        return interaction.editReply({ content: '⚠️ Welcome channel not found.' });
      }

      // Build embed (same logic as real welcome)
      const embed = new EmbedBuilder()
        .setTitle(`Welcome to ${interaction.guild.name}!`)
        .setDescription(welcomeText)
        .setColor(0x2ecc71)
        .setTimestamp();

      const localImagePath = path.join(__dirname, 'assets', 'welcome.png');
      if (WELCOME_IMAGE_URL) {
        embed.setImage(WELCOME_IMAGE_URL);
        await channel.send({ embeds: [embed] }).catch((e) => console.error('Failed to send test welcome:', e.message));
      } else if (fs.existsSync(localImagePath)) {
        const attachment = new AttachmentBuilder(localImagePath);
        embed.setImage('attachment://welcome.png');
        await channel.send({ embeds: [embed], files: [attachment] }).catch((e) => console.error('Failed to send test welcome:', e.message));
      } else {
        await channel.send(welcomeText).catch((e) => console.error('Failed to send test welcome:', e.message));
      }

      logAdminAction(interaction.user, 'TEST_WELCOME', `Target: ${target.tag}`);

      return interaction.editReply({ content: `✅ Sent welcome message for ${target.tag}` });
    } else if (interaction.commandName === "online") {
      return interaction.reply({
        content: "✅ Bot is online and running.",
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("Command error:", error.message);
    try {
      if (interaction.deferred) {
        return interaction.editReply({
          content: "❌ An error occurred. Please try again later."
        });
      } else {
        return interaction.reply({
          content: "❌ An error occurred. Please try again later.",
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError.message);
    }
  }
});

const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!botToken || botToken === "YOUR_BOT_TOKEN_HERE") {
  throw new Error("Set BOT_TOKEN, DISCORD_TOKEN, or TOKEN in the environment or .env before starting the bot.");
}

client.login(botToken);