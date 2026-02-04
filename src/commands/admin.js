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

        // --- LÓGICA PÁNICO ---
        if (sub === 'panico') {
            if (!extra.forcedSubcommand) {
                const modal = new ModalBuilder()
                    .setCustomId('seguridad_panico_confirm')
                    .setTitle('Protocolo de Pánico');
                const input = new TextInputBuilder()
                    .setCustomId('confirm_text').setLabel('Escribe CONFIRMAR').setStyle(TextInputStyle.Short).setPlaceholder('CONFIRMAR').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            }
            await interaction.reply({ content: '🚨 **PROTOCOLO DE PÁNICO ACTIVADO.**', flags: [MessageFlags.Ephemeral] });
        }

        // --- LÓGICA CONFIG ---
        if (sub === 'config') {
            await interaction.reply({ content: '🛡️ **Anti-Raid:** Activo\n📅 **Filtro:** 3 días.', flags: [MessageFlags.Ephemeral] });
        }
    }
};
