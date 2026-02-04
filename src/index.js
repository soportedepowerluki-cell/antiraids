require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, Events } = require('discord.js');
const http = require('http');
const path = require('path');

// --- MINI SERVIDOR PARA RENDER ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Anti-Raid está vivo!');
}).listen(process.env.PORT || 3000);

console.log("⏳ Iniciando el sistema de seguridad...");

// --- CONFIGURACIÓN DEL BOT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// IDs de tus servidores permitidos (Whitelist)
const ALLOWED_SERVERS = ['1433313752488607821', '1343353558665396406'];
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

    // Registrar comandos en la API de Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commandData = client.commands.map(cmd => cmd.data.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
        console.log('✅ Comandos / registrados globalmente.');
    } catch (err) {
        console.error('❌ Error registrando comandos:', err);
    }

    // Salir de servidores no autorizados
    client.guilds.cache.forEach(guild => {
        if (!ALLOWED_SERVERS.includes(guild.id)) {
            console.log(`🚫 Saliendo de: ${guild.name}`);
            guild.leave().catch(() => {});
        }
    });
});

// --- INTERACCIONES ---
client.on(Events.InteractionCreate, async interaction => {
    try {
        // COMANDOS SLASH
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) {
                await command.execute(interaction);
            }
        }

        // MODALES DE CONFIRMACIÓN PARA PANICO
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'seguridad_panico_confirm') {
                const confirmValue = interaction.fields.getTextInputValue('confirm_text');
                if (confirmValue !== 'CONFIRMAR') {
                    return interaction.reply({ content: '❌ Confirmación incorrecta. Acción cancelada.', ephemeral: true });
                }

                // Ejecutamos el comando panico manualmente
                const command = client.commands.get('seguridad');
                if (command) {
                    // Ejecutamos con subcomando 'panico' forzado
                    await command.execute(interaction, { forcedSubcommand: 'panico' });
                }
            }
        }
    } catch (err) {
        console.error('❌ Error en interacción:', err);
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: '❌ Ocurrió un error al procesar la interacción.' }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Ocurrió un error al procesar la interacción.', ephemeral: true }).catch(() => {});
        }
    }
});

// --- ANTI-RAID: EXPULSAR CUENTAS NUEVAS ---
client.on(Events.GuildMemberAdd, async member => {
    if (!ALLOWED_SERVERS.includes(member.guild.id)) return;

    const antiguedad = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (antiguedad < DIAS_MINIMOS && member.kickable) {
        await member.kick(`Anti-Raid: Cuenta de menos de ${DIAS_MINIMOS} días.`).catch(() => {});
        console.log(`⛔ Expulsado: ${member.user.tag} (${antiguedad.toFixed(1)} días)`);
    }
});

// --- LOGIN ---
client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Error de Login: Revisa el Token en las Variables de Entorno.");
});
