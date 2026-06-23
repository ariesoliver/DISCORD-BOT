const Discord = require('discord.js');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const net = require('net');

const client = new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent,
        Discord.GatewayIntentBits.GuildMembers
    ]
});

// Discord.js constants
const SlashCommandBuilder = Discord.SlashCommandBuilder;
const PermissionFlagsBits = Discord.PermissionFlagsBits;
const EmbedBuilder = Discord.EmbedBuilder;
const StringSelectMenuBuilder = Discord.StringSelectMenuBuilder;
const REST = Discord.REST;
const Routes = Discord.Routes;
const ActionRowBuilder = Discord.ActionRowBuilder;
const ChannelType = Discord.ChannelType;
const ButtonBuilder = Discord.ButtonBuilder;
const ButtonStyle = Discord.ButtonStyle;
const MessageFlags = Discord.MessageFlags; 

// server
let serverIP = null;
function loadServerConfig() {
    try {
        if (fs.existsSync('server-config.json')) {
            const config = JSON.parse(fs.readFileSync('server-config.json', 'utf8'));
            serverIP = `${config.ip}:${config.port}`;
            console.log(`Loaded server IP: ${serverIP}`);
        }
    } catch (error) {
        console.log('No server config found or error loading it');
    }
}

const TICKET_CATEGORIES = {
    'ban_appeal': {
        name: 'Ban Appeal',
        description: 'Appeal your ban from the server',
        emoji: '⚖️',
        color: 0xFF6B6B
    },
    'suggestions_bugs': {
        name: 'Suggestions and Bug Reports',
        description: 'Submit suggestions or report bugs',
        emoji: '💡',
        color: 0x4ECDC4
    },
    'admin_application': {
        name: 'Application for Admin',
        description: 'Apply to become an administrator',
        emoji: '👑',
        color: 0xFFE66D
    }
};

