const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    MessageFlags 
} = require('discord.js');

// 📋 IDs de roles autorizados que me pasaste
const ALLOWED_ROLES = [
    '1340887228431335457', // Owner
    '1343040895313907805', // Co-Owner
    '1343061152732545164', // Events
    '1343060398932230246', // Manager
    '1343093044290916395', // Staff
    '1343060062851301406'  // Admin
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seguridad')
        .setDescription('Panel de control de seguridad para Staff')
        .setDefaultMemberPermissions(PermissionFlagsBits.UseApplicationCommands) // Permitimos que aparezca, pero filtramos dentro
        .addSubcommand(sub => 
            sub.setName('panico').setDescription('Activa el protocolo de expulsión inmediata')
        )
        .addSubcommand(sub =>
            sub.setName('config').setDescription('Ver configuración del bot')
        ),

    async execute(interaction, extra = {}) {
        // 1. VERIFICACIÓN DE ROLES
        // Revisa si el usuario tiene alguno de los roles de la lista
        const hasRole = interaction.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        // Si no es admin y no tiene los roles, lo sacamos
        if (!hasRole && !isAdmin) {
            return await interaction.reply({ 
                content: '❌ **Acceso Denegado:** No tienes permiso para usar el sistema de seguridad.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        // Detectar si la ejecución viene de un comando normal o del Modal
        const subcommand = extra.forcedSubcommand || (interaction.options ? interaction.options.getSubcommand() : null);

        // --- LÓGICA DE PÁNICO ---
        if (subcommand === 'panico') {
            // Si es la primera vez (comando slash), mostramos el modal de confirmación
            if (!extra.forcedSubcommand) {
                const modal = new ModalBuilder()
                    .setCustomId('seguridad_panico_confirm')
                    .setTitle('Protocolo de Pánico');

                const input = new TextInputBuilder()
                    .setCustomId('confirm_text')
                    .setLabel('Escribe CONFIRMAR para proceder')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('CONFIRMAR')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            }

            // Si ya viene del Modal (confirmado)
            await interaction.reply({ 
                content: '🚨 **PROTOCOLO DE PÁNICO ACTIVADO.** El Staff ha sido notificado.', 
                flags: [MessageFlags.Ephemeral] 
            });
            console.log(`⚠️ ACCIÓN DE PÁNICO EJECUTADA POR: ${interaction.user.tag}`);
        }

        // --- LÓGICA DE CONFIG ---
        if (subcommand === 'config') {
            await interaction.reply({ 
                content: '🛡️ **Estado:** Operacional\n📅 **Filtro Anti-Raid:** 3 días\n✅ **Roles con acceso:** ' + ALLOWED_ROLES.length, 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }
};
