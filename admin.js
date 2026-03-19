const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    MessageFlags 
} = require('discord.js');

const ALLOWED_ROLES = [
    '1340887228431335457', '1343040895313907805', '1343061152732545164',
    '1343060398932230246', '1343093044290916395', '1343060062851301406'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seguridad')
        .setDescription('Panel de control de seguridad')
        .addSubcommand(sub => 
            sub.setName('panico').setDescription('Expulsión inmediata de sospechosos'))
        .addSubcommand(sub =>
            sub.setName('calma')
                .setDescription('Activa/Desactiva el modo lento en este canal')
                .addIntegerOption(opt => 
                    opt.setName('segundos')
                       .setDescription('Segundos de espera (0 para desactivar)')
                       .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('config').setDescription('Ver configuración del bot'))
        .setDefaultMemberPermissions(PermissionFlagsBits.UseApplicationCommands),

    async execute(interaction, extra = {}) {
        const hasRole = interaction.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasRole && !isAdmin) {
            return await interaction.reply({ content: '❌ No tienes permiso.', flags: [MessageFlags.Ephemeral] });
        }

        const sub = extra.forcedSubcommand || interaction.options.getSubcommand();

        // --- LÓGICA MODO CALMA ---
        if (sub === 'calma') {
            const segundos = interaction.options.getInteger('segundos');
            
            try {
                await interaction.channel.setRateLimitPerUser(segundos);
                const msg = segundos === 0 
                    ? '✅ **Modo Calma desactivado.** El chat vuelve a la normalidad.' 
                    : `⏳ **Modo Calma activado.** Espera de ${segundos} segundos entre mensajes.`;
                
                return await interaction.reply({ content: msg });
            } catch (err) {
                return await interaction.reply({ content: '❌ No pude cambiar el modo lento. Revisa mis permisos.', flags: [MessageFlags.Ephemeral] });
            }
        }

        // --- LÓGICA PÁNICO (Toggle: Activa/Desactiva) ---
        if (sub === 'panico') {
            const panicManager = interaction.client.panicManager;
            const isAlreadyPanic = panicManager.isPanic(interaction.guildId);

            // 1. Si el modo pánico YA ESTÁ ACTIVO, lo desactivamos directamente
            if (isAlreadyPanic) {
                // Usamos deferReply porque restaurar permisos de muchos canales puede tardar más de 3s
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                const success = await panicManager.disablePanic(interaction.guild, interaction.user);
                
                return await interaction.editReply({ 
                    content: success 
                        ? '✅ **Modo Pánico DESACTIVADO.** Los permisos originales se están restaurando...' 
                        : '❌ Hubo un error al intentar desactivar el modo pánico.' 
                });
            }

            // 2. Si el modo pánico NO ESTÁ ACTIVO, pedimos confirmación vía Modal
            if (!extra.forcedSubcommand) {
                const modal = new ModalBuilder()
                    .setCustomId('seguridad_panico_confirm')
                    .setTitle('Confirmar Bloqueo Total');

                const input = new TextInputBuilder()
                    .setCustomId('confirm_text')
                    .setLabel('Escribe CONFIRMAR para bloquear todo')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('CONFIRMAR')
                    .setMinLength(9)
                    .setMaxLength(9)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            }

            // 3. Ejecución tras recibir la confirmación del Modal (extra.forcedSubcommand)
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const success = await panicManager.enablePanic(interaction.guild, interaction.user);

            return await interaction.editReply({ 
                content: success 
                    ? '🚨 **PROTOCOLO DE PÁNICO ACTIVADO.** Todos los canales han sido bloqueados para miembros.' 
                    : '❌ No se pudo activar el protocolo o ya estaba en curso.' 
            });
        }

        // --- LÓGICA CONFIG ---
        if (sub === 'config') {
            await interaction.reply({ content: '🛡️ **Anti-Raid:** Activo\n📅 **Filtro:** 3 días.', flags: [MessageFlags.Ephemeral] });
        }
    }
};
