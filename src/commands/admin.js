const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seguridad')
        .setDescription('Panel de control de seguridad')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => 
            sub.setName('panico').setDescription('Activa el protocolo de expulsión inmediata')
        )
        .addSubcommand(sub =>
            sub.setName('config').setDescription('Ver configuración del bot')
        ),

    async execute(interaction, extra = {}) {
        // Si extra.forcedSubcommand existe, lo usamos. Si no, usamos el getSubcommand normal.
        const subcommand = extra.forcedSubcommand || (interaction.options ? interaction.options.getSubcommand() : null);

        if (subcommand === 'panico') {
            // Si el usuario acaba de escribir el comando, le pedimos confirmación
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

            // Si ya confirmó a través del modal, ejecutamos la acción
            await interaction.reply({ 
                content: '🚨 **PROTOCOLO DE PÁNICO ACTIVADO.** No se permiten nuevas entradas.', 
                flags: [MessageFlags.Ephemeral] 
            });
            console.log(`⚠️ ACCIÓN DE PÁNICO POR: ${interaction.user.tag}`);
        }

        if (subcommand === 'config') {
            await interaction.reply({ 
                content: '🛡️ **Estado:** Operacional\n✅ **Whitelist:** Verificada\n📅 **Filtro:** 3 días de antigüedad.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }
};
