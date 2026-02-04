require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType, Events, MessageFlags } = require('discord.js');
const http = require('http');

// --- SERVIDOR PARA RENDER (MANTENER VIVO) ---
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Anti-Raid operativo 24/7');
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Whitelist con tu servidor añadido
const ALLOWED_SERVERS = ['1433313752488607821', '1343353558665396406', '1468695069858201806'];
const DIAS_MINIMOS = 3;

client.commands = new Collection();

// Cargar comando de administración
try {
    const adminCommand = require('./commands/admin.js');
    client.commands.set(adminCommand.data.name, adminCommand);
    console.log("✅ Comando /seguridad cargado.");
} catch (e) {
    console.error("❌ Error cargando comandos:", e.message);
}

client.once(Events.ClientReady, async () => {
    console.log(`🛡️ LOGUEADO COMO: ${client.user.tag}`);
    client.user.setActivity('Seguridad Total', { type: ActivityType.Watching });

    // Registro de comandos Slash
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        const commandData = client.commands.map(cmd => cmd.data.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
        console.log('✅ Comandos registrados en Discord.');
    } catch (err) {
        console.error('❌ Error API Discord:', err);
    }

    // Salir de servidores no autorizados
    client.guilds.cache.forEach(guild => {
        if (!ALLOWED_SERVERS.includes(guild.id)) {
            console.log(`🚫 Saliendo de servidor ajeno: ${guild.name} (${guild.id})`);
            guild.leave().catch(() => {});
        } else {
            console.log(`🏠 Protegiendo con éxito: ${guild.name}`);
        }
    });
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        // Ejecución de comandos normal
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
        } 
        
        // Manejo del Modal de Pánico (Aquí estaba el error del subcomando)
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'seguridad_panico_confirm') {
                const confirmValue = interaction.fields.getTextInputValue('confirm_text');
                if (confirmValue.toUpperCase() !== 'CONFIRMAR') {
                    return interaction.reply({ content: '❌ Cancelado: No escribiste "CONFIRMAR".', flags: [MessageFlags.Ephemeral] });
                }

                const command = client.commands.get('seguridad');
                if (command) {
                    // Pasamos "forcedSubcommand" para que el archivo admin.js no explote
                    await command.execute(interaction, { forcedSubcommand: 'panico' });
                }
            }
        }
    } catch (err) {
        console.error('❌ Error de interacción:', err);
    }
});

// Anti-Raid: Expulsar cuentas nuevas
client.on(Events.GuildMemberAdd, async member => {
    if (!ALLOWED_SERVERS.includes(member.guild.id)) return;
    const antiguedad = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (antiguedad < DIAS_MINIMOS && member.kickable) {
        await member.kick(`Anti-Raid: Cuenta menor a ${DIAS_MINIMOS} días.`).catch(() => {});
        console.log(`⛔ Expulsado: ${member.user.tag} (Edad: ${antiguedad.toFixed(1)} días)`);
    }
});

client.login(process.env.DISCORD_TOKEN);
