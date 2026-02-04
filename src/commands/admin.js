const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

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

    /**
     * Ejecuta el comando /seguridad
     * @param {CommandInteraction} interaction 
     * @param {Object} extras - Extras opcionales desde index.js
     * @param {Function} extras.editChannelsSequentially - Función para editar canales secuencialmente
     */
    async execute(interaction, extras = {}) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        // Obtener solo canales de texto
        const canales = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        if (!canales.size) {
            return interaction.editReply({ content: '❌ No hay canales de texto disponibles para modificar.' });
        }

        // Función de edición: usa la pasada desde index.js o fallback interno
        const editFn = extras.editChannelsSequentially || (async (canales, guildId, options) => {
            let count = 0;
            for (const [, canal] of canales) {
                try {
                    await canal.permissionOverwrites.edit(guildId, options);
                    count++;
                } catch (e) {
                    console.warn(`⚠️ No se pudo editar ${canal.name}:`, e.message || e);
                }
            }
            return count;
        });

        let contador = 0;

        try {
            if (sub === 'panico') {
                contador = await editFn(canales, interaction.guild.id, { SendMessages: false });
                return interaction.editReply({
                    content: `🚨 **MODO PÁNICO ACTIVADO**\nSe han bloqueado **${contador}** canales. Nadie (excepto administradores) puede escribir.`
                });
            }

            if (sub === 'calma') {
                contador = await editFn(canales, interaction.guild.id, { SendMessages: null });
                return interaction.editReply({
                    content: `🕊️ **MODO CALMA ACTIVADO**\nSe ha restaurado el acceso en **${contador}** canales.`
                });
            }

            // Subcomando no reconocido
            return interaction.editReply({ content: '❌ Subcomando desconocido.' });

        } catch (error) {
            console.error('❌ Error ejecutando /seguridad:', error);
            return interaction.editReply({ content: '❌ Ocurrió un error al aplicar los permisos. Revisa los logs.' });
        }
    }
};
