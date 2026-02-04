const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

const DEFAULTS = {
    concurrency: 3,
    delayBetweenBatches: 500,
    maxRetries: 3,
    retryBackoffMs: 700
};

// Roles autorizados
const ALLOWED_ROLES = [
    '1340887228431335457', //owner
    '1343040895313907805', // co-owner
    '1343060398932230246', // manager
    '1343061152732545164', // events
    '1343093044290916395', // staff
    '1343060062851301406', // admin
];

// Canal donde se enviarán logs de fallos
const STAFF_LOG_CHANNEL_ID = 'TU_CANAL_DE_LOGS_AQUI';

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function editChannelWithRetries(channel, guildId, options, maxRetries = DEFAULTS.maxRetries, baseBackoff = DEFAULTS.retryBackoffMs) {
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            await channel.permissionOverwrites.edit(guildId, options);
            return { ok: true };
        } catch (err) {
            attempt++;
            const errMsg = err?.message || String(err);
            const is429 = err?.code === 429 || err?.status === 429 ||
                          errMsg.toLowerCase().includes('rate limited') || Boolean(err?.retry_after);

            if (is429) {
                const retryAfter = Number(err?.retry_after || baseBackoff);
                await sleep(retryAfter * (1 + attempt * 0.5));
            } else if (attempt <= maxRetries) {
                const backoff = baseBackoff * Math.pow(2, attempt - 1);
                await sleep(backoff);
            } else {
                return { ok: false, error: errMsg };
            }
        }
    }
    return { ok: false, error: 'Max retries exceeded' };
}

async function processChannelsBatch(canalesCollection, guildId, options, config = {}) {
    const cfg = { ...DEFAULTS, ...config };
    const allChannels = Array.isArray(canalesCollection) ? canalesCollection : Array.from(canalesCollection.values());

    const excludeIds = new Set(cfg.excludeChannelIds || []);
    const excludeNames = new Set((cfg.excludeChannelNames || []).map(n => n.toLowerCase()));

    const toProcess = allChannels.filter(c =>
        c && c.type === ChannelType.GuildText &&
        !excludeIds.has(c.id) &&
        !excludeNames.has(c.name.toLowerCase())
    );

    const total = toProcess.length;
    const succeeded = [];
    const failed = [];

    for (let i = 0; i < total; i += cfg.concurrency) {
        const batch = toProcess.slice(i, i + cfg.concurrency);

        await Promise.all(batch.map(async channel => {
            const res = await editChannelWithRetries(channel, guildId, options, cfg.maxRetries, cfg.retryBackoffMs);
            if (res.ok) succeeded.push({ id: channel.id, name: channel.name });
            else failed.push({ id: channel.id, name: channel.name, error: res.error });
        }));

        if (cfg.delayBetweenBatches > 0) await sleep(cfg.delayBetweenBatches);
    }

    return {
        total,
        succeededCount: succeeded.length,
        failedCount: failed.length,
        failed,
        skipped: allChannels.length - total
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seguridad')
        .setDescription('Panel de control para situaciones de riesgo')
        .addSubcommand(sub =>
            sub.setName('panico')
               .setDescription('Bloquea todos los canales de texto (Modo lectura)'))
        .addSubcommand(sub =>
            sub.setName('calma')
               .setDescription('Restaura los permisos de escritura en los canales'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, extras = {}) {

        // --- RESTRICCIÓN POR ROLES ---
        const memberRoles = interaction.member.roles.cache.map(r => r.id);
        const hasAccess = memberRoles.some(r => ALLOWED_ROLES.includes(r));
        if (!hasAccess) {
            return interaction.reply({ content: '❌ No tienes permisos para usar este comando.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        // --- MODAL DE CONFIRMACIÓN PARA PANICO ---
        if (sub === 'panico') {
            const modal = new ModalBuilder()
                .setCustomId('seguridad_panico_confirm')
                .setTitle('Confirmación Modo Pánico');

            const confirmInput = new TextInputBuilder()
                .setCustomId('confirm_text')
                .setLabel('Escribe "CONFIRMAR" para proceder')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(confirmInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }

        await interaction.deferReply({ ephemeral: true });

        const canales = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        if (!canales.size) {
            return interaction.editReply({ content: '❌ No se encontraron canales de texto para modificar.' });
        }

        const guildId = interaction.guild.id;
        const options = sub === 'panico' ? { SendMessages: false } : { SendMessages: null };
        const config = {
            concurrency: extras.concurrency ?? DEFAULTS.concurrency,
            delayBetweenBatches: extras.delayBetweenBatches ?? DEFAULTS.delayBetweenBatches,
            maxRetries: extras.maxRetries ?? DEFAULTS.maxRetries,
            retryBackoffMs: extras.retryBackoffMs ?? DEFAULTS.retryBackoffMs,
            excludeChannelIds: extras.excludeChannelIds || [],
            excludeChannelNames: extras.excludeChannelNames || []
        };

        try {
            const result = await processChannelsBatch(canales, guildId, options, config);

            // --- ENVIAR LOG A STAFF ---
            if (result.failedCount > 0 && STAFF_LOG_CHANNEL_ID) {
                const logChannel = interaction.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
                if (logChannel?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Fallos en /seguridad')
                        .setDescription(result.failed.slice(0, 25).map(f => `• ${f.name} (${f.id}) - ${f.error}`).join('\n'))
                        .setColor('Red')
                        .setTimestamp();
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }

            return interaction.editReply({
                content: `${sub === 'panico' ? '🚨 MODO PÁNICO' : '🕊️ MODO CALMA'} aplicado.\n` +
                         `Total canales: **${result.total}**\n` +
                         `✅ Sucedidos: **${result.succeededCount}**\n` +
                         `❌ Fallidos: **${result.failedCount}**\n` +
                         `⏭ Saltados: **${result.skipped}**`
            });
        } catch (error) {
            console.error('❌ Error ejecutando /seguridad:', error);
            return interaction.editReply({ content: '❌ Ocurrió un error al aplicar permisos. Revisa los logs.' });
        }
    }
};

