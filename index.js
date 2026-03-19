const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
if (!process.env.TOKEN) {
    console.error("❌ ERROR: La variable 'TOKEN' no detectada en Render.");
    process.exit(1);
}
const {
    Client,
    GatewayIntentBits,
    Collection,
    REST,
    Routes,
    ActivityType,
    Events,
    MessageFlags,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
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

// >>> DEBUG ADICIONAL: PONER ANTES DE client.login(...)

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION >', err && err.stack ? err.stack : err);
});
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION >', err && err.stack ? err.stack : err);
});

client.on('error', err => console.error('CLIENT ERROR >', err && err.stack ? err.stack : err));
client.on('warn', info => console.warn('CLIENT WARN >', info));
client.on('shardError', err => console.error('SHARD ERROR >', err && err.stack ? err.stack : err));
client.on('invalidated', () => console.warn('CLIENT INVALIDATED > Token invalidated or session closed'));

// Timeout visible por si client.login() se queda "colgado"
let loginResolved = false;
setTimeout(() => {
  if (!loginResolved) {
    console.warn('TIMEOUT: client.login() no respondió en 30s. Puede ser bloqueo de red o token inválido.');
  }
}, 30000);

// Whitelist con tu servidor añadido
const ALLOWED_SERVERS = ['1433313752488607821', '1343353558665396406', '1468695069858201806'];
const DIAS_MINIMOS = 3;

client.commands = new Collection();

// Cargar comando de administración
try {
    const adminCommand = require('./admin.js');
    client.commands.set(adminCommand.data.name, adminCommand);
    console.log("✅ Comando /seguridad cargado.");
} catch (e) {
    console.error("❌ Error cargando comandos:", e.message);
}

/**
 * PanicManager
 * - Mantiene el estado de pánico por guild (memoria en runtime).
 * - Al activar: crea overwrites en cada canal para negar SendMessages/AddReactions y guarda el overwrite anterior.
 * - Al desactivar: restaura overwrites previos (o los elimina si no existían).
 */
class PanicManager {
    constructor(client) {
        this.client = client;
        // Map<guildId, { enabled: boolean, by: {id, tag}, since: Date, channelStates: Map<channelId, {allow:[], deny:[]}> }>
        this.states = new Map();
    }

    isPanic(guildId) {
        const s = this.states.get(guildId);
        return s ? s.enabled : false;
    }

    async enablePanic(guild, byUser) {
        if (this.isPanic(guild.id)) return false;
        const channelStates = new Map();

        for (const channel of guild.channels.cache.values()) {
            try {
                // solo aplicar a canales textuales donde el bot pueda gestionar permisos y que sean visibles
                if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;
                // Guardar overwrite actual de @everyone si existe
                const overwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
                if (overwrite) {
                    channelStates.set(channel.id, {
                        allow: overwrite.allow.toArray ? overwrite.allow.toArray() : [],
                        deny: overwrite.deny.toArray ? overwrite.deny.toArray() : []
                    });
                } else {
                    channelStates.set(channel.id, null); // no tenía overwrite
                }

                // Aplicar bloqueo (niega envío y reacciones)
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    AddReactions: false
                }, { reason: `Modo pánico activado por ${byUser.tag}` }).catch(() => {});
            } catch (err) {
                console.error(`Error bloqueando canal ${channel.id} en ${guild.id}:`, err.message);
            }
        }

        this.states.set(guild.id, {
            enabled: true,
            by: { id: byUser.id, tag: byUser.tag },
            since: new Date(),
            channelStates
        });

        // Notificar al staff
        await this.notifyStaff(guild, true, byUser);
        console.log(`🔒 Modo pánico ACTIVADO en ${guild.name} por ${byUser.tag}`);
        return true;
    }

    async disablePanic(guild, byUser) {
        if (!this.isPanic(guild.id)) return false;
        const state = this.states.get(guild.id);
        if (!state) return false;

        for (const [channelId, prev] of state.channelStates.entries()) {
            try {
                const channel = guild.channels.cache.get(channelId);
                if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;

                if (prev === null) {
                    // No tenía overwrite antes -> borrarlo
                    await channel.permissionOverwrites.delete(guild.roles.everyone, `Restaurando tras desactivar modo pánico por ${byUser.tag}`).catch(() => {});
                } else {
                    // Reconstruir objeto de permisos previos
                    const perms = {};
                    (prev.allow || []).forEach(p => perms[p] = true);
                    (prev.deny || []).forEach(p => perms[p] = false);
                    await channel.permissionOverwrites.edit(guild.roles.everyone, perms, { reason: `Restaurado por ${byUser.tag}` }).catch(() => {});
                }
            } catch (err) {
                console.error(`Error restaurando canal ${channelId} en ${guild.id}:`, err.message);
            }
        }

        this.states.delete(guild.id);
        // Notificar al staff
        await this.notifyStaff(guild, false, byUser);
        console.log(`🔓 Modo pánico DESACTIVADO en ${guild.name} por ${byUser.tag}`);
        return true;
    }

    async notifyStaff(guild, enabled, byUser) {
        // Prepara embed
        const embed = new EmbedBuilder()
            .setTitle(enabled ? '🚨 MODO PÁNICO ACTIVADO' : '✅ MODO PÁNICO DESACTIVADO')
            .setDescription(enabled ? `Activado por **${byUser.tag}**` : `Desactivado por **${byUser.tag}**`)
            .addFields(
                { name: 'Servidor', value: `${guild.name} (${guild.id})`, inline: true },
                { name: 'Hora', value: new Date().toISOString(), inline: true }
            )
            .setColor(enabled ? 0xE74C3C : 0x2ECC71)
            .setTimestamp();

        // Si hay canal configurado, enviar ahí
        const staffChannelId = process.env.STAFF_CHANNEL_ID;
        if (staffChannelId) {
            const ch = guild.channels.cache.get(staffChannelId);
            if (ch && ch.isTextBased && ch.isTextBased()) {
                try {
                    await ch.send({ embeds: [embed] }).catch(() => {});
                    return;
                } catch (e) {
                    console.error('No pude notificar en STAFF_CHANNEL_ID:', e.message);
                }
            }
        }

        // Si no hay canal, intentar notificar a los miembros con rol STAFF_ROLE_ID o rol 'Staff'
        let role;
        if (process.env.STAFF_ROLE_ID) {
            role = guild.roles.cache.get(process.env.STAFF_ROLE_ID);
        }
        if (!role) {
            // buscar por nombres comunes
            role = guild.roles.cache.find(r => /staff|mod|moderador|administrador/i.test(r.name));
        }

        if (role) {
            const members = role.members;
            for (const member of members.values()) {
                try {
                    await member.send({ embeds: [embed] }).catch(() => {});
                } catch (err) {
                    // fallamos para algunos DMs; continuar
                }
            }
        } else {
            // fallback: enviar al owner DM
            try {
                const owner = await guild.fetchOwner();
                if (owner) await owner.user.send({ embeds: [embed] }).catch(() => {});
            } catch (err) {
                console.error('No pude notificar staff ni owner:', err.message);
            }
        }
    }
}

