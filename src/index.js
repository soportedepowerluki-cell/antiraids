require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, Events, MessageFlags } = require('discord.js');
const http = require('http');

// --- MINI SERVIDOR PARA RENDER ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Anti-Raid está vivo!');
}).listen(process.env.PORT || 3000);

console.log("⏳ Iniciando el sistema de seguridad...");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Whitelist actualizada con tu ID
const ALLOWED_SERVERS = ['1433313752488607821', '1343353558665396406', '1468695069858201806'];
const DIAS_MINIMOS = 3;

client.commands = new Collection();

// --- CARGA DE COMANDOS ---
try {
    const adminCommand = require('./commands/admin.js');
    client.commands.set(adminCommand.data.name, adminCommand);
    console.log("✅ Comando /seguridad cargado correctamente.");
} catch (e) {
    console.error("❌ Error al cargar admin.js:", e.message);
}

// --- EVENTO READY ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ SISTEMA ACTIVADO: ${client.user.tag}`);
    client.user.setActivity('Seguridad Total', { type: ActivityType.Watching });

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commandData = client.commands.map(cmd => cmd.data.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
        console.log('✅ Comandos / registrados globalmente.');
    } catch (err) {
        console.error('❌ Error registrando comandos:', err);
    }

    // Revisión de Whitelist
    client.guilds.cache.forEach(guild => {
        if (!ALLOWED_SERVERS.includes(guild.id)) {
            console.log(`🚫 Saliendo de servidor no autorizado: ${guild.name} (${guild.id})`);
            guild.leave().catch(() => {});
        } else {
            console.log(`🏠 Protegiendo servidor: ${guild.name}`);
        }
    });
});

// --- INTERACCIONES ---
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
        } 
        
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'seguridad_panico_confirm') {
                const confirmValue = interaction.fields.getTextInputValue('confirm_text');
                if (confirmValue !== 'CONFIRMAR') {
                    return interaction.reply({ content: '❌ Confirmación incorrecta.', flags: [MessageFlags.Ephemeral] });
                }

                const command = client.commands.get('seguridad');
                if (command) {
                    // Pasamos el parámetro extra para evitar el error de getSubcommand
                    await command.execute(interaction, { forcedSubcommand: 'panico' });
                }
            }
        }
    } catch (err) {
        console.error('❌ Error en interacción:', err);
        const errorMsg = { content: '❌ Error al procesar la acción.', flags: [MessageFlags.Ephemeral] };
        if (interaction.replied || interaction.deferred) await interaction.editReply(errorMsg).catch(() => {});
        else await interaction.reply(errorMsg).catch(() => {});
    }
});

// --- ANTI-RAID ---
client.on(Events.GuildMemberAdd, async member => {
    if (!ALLOWED_SERVERS.includes(member.guild.id)) return;
    const antiguedad = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (antiguedad < DIAS_MINIMOS && member.kickable) {
        await member.kick(`Anti-Raid: Cuenta nueva (${antiguedad.toFixed(1)} días)` ).catch(() => {});
        console.log(`⛔ Expulsado: ${member.user.tag}`);
    }
});

client.login(process.env.DISCORD_TOKEN);
