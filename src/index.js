require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, ActivityType } = require('discord.js');
const path = require('path');
const http = require('http');

// --- MINI SERVIDOR PARA RENDER ---
// Esto evita que Render apague el bot por inactividad
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

// Carga manual del comando para evitar fallos de rutas en la nube
try {
    const adminCommand = require('./commands/admin.js');
    client.commands.set(adminCommand.data.name, adminCommand);
    console.log("✅ Músculos cargados: comando /seguridad listo.");
} catch (e) {
    console.error("❌ Error al cargar admin.js:", e.message);
}

client.once('ready', async () => {
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

// Ejecución de comandos
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (command) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Hubo un error al ejecutar.', ephemeral: true });
        }
    }
});

// Protección: Expulsar cuentas nuevas
client.on('guildMemberAdd', async member => {
    if (!ALLOWED_SERVERS.includes(member.guild.id)) return;
    const antiguedad = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);

    if (antiguedad < DIAS_MINIMOS) {
        if (member.kickable) {
            await member.kick(`Anti-Raid: Cuenta de menos de ${DIAS_MINIMOS} días.`).catch(() => {});
            console.log(`⛔ Expulsado: ${member.user.tag} (${antiguedad.toFixed(1)} días)`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error("❌ Error de Login: Revisa el Token en las Variables de Entorno de Render.");
});