// Instanciar PanicManager y enlazarlo al cliente para uso desde comandos
client.panicManager = new PanicManager(client);

client.once(Events.ClientReady, async () => {
    console.log(`🛡️ LOGUEADO COMO: ${client.user.tag}`);

    // --- SISTEMA DE ESTADOS ROTATIVOS ---
    const estados = [
        { nombre: '🛡️ Seguridad Total', tipo: ActivityType.Watching },
        { nombre: '🔎 Escaneando Raids', tipo: ActivityType.Playing },
        { nombre: '🚫 Cuentas < 3 días', tipo: ActivityType.Watching },
        { nombre: '🌐 Power Lucky Network', tipo: ActivityType.Watching }
    ];

    let indice = 0;
    // Cambia el estado cada 15 segundos
    setInterval(() => {
        client.user.setActivity(estados[indice].nombre, { type: estados[indice].tipo });
        indice = (indice + 1) % estados.length;
    }, 15000);
    // ------------------------------------

    // Registro de comandos Slash
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        const commandData = client.commands.map(cmd => cmd.data.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
        console.log('✅ Comandos registrados en Discord.');
    } catch (err) {
        console.error('❌ Error API Discord:', err);
    }

    // Salir de servidores no autorizados (Whitelist)
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

/**
 * Protección en tiempo real: interceptar mensajes si el servidor está en modo pánico
 * - Borra el mensaje
 * - Envía un aviso corto (autodestruible) para que el usuario sepa que está bloqueado
 */
client.on('messageCreate', async message => {
    try {
        if (!message.guild || message.author.bot) return;
        if (!client.panicManager.isPanic(message.guild.id)) return;

        // permitir que el staff y administradores sigan escribiendo
        const staffRoleId = process.env.STAFF_ROLE_ID;
        const member = message.member;
        if (!member) return;

        const isStaff = (staffRoleId && member.roles.cache.has(staffRoleId)) || member.permissions.has(PermissionFlagsBits.ManageGuild) || member.permissions.has(PermissionFlagsBits.Administrator);
        if (isStaff) return; // staff puede escribir

        // borrar mensaje y avisar
        await message.delete().catch(() => {});
        const aviso = await message.channel.send({ content: '🔒 Modo pánico activo — los usuarios están temporalmente bloqueados para enviar mensajes.' }).catch(() => null);
        if (aviso) setTimeout(() => aviso.delete().catch(() => {}), 5000);
    } catch (err) {
        console.error('Error en messageCreate (modo pánico):', err.message);
    }
});


// ==========================================
//    SECCIÓN DE ENCENDIDO FINAL (UNIFICADA)
// ==========================================
console.log("🔥 LLEGANDO A LOGIN...");
console.log("Intentando conectar a Discord...");
if (!process.env.TOKEN) {
    
    console.error("------------------------------------------");
    console.error("❌ ERROR CRÍTICO: No se detectó la variable 'TOKEN'.");
    console.error("Asegúrate de configurarla en las Environment Variables de Render.");
    console.error("------------------------------------------");
    process.exit(1);
}

console.log("------------------------------------------");
console.log("🔍 DIAGNÓSTICO DE INICIO (Anti-Raid):");
console.log(`- Fecha: ${new Date().toISOString()}`);
console.log(`- Token presente: SÍ (Longitud: ${process.env.TOKEN.length})`);
console.log("------------------------------------------");

client.login(process.env.TOKEN)
    .then(() => {
        loginResolved = true; // Esto detiene tu cronómetro de timeout manual
        console.log('🔥 [BOT] Login exitoso y conectado a Discord');
    })
    .catch(err => {
        loginResolved = true;
        console.error('❌ [BOT] Error crítico en login:');
        if (err.message.includes("An invalid token")) {
            console.error("EL TOKEN PROPORCIONADO ES INVÁLIDO O HA SIDO REVOCADO.");
        } else if (err.message.includes("Privileged intent")) {
            console.error("ERROR DE INTENTS: Revisa que Message Content, Server Members y Presence estén activos en el Portal de Discord.");
        } else {
            console.error(err);
        }
        process.exit(1);
    });