async function setupTicketSystem(channel) {
    const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket System')
        .setDescription('Welcome to our ticket system!\n\nSelect the correct category for your concern below:')
        .setColor(0x5865F2)
        .setFooter({ text: 'Discord Tickets hosted by TicketBot' })
        .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_ticket_category')
        .setPlaceholder('Select a ticket category')
        .addOptions(
            Object.entries(TICKET_CATEGORIES).map(([key, category]) => ({
                label: category.name,
                description: category.description,
                value: key,
                emoji: category.emoji
            }))
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// Handle ticket category selection
async function createTicket(interaction, category, categoryKey) {
    const guild = interaction.guild;
    // Gumamit ng interaction.user para sa username
    const username = interaction.user.username.toLowerCase();

    // Hanapin kung may existing ticket channel
    const existingTicket = guild.channels.cache.find(
        channel => channel.name === `ticket-${username}-${categoryKey}` &&
        channel.type === ChannelType.GuildText
    );

    if (existingTicket) {
        return await interaction.reply({
            content: `You already have an open ticket in this category: ${existingTicket}`,
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        // Create ticket channel
        const ticketChannel = await guild.channels.create({
            name: `ticket-${username}-${categoryKey}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        });

        // Create ticket embed
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`${category.emoji} ${category.name}`)
            .setDescription(`Hello <@${interaction.user.id}>, welcome to your ticket!\n\nPlease describe your ${category.name.toLowerCase()} in detail and our staff will assist you shortly.`)
            .setColor(category.color)
            .addFields(
                { name: 'Ticket Type', value: category.name, inline: true },
                { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Status', value: '🟢 Open', inline: true }
            )
            .setFooter({ text: 'Use the buttons below to manage this ticket' })
            .setTimestamp();

        // Create control buttons
        const closeButton = new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const deleteButton = new ButtonBuilder()
            .setCustomId('delete_ticket')
            .setLabel('Delete Ticket')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗑️');

        const buttonRow = new ActionRowBuilder().addComponents(closeButton, deleteButton);

        await ticketChannel.send({
            content: `<@${interaction.user.id}>`,
            embeds: [ticketEmbed],
            components: [buttonRow]
        });

        // Additional info as before...

        await interaction.reply({
            content: `Ticket created successfully! Please check ${ticketChannel}`,
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.reply({
            content: 'There was an error creating your ticket. Please try again or contact an administrator.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function closeTicket(interaction) {
    const channel = interaction.channel;

    if (!channel.name.startsWith('ticket-')) {
        return await interaction.reply({
            content: 'This command can only be used in ticket channels.',
            flags: MessageFlags.Ephemeral
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔒 Ticket Closed')
        .setDescription('This ticket has been marked as closed. You may delete it or re-open it.')
        .setColor(0xFF0000)
        .setTimestamp();

    const deleteButton = new ButtonBuilder()
        .setCustomId('delete_ticket')
        .setLabel('Delete Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

    const actionRow = new ActionRowBuilder().addComponents(deleteButton);

    await interaction.reply({
        embeds: [embed],
        components: [actionRow]
    });
}

async function deleteTicket(interaction) {
    const channel = interaction.channel;
    
    if (!channel.name.startsWith('ticket-')) {
        return await interaction.reply({
            content: 'This command can only be used in ticket channels.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.reply({
        content: 'Deleting ticket channel...',
        flags: MessageFlags.Ephemeral
    });

    setTimeout(async () => {
        try {
            await channel.delete();
        } catch (error) {
            console.error('Error deleting ticket channel:', error);
        }
    }, 2000);
}

const commands = [
    // Kick Command
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for kicking')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    // Ban Command
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for banning')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('Days of messages to delete (0-7)')
                .setMinValue(0)
                .setMaxValue(7))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    // Unban Command
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unban')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    // Mute Command
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for muting')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    // Unmute Command
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unmute')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    // Clear Messages Command
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete messages from a channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // Server Info Command
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display server information'),

    // User Info Command
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Display user information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to get info about')
                .setRequired(false)),

    // Create Role Command
    new SlashCommandBuilder()
        .setName('createrole')
        .setDescription('Create a new role')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Role name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Role color (hex code)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // Delete Role Command
    new SlashCommandBuilder()
        .setName('deleterole')
        .setDescription('Delete a role')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to delete')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // Give Role Command
    new SlashCommandBuilder()
        .setName('giverole')
        .setDescription('Give a role to a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give the role to')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to give')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // Remove Role Command
    new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('Remove a role from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove the role from')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to remove')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // Lock Channel Command
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to lock')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        
    new SlashCommandBuilder()
	    .setName('setup-tickets')
	    .setDescription('Setup the ticket system in this channel')
	    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // Unlock Channel Command
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to unlock')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for warning')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        
    new SlashCommandBuilder()
        .setName('setip')
        .setDescription('Set the server IP address')
        .addStringOption(option =>
            option.setName('ip')
                .setDescription('The server IP address (e.g., 82.197.71.113:7032)')
                .setRequired(true)),
                
    new SlashCommandBuilder()
	    .setName('ip')
	    .setDescription('Check the current server IP and status'),
	
    new SlashCommandBuilder()
	    .setName('players')
	    .setDescription('Show the current online players of the configured server'),
    
    new SlashCommandBuilder()
        .setName('server')
        .setDescription('Get server information and status')
];

// Configuration
const CONFIG = {
    TOKEN: 'MTUxODE0MTQ3NzEyNzk4MzEyNA.GN3xyZ.PE2oOonps5fkSeF1BJik5pkE7_KD1PDdVK3ljk',
    GUILD_ID: '1329210060685185157',
    VERIFICATION_CHANNEL_ID: '1449278103808643124',
    VERIFIED_ROLE_ID: '1331652221498167316',
    LOG_CHANNEL_ID: '1445021243366440960' 
};

// Function to query SA-MP server
function querySampServer(ip, port) {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        const timeout = setTimeout(() => {
            client.close();
            reject(new Error('Server query timeout'));
        }, 5000);

        // SA-MP query packet for server info
        const packet = Buffer.from([
            0x53, 0x41, 0x4D, 0x50, // "SAMP"
            ...ip.split('.').map(x => parseInt(x)), // IP bytes
            port & 0xFF, (port >> 8) & 0xFF, // Port bytes
            0x69 // Info opcode
        ]);

        client.send(packet, port, ip, (err) => {
            if (err) {
                clearTimeout(timeout);
                client.close();
                reject(err);
            }
        });

        client.on('message', (msg) => {
            clearTimeout(timeout);
            client.close();
            
            try {
                // Parse SA-MP response
                if (msg.length < 11) {
                    reject(new Error('Invalid response'));
                    return;
                }

                let offset = 11; // Skip header
                
                // Read password flag
                const passworded = msg[offset] === 1;
                offset += 1;

                // Read player count
                const players = msg.readUInt16LE(offset);
                offset += 2;

                // Read max players
                const maxPlayers = msg.readUInt16LE(offset);
                offset += 2;

                // Read hostname length and hostname
                const hostnameLen = msg.readUInt32LE(offset);
                offset += 4;
                const hostname = msg.toString('utf8', offset, offset + hostnameLen);
                offset += hostnameLen;

                // Read gamemode length and gamemode
                const gamemodeLen = msg.readUInt32LE(offset);
                offset += 4;
                const gamemode = msg.toString('utf8', offset, offset + gamemodeLen);
                offset += gamemodeLen;

                // Read language length and language
                const languageLen = msg.readUInt32LE(offset);
                offset += 4;
                const language = msg.toString('utf8', offset, offset + languageLen);

                resolve({
                    hostname,
                    players,
                    maxPlayers,
                    gamemode,
                    language,
                    passworded,
                    online: true
                });
            } catch (error) {
                reject(error);
            }
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            client.close();
            reject(err);
        });
    });
}

function getPlayerList(ip, port) {
    return new Promise((resolve, reject) => {
        const client = dgram.createSocket('udp4');
        
        const timeout = setTimeout(() => {
            client.close();
            reject(new Error('⏱ Timeout: No response from server'));
        }, 5000);

        const packet = Buffer.from([
            0x53, 0x41, 0x4D, 0x50, // "SAMP"
            ...ip.split('.').map(octet => parseInt(octet)),
            port & 0xFF, (port >> 8) & 0xFF,
            0x64 // Opcode for detailed player info
        ]);

        client.send(packet, port, ip, (err) => {
            if (err) {
                clearTimeout(timeout);
                client.close();
                return reject(new Error('❌ Failed to send packet'));
            }
        });

        client.on('message', (msg) => {
            clearTimeout(timeout);
            client.close();

            try {
                if (msg.length < 13) return resolve([]); // Invalid/empty response

                let offset = 11; // Skip header
                const playerCount = msg.readUInt16LE(offset);
                offset += 2;

                const players = [];

                for (let i = 0; i < playerCount && offset < msg.length; i++) {
                    if (offset >= msg.length) break;
                    
                    const id = msg[offset];
                    offset += 1;

                    if (offset >= msg.length) break;
                    const nameLen = msg[offset];
                    offset += 1;

                    if (offset + nameLen > msg.length) break;
                    const name = msg.toString('utf8', offset, offset + nameLen).replace(/\0/g, '').trim();
                    offset += nameLen;

                    if (offset + 4 > msg.length) break;
                    const score = msg.readInt32LE(offset);
                    offset += 4;

                    if (offset + 4 > msg.length) break;
                    const ping = msg.readUInt32LE(offset);
                    offset += 4;

                    if (name.length > 0) {
                        players.push({ id, name, score, ping });
                    }
                }

                resolve(players);
            } catch (err) {
                reject(new Error('❌ Failed to parse player list: ' + err.message));
            }
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            client.close();
            reject(new Error('❌ UDP Error: ' + err.message));
        });
    });
}

// Store verification data
const verificationData = new Map();
const verifiedUsers = new Set();

// Load verified users from file
function loadVerifiedUsers() {
    try {
        if (fs.existsSync('verified_users.json')) {
            const data = JSON.parse(fs.readFileSync('verified_users.json', 'utf8'));
            data.forEach(userId => verifiedUsers.add(userId));
        }
    } catch (error) {
        console.error('Error loading verified users:', error);
    }
}

// Save verified users to file
function saveVerifiedUsers() {
    try {
        fs.writeFileSync('verified_users.json', JSON.stringify([...verifiedUsers]));
    } catch (error) {
        console.error('Error saving verified users:', error);
    }
}

// Create verification embed
function createVerificationEmbed(client) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'SOUTHSIDE CITY ROLEPLAY ',
            iconURL: client.user.displayAvatarURL()
        })
        .setTitle('SOUTHSIDE CITY ROLEPLAY ')
        .setDescription(
            'Welcome to the official Discord server of  SCRP! 👋\n\n' +
            'To keep our community safe and organized, please verify your account.\n\n' +
            'Once verified, you’ll get full access to channels, updates, and events.\n\n' +
            '_Thank you for joining us — we’re excited to have you here!_'
        )
        .setColor(0x5865F2)
        .setThumbnail('https://cdn.discordapp.com/attachments/1380124644891426816/1380484264835158087/file_0000000069ec61fdbc59dc74f78f16f1.png')
        .setFooter({ 
            text: '© Syntaxerror • SCRP', 
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();
}

// Create verification buttons
function createVerificationButtons() {
    return new Discord.ActionRowBuilder()
        .addComponents(
            new Discord.ButtonBuilder()
                .setCustomId('link_account')
                .setLabel('Link')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setEmoji({
                    id: '1319195681235140649',
                    name: 'd2_check',
                    animated: true
                }),
            new Discord.ButtonBuilder()
                .setCustomId('unlink_account')
                .setLabel('Unlink')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setEmoji({
                    id: '1319195681235140649',
                    name: 'd2_check',
                    animated: true
                }),
            new Discord.ButtonBuilder()
                .setCustomId('info')
                .setLabel('Info')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setEmoji({
                    id: '1351058301399335033',
                    name: 'fin',
                    animated: true
                })
        );
}

// Create account linking modal
function createLinkingModal() {
    const modal = new Discord.ModalBuilder()
        .setCustomId('link_account_modal')
        .setTitle('Link Account System');

    const usernameInput = new Discord.TextInputBuilder()
        .setCustomId('ingame_username')
        .setLabel('In-game Username')
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(24);

    const passwordInput = new Discord.TextInputBuilder()
        .setCustomId('ingame_password')
        .setLabel('In-game Password')
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(128);

    const firstActionRow = new Discord.ActionRowBuilder().addComponents(usernameInput);
    const secondActionRow = new Discord.ActionRowBuilder().addComponents(passwordInput);

    modal.addComponents(firstActionRow, secondActionRow);
    return modal;
}

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function verifyGameAccount(username, password) {
    const conn = await mysql.createConnection({
        host: '82.197.71.113',
        user: 'u56_wrmIu4WuvU',
        password: 'vO5y9NYEiuzH@dujdZ9c7!FU',
        database: 's56_gab'
    });

    const [rows] = await conn.execute('SELECT * FROM users WHERE username = ?', [username.trim()]);
    await conn.end();

    if (rows.length === 0) {
        console.log('❌ User not found');
        return { success: false };
    }

    let hash = rows[0].password;

    if (hash.startsWith('$2y$')) {
        hash = '$2b$' + hash.slice(4);
    }

    const match = await bcrypt.compare(password.trim(), hash);

    if (match) {
        return {
            success: true,
            playerData: {
                username: rows[0].username,
                level: rows[0].level,
                playTime: rows[0].play_time
            }
        };
    } else {
        console.log('❌ Password does not match');
        return { success: false };
    }
}

async function updateUserVerification(gameUsername, discordId) {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: '82.197.71.113',
            user: 'u56_wrmIu4WuvU',
            password: 'vO5y9NYEiuzH@dujdZ9c7!FU',
            database: 's56_gab'
        });

        // Step 1: Get UID using username
        const [rows] = await connection.execute('SELECT uid FROM users WHERE username = ?', [gameUsername]);
        if (rows.length === 0) {
            console.log('❌ No user found with username:', gameUsername);
            await connection.end();
            return false;
        }

        const uid = rows[0].uid;

        // Step 2: Only update verified_id and verified
        const [result] = await connection.execute(`
            UPDATE users 
            SET verified_id = ?, 
                verify = 1 
            WHERE uid = ?
        `, [discordId, uid]);

        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        const member = await guild.members.fetch(discordId);
        
        try {
            await member.setNickname(gameUsername);
            console.log(`✅ Nickname set to ${gameUsername}`);
        } catch (error) {
            console.error("❌ Failed to set nickname:", error.message);
        }

        console.log('✅ Updated user UID:', uid, 'Affected rows:', result.affectedRows);
        await connection.end();
        return result.affectedRows > 0;

    } catch (error) {
        console.error("[ERROR] updateUserVerification failed:", error);
        if (connection) await connection.end();
        return false;
    }
}

async function unlinkUserVerification(discordId) {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: '82.197.71.113',
            user: 'u56_wrmIu4WuvU',
            password: 'vO5y9NYEiuzH@dujdZ9c7!FU',
            database: 's56_gab'
        });

        const [result] = await connection.execute(`
            UPDATE users 
            SET verified_id = NULL, 
                verified = 0 
            WHERE verified_id = ?
        `, [discordId]);

        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        const member = await guild.members.fetch(discordId);

        try {
            await member.setNickname(null);
            console.log(`✅ Nickname reset for ${member.user.tag}`);
        } catch (err) {
            console.error("❌ Failed to reset nickname:", err.message);
        }
        
        await connection.end();
        return result.affectedRows > 0;

    } catch (error) {
        console.error("[ERROR] unlinkUserVerification failed:", error);
        if (connection) await connection.end();
        return false;
    }
}

// Game server configuration
const gameServerConfig = {
    host: '82.197.71.113', // Replace with your SA-MP server IP
    port: 6010, // Replace with your SA-MP server port
    rconPassword: 'dadasgab23423423' // Replace with your RCON password
};

// Function to send RCON command to game server
async function sendRCONCommand(command) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        
        socket.connect(gameServerConfig.port, gameServerConfig.host, () => {
            // Send RCON authentication
            const authPacket = Buffer.alloc(14);
            authPacket.writeInt32LE(10, 0); // packet length
            authPacket.writeInt32LE(1, 4); // request id
            authPacket.writeInt32LE(3, 8); // packet type (auth)
            authPacket.write(gameServerConfig.rconPassword, 12);
            
            socket.write(authPacket);
            
            // Send command
            setTimeout(() => {
                const commandPacket = Buffer.alloc(14 + command.length);
                commandPacket.writeInt32LE(10 + command.length, 0);
                commandPacket.writeInt32LE(2, 4);
                commandPacket.writeInt32LE(2, 8);
                commandPacket.write(command, 12);
                
                socket.write(commandPacket);
            }, 100);
        });
        
        socket.on('data', (data) => {
            resolve(data.toString());
            socket.destroy();
        });
        
        socket.on('error', (err) => {
            reject(err);
        });
        
        socket.on('timeout', () => {
            reject(new Error('Connection timeout'));
            socket.destroy();
        });
        
        socket.setTimeout(5000);
    });
}

client.once('ready', async () => {
    console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
    loadVerifiedUsers();
    loadServerConfig();
    
    // Send verification message to channel
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    const channel = guild?.channels.cache.get(CONFIG.VERIFICATION_CHANNEL_ID);
    
    if (channel) {
        // Clear old messages and send new verification message
        try {
            const messages = await channel.messages.fetch({ limit: 10 });
            await channel.bulkDelete(messages);   
	        await client.application.commands.set(commands);
        } catch (error) {
            console.log('Could not delete old messages:', error.message);
        }
        
        const embed = createVerificationEmbed(client);
        const buttons = createVerificationButtons();
        
        await channel.send({
            embeds: [embed],
            components: [buttons]
        });
        
        console.log('✅ Verification message sent!');
    }
});


client.on('interactionCreate', async interaction => {
    try {
        // Handle Chat Input Commands (Slash Commands)
        if (interaction.isChatInputCommand()) {
            const { commandName, options, guild, member } = interaction;

            switch (commandName) {
                case 'kick':
                    const kickUser = options.getUser('user');
                    const kickReason = options.getString('reason') || 'No reason provided';
                    const kickMember = guild.members.cache.get(kickUser.id);

                    if (!kickMember) {
                        return interaction.reply({ content: 'User not found in this server!', flags: MessageFlags.Ephemeral });
                    }

                    if (!kickMember.kickable) {
                        return interaction.reply({ content: 'I cannot kick this user!', flags: MessageFlags.Ephemeral });
                    }

                    await kickMember.kick(kickReason);
                    
                    const kickEmbed = new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('User Kicked')
                        .addFields(
                            { name: 'User', value: `${kickUser.tag}`, inline: true },
                            { name: 'Moderator', value: `${member.user.tag}`, inline: true },
                            { name: 'Reason', value: kickReason, inline: false }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [kickEmbed] });
                    break;

                case 'ban':
                    const banUser = options.getUser('user');
                    const banReason = options.getString('reason') || 'No reason provided';
                    const deleteDays = options.getInteger('days') || 0;
                    const banMember = guild.members.cache.get(banUser.id);

                    if (banMember && !banMember.bannable) {
                        return interaction.reply({ content: 'I cannot ban this user!', flags: MessageFlags.Ephemeral });
                    }

                    await guild.members.ban(banUser.id, { deleteMessageDays: deleteDays, reason: banReason });

                    const banEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('User Banned')
                        .addFields(
                            { name: 'User', value: `${banUser.tag}`, inline: true },
                            { name: 'Moderator', value: `${member.user.tag}`, inline: true },
                            { name: 'Reason', value: banReason, inline: false }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [banEmbed] });
                    break;

                case 'unban':
				    const unbanUser = options.getUser('user');
				
				    if (!unbanUser) {
				        return interaction.reply({ content: 'Please specify a valid user to unban.', flags: MessageFlags.Ephemeral });
				    }
				
				    try {
				        await guild.members.unban(unbanUser.id);
				        await interaction.reply({ content: `Successfully unbanned ${unbanUser.tag}` });
				    } catch (error) {
				        await interaction.reply({ content: 'Failed to unban user. Make sure the user is banned and the ID is correct.', ephemeral: true });
				    }
				    break;

                case 'mute':
                    const muteUser = options.getUser('user');
                    const muteDuration = options.getInteger('duration');
                    const muteReason = options.getString('reason') || 'No reason provided';
                    const muteMember = guild.members.cache.get(muteUser.id);

                    if (!muteMember) {
                        return interaction.reply({ content: 'User not found!', flags: MessageFlags.Ephemeral });
                    }

                    await muteMember.timeout(muteDuration * 60 * 1000, muteReason);

                    const muteEmbed = new EmbedBuilder()
                        .setColor('#ffaa00')
                        .setTitle('User Muted')
                        .addFields(
                            { name: 'User', value: `${muteUser.tag}`, inline: true },
                            { name: 'Duration', value: `${muteDuration} minutes`, inline: true },
                            { name: 'Reason', value: muteReason, inline: false }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [muteEmbed] });
                    break;

                case 'unmute':
                    const unmuteUser = options.getUser('user');
                    const unmuteMember = guild.members.cache.get(unmuteUser.id);

                    if (!unmuteMember) {
                        return interaction.reply({ content: 'User not found!', flags: MessageFlags.Ephemeral });
                    }

                    await unmuteMember.timeout(null);
                    await interaction.reply({ content: `Successfully unmuted ${unmuteUser.tag}` });
                    break;

                case 'clear':
                    const amount = options.getInteger('amount');
                    
                    const messages = await interaction.channel.messages.fetch({ limit: amount });
                    await interaction.channel.bulkDelete(messages);
                    
                    await interaction.reply({ content: `Successfully deleted ${amount} messages!`, flags: MessageFlags.Ephemeral });
                    break;

                case 'serverinfo':
                    const serverEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Server Information')
                        .setThumbnail(guild.iconURL())
                        .addFields(
                            { name: 'Server Name', value: guild.name, inline: true },
                            { name: 'Members', value: guild.memberCount.toString(), inline: true },
                            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
                            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
                            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [serverEmbed] });
                    break;

                case 'userinfo':
                    const infoUser = options.getUser('user') || interaction.user;
                    const infoMember = guild.members.cache.get(infoUser.id);

                    const userEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('User Information')
                        .setThumbnail(infoUser.displayAvatarURL())
                        .addFields(
                            { name: 'Username', value: infoUser.tag, inline: true },
                            { name: 'ID', value: infoUser.id, inline: true },
                            { name: 'Account Created', value: `<t:${Math.floor(infoUser.createdTimestamp / 1000)}:F>`, inline: false }
                        );

                    if (infoMember) {
                        userEmbed.addFields(
                            { name: 'Joined Server', value: `<t:${Math.floor(infoMember.joinedTimestamp / 1000)}:F>`, inline: false },
                            { name: 'Roles', value: infoMember.roles.cache.map(role => role.toString()).join(' ') || 'None', inline: false }
                        );
                    }

                    await interaction.reply({ embeds: [userEmbed] });
                    break;

                case 'createrole':
                    const roleName = options.getString('name');
                    const roleColor = options.getString('color') || '#99AAB5';

                    const newRole = await guild.roles.create({
                        name: roleName,
                        color: roleColor,
                        reason: `Role created by ${member.user.tag}`
                    });

                    await interaction.reply({ content: `Successfully created role ${newRole}!` });
                    break;

                case 'deleterole':
                    const roleToDelete = options.getRole('role');
                    
                    await roleToDelete.delete(`Role deleted by ${member.user.tag}`);
                    await interaction.reply({ content: `Successfully deleted role **${roleToDelete.name}**!` });
                    break;

                case 'giverole':
                    const giveUser = options.getUser('user');
                    const giveRole = options.getRole('role');
                    const giveMember = guild.members.cache.get(giveUser.id);

                    await giveMember.roles.add(giveRole);
                    await interaction.reply({ content: `Successfully gave ${giveRole} to ${giveUser.tag}!` });
                    break;

                case 'removerole':
                    const removeUser = options.getUser('user');
                    const removeRole = options.getRole('role');
                    const removeMember = guild.members.cache.get(removeUser.id);

                    await removeMember.roles.remove(removeRole);
                    await interaction.reply({ content: `Successfully removed ${removeRole} from ${removeUser.tag}!` });
                    break;

                case 'lock':
                    const lockChannel = options.getChannel('channel') || interaction.channel;
                    
                    await lockChannel.permissionOverwrites.edit(guild.roles.everyone, {
                        SendMessages: false
                    });
                    await interaction.reply({ content: `Successfully locked ${lockChannel}!` });
                    break;
                
                case 'setup-tickets':
				    await setupTicketSystem(interaction.channel);
				    await interaction.reply({ content: `✅ Ticket system has been setup in ${interaction.channel}.` });
				    break;

                case 'unlock':
                    const unlockChannel = options.getChannel('channel') || interaction.channel;
                    
                    await unlockChannel.permissionOverwrites.edit(guild.roles.everyone, {
                        SendMessages: null
                    });
                    await interaction.reply({ content: `Successfully unlocked ${unlockChannel}!` });
                    break;

                case 'warn':
                    const warnUser = options.getUser('user');
                    const warnReason = options.getString('reason');

                    const warnEmbed = new EmbedBuilder()
                        .setColor('#ffff00')
                        .setTitle('User Warned')
                        .addFields(
                            { name: 'User', value: `${warnUser.tag}`, inline: true },
                            { name: 'Moderator', value: `${member.user.tag}`, inline: true },
                            { name: 'Reason', value: warnReason, inline: false }
                        )
                        .setTimestamp();

                    await interaction.reply({ embeds: [warnEmbed] });
                    
                    try {
                        await warnUser.send(`You have been warned in **${guild.name}** for: ${warnReason}`);
                    } catch (error) {
                        // User has DMs disabled
                    }
                    break;

                case 'server':
			        const fs = require('fs');
			        
			        // Check if server config exists
			        if (!fs.existsSync('server-config.json')) {
			            return interaction.reply({ 
			                content: '❌ No server IP set! Use `/setip` to set the server IP first.', 
			                flags: MessageFlags.Ephemeral
			            });
			        }
			
			        try {
			            const serverConfig = JSON.parse(fs.readFileSync('server-config.json', 'utf8'));
			            
			            // Query the actual SA-MP server
			            const serverInfo = await querySampServer(serverConfig.ip, serverConfig.port);
			            
			            const serverStatusEmbed = new EmbedBuilder()
			                .setColor('#3498db')
			                .setTitle(`🎮 ${serverInfo.hostname}`)
			                .addFields(
			                    { name: 'IP:PORT', value: `${serverConfig.ip}:${serverConfig.port}`, inline: true },
			                    { name: 'PLAYERS', value: `${serverInfo.players}/${serverInfo.maxPlayers}`, inline: true },
			                    { name: 'GAMEMODE', value: serverInfo.gamemode, inline: true },
			                    { name: 'MAP', value: 'San Andreas', inline: true },
			                    { name: 'LANGUAGE', value: serverInfo.language, inline: true },
			                    { name: 'PASSWORD', value: serverInfo.passworded ? 'yes' : 'no', inline: true },
			                    { name: 'STATUS', value: serverInfo.online ? '🟢 Online' : '🔴 Offline', inline: true }
			                )
			                .setTimestamp()
			                .setFooter({ text: 'Server Status • Last updated' });
			
			            await interaction.reply({ embeds: [serverStatusEmbed] });
			            
			        } catch (error) {
			            const errorEmbed = new EmbedBuilder()
			                .setColor('#ff0000')
			                .setTitle('❌ Server Offline')
			                .setDescription('Cannot connect to the server. It might be offline or the IP/Port is incorrect.')
			                .addFields(
			                    { name: 'Server', value: `${serverConfig.ip}:${serverConfig.port}`, inline: true },
			                    { name: 'Status', value: '🔴 Offline', inline: true }
			                )
			                .setTimestamp();
			
			            await interaction.reply({ embeds: [errorEmbed] });
			        }
			        break;
			
			    case 'setip':
			        let rawIp = options.getString('ip');
					let serverIp = rawIp;
					let serverPort = 7777;
					
					if (rawIp.includes(':')) {
					    const parts = rawIp.split(':');
					    serverIp = parts[0];
					    serverPort = parseInt(parts[1]) || 7777;
					}
			
			        // Test the server connection before saving
			        try {
			            await interaction.deferReply();
			            
			            const testInfo = await querySampServer(serverIp, serverPort);
			            
			            // Store the IP and server info
			            const fs = require('fs');
			            const serverData = {
			                ip: serverIp,
			                port: serverPort,
			                setBy: interaction.user.tag,
			                timestamp: Date.now(),
			                lastKnownInfo: testInfo
			            };
			
			            fs.writeFileSync('server-config.json', JSON.stringify(serverData, null, 2));
			
			            const setIpEmbed = new EmbedBuilder()
			                .setColor('#00ff88')
			                .setTitle('✅ Server IP Updated')
			                .setDescription(`**Server connection successful!**`)
			                .addFields(
			                    { name: 'Server Name', value: testInfo.hostname, inline: false },
			                    { name: 'IP Address', value: `\`${serverIp}\``, inline: true },
			                    { name: 'Port', value: `\`${serverPort}\``, inline: true },
			                    { name: 'Players Online', value: `${testInfo.players}/${testInfo.maxPlayers}`, inline: true },
			                    { name: 'Gamemode', value: testInfo.gamemode, inline: true },
			                    { name: 'Language', value: testInfo.language, inline: true },
			                    { name: 'Set by', value: interaction.user.tag, inline: true }
			                )
			                .setTimestamp()
			                .setFooter({ text: 'Server configuration saved successfully' });
			
			            await interaction.editReply({ embeds: [setIpEmbed] });
			            
			        } catch (error) {
			            await interaction.editReply({ 
			                content: `❌ Cannot connect to server \`${serverIp}:${serverPort}\`! Please check if the IP and port are correct and the server is online.`, 
			                flags: MessageFlags.Ephemeral
			            });
			        }
			        break;
			
			    case 'players':
				    const fs2 = require('fs');
				    
				    if (!fs2.existsSync('server-config.json')) {
				        return interaction.reply({ 
				            content: '❌ No server IP set! Use `/setip` command first.', 
				            flags: MessageFlags.Ephemeral
				        });
				    }
				
				    try {
				        const serverConfig = JSON.parse(fs2.readFileSync('server-config.json', 'utf8'));
				        
				        await interaction.deferReply();
				        
				        // Get basic server info and player list
				        const [serverInfo, playerList] = await Promise.all([
				            querySampServer(serverConfig.ip, serverConfig.port),
				            getPlayerList(serverConfig.ip, serverConfig.port)
				        ]);
				        
				        let playerListText = '';
				        if (playerList.length === 0) {
				            playerListText = '*Server is empty*';
				        } else {
				            playerListText = playerList.slice(0, 10).map(player => 
				                `**${player.name}** (ID: ${player.id}, Score: ${player.score}, Ping: ${player.ping}ms)`
				            ).join('\n');
				            
				            if (playerList.length > 10) {
				                playerListText += `\n*...and ${playerList.length - 10} more players*`;
				            }
				        }
				
				        const playersEmbed = new EmbedBuilder()
				            .setColor('#00ff88')
				            .setTitle(`🎮 ${serverInfo.hostname}`)
				            .setDescription(`**Server: ${serverConfig.ip}:${serverConfig.port}**\n\n**PLAYERS LIST**\n${playerListText}`)
				            .addFields(
				                { name: 'Online Players', value: `${serverInfo.players}/${serverInfo.maxPlayers}`, inline: true },
				                { name: 'Server Status', value: '🟢 Online', inline: true },
				                { name: 'Gamemode', value: serverInfo.gamemode, inline: true }
				            )
				            .setTimestamp()
				            .setFooter({ text: serverInfo.hostname });
				
				        await interaction.editReply({ embeds: [playersEmbed] });
				
				    } catch (error) {
				        await interaction.editReply({ 
				            content: '❌ Cannot get player list! Server might be offline.', 
				            flags: MessageFlags.Ephemeral
				        });
				    }
				    break;
			
			    case 'ip':
			        const fs3 = require('fs');
			        
			        if (!fs3.existsSync('server-config.json')) {
			            return interaction.reply({ 
			                content: '❌ No server IP set! Use `/setip` command first.', 
			                flags: MessageFlags.Ephemeral
			            });
			        }
			
			        try {
			            const ipConfig = JSON.parse(fs3.readFileSync('server-config.json', 'utf8'));
			            
			            // Try to get current server status
			            let statusText = '🔴 Offline';
			            let serverName = 'Unknown Server';
			            
			            try {
			                const currentInfo = await querySampServer(ipConfig.ip, ipConfig.port);
			                statusText = '🟢 Online';
			                serverName = currentInfo.hostname;
			            } catch (error) {
			                // Use last known info if available
			                if (ipConfig.lastKnownInfo) {
			                    serverName = ipConfig.lastKnownInfo.hostname;
			                }
			            }
			
			            const ipEmbed = new EmbedBuilder()
			                .setColor('#0099ff')
			                .setTitle('🌐 Server Information')
			                .setDescription(`**${serverName}**`)
			                .addFields(
			                    { name: 'IP Address', value: `\`${ipConfig.ip}\``, inline: false },
			                    { name: 'Port', value: `\`${ipConfig.port}\``, inline: true },
			                    { name: 'Status', value: statusText, inline: true },
			                    { name: 'Last Updated', value: `<t:${Math.floor(ipConfig.timestamp / 1000)}:R>`, inline: true }
			                )
			                .setTimestamp()
			                .setFooter({ text: 'Server IP Information' });
			
			            await interaction.reply({ embeds: [ipEmbed] });
			            
			        } catch (error) {
			            await interaction.reply({ 
			                content: '❌ Error reading server configuration!', 
			                flags: MessageFlags.Ephemeral
			            });
			        }
			        break;
			
			    default:
			        await interaction.reply({ content: 'Unknown command!', flags: MessageFlags.Ephemeral });
			}  
        }
       
   	else if (interaction.isStringSelectMenu()) {
		    if (interaction.customId === 'select_ticket_category') {
		        const categoryKey = interaction.values[0];
		        const category = TICKET_CATEGORIES[categoryKey];
		
		        await createTicket(interaction, category, categoryKey);
		    }
		}
		
		else if (interaction.isButton()) {
		    // Ticket buttons
		    if (interaction.customId === 'close_ticket') {
		        await closeTicket(interaction);
		    } else if (interaction.customId === 'delete_ticket') {
		        await deleteTicket(interaction);
		    }
		
		    // Verification buttons
		    else if (interaction.customId === 'link_account') {
		        if (verifiedUsers.has(interaction.user.id)) {
		            return interaction.reply({
		                content: '❌ Your account is already verified!',
		                flags: MessageFlags.Ephemeral
		            });
		        }
		
		        const modal = createLinkingModal();
		        await interaction.showModal(modal);
		    }
		
		    else if (interaction.customId === 'unlink_account') {
		        if (!verifiedUsers.has(interaction.user.id)) {
		            return interaction.reply({
		                content: '❌ Your account is not linked!',
		                flags: MessageFlags.Ephemeral
		            });
		        }
		
		        const unlinked = await unlinkUserVerification(interaction.user.id);
		        if (!unlinked) {
		            return interaction.reply({
		                content: '❌ Failed to unlink your account from the database.',
		                flags: MessageFlags.Ephemeral
		            });
		        }
		
		        verifiedUsers.delete(interaction.user.id);
		        saveVerifiedUsers();
		
		        const member = interaction.guild.members.cache.get(interaction.user.id);
		        if (member) {
		            try {
		                await member.roles.remove('1331652221498167316');
		            } catch (error) {
		                console.error('Error removing role:', error);
		            }
		        }
		
		        await interaction.reply({
		            content: '✅ Your account has been unlinked successfully!',
		            flags: MessageFlags.Ephemeral
		        });
		    }
		
		    else if (interaction.customId === 'info') {
		        const infoEmbed = new Discord.EmbedBuilder()
		            .setTitle('ℹ️ Verification Information')
		            .setDescription(
		                "**How to verify:**\n" +
		                "1. Click the **Link** button\n" +
		                "2. Enter your in-game **username** and **password**\n" +
		                "3. Wait for the verification to complete\n\n" +
		                "**Why verify?**\n" +
		                "• Access to **exclusive channels**\n" +
		                "• Participate in **server events**\n" +
		                "• Gain **enhanced security features**\n\n" +
		                "**Need help?**\n" +
		                "Contact a **staff member** if you experience issues."
		            )
		            .setColor(0x3498db)
		            .setTimestamp();
		
		        await interaction.reply({
		            embeds: [infoEmbed],
		            flags: MessageFlags.Ephemeral
		        });
		    }
		}
        
        // Handle Modal Submit Interactions
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'link_account_modal') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const username = interaction.fields.getTextInputValue('ingame_username');
                const password = interaction.fields.getTextInputValue('ingame_password');
                
                // Store verification attempt
                verificationData.set(interaction.user.id, {
                    username,
                    timestamp: Date.now()
                });
                
                try {
		            // Verify account with game server
		            const verification = await verifyGameAccount(username, password);
		
		            if (verification.success) {
		                // Add to verified users
		                verifiedUsers.add(interaction.user.id);
		                saveVerifiedUsers();
		                 
		                const update = await updateUserVerification(username, interaction.user.id);
		
		                // Add verified role
		                const member = interaction.guild.members.cache.get(interaction.user.id);
		                if (member) {
		                    try {
		                        await member.roles.add('1331652221498167316');  // <-- verified role ID
		                    } catch (error) {
		                        console.error('Error adding role:', error);
		                    }
		                }
                        
                        // Log verification
                        const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
                        if (logChannel) {
                            const logEmbed = new Discord.EmbedBuilder()
                                .setTitle('✅ New Verification')
                                .setDescription(`**User:** ${interaction.user.tag} (${interaction.user.id})\n**In-game:** ${username}\n**Level:** ${verification.playerData.level}`)
                                .setColor(0x00ff00)
                                .setTimestamp();
                            
                            await logChannel.send({ embeds: [logEmbed] });
                        }
                        
                        await interaction.editReply({
                            content: `✅ **Verification Successful!**\n\nWelcome ${username}! Your account has been linked successfully.\nYou now have access to verified member features.`
                        });
                    } else {
                        await interaction.editReply({
                            content: '❌ **Verification Failed**\n\nInvalid credentials. Please check your username and password and try again.'
                        });
                    }
                } catch (error) {
                    console.error('Verification error:', error);
                    await interaction.editReply({
                        content: '❌ **Verification Error**\n\nSomething went wrong during verification. Please try again later or contact staff.'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Interaction error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
});

client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
client.login('MTUxODE0MTQ3NzEyNzk4MzEyNA.GN3xyZ.PE2oOonps5fkSeF1BJik5pkE7_KD1PDdVK3ljk');;
