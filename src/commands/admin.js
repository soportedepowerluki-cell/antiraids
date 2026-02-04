const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

module.exports = {
    // Definición del comando /seguridad
    data: new SlashCommandBuilder()
        .setName('seguridad')
        .setDescription('Panel de control para situaciones de riesgo')
        .addSubcommand(sub => 
            sub.setName('panico')
               .setDescription('Bloquea todos los canales de texto (Modo lectura)'))
        .addSubcommand(sub => 
            sub.setName('calma')
               .setDescription('Restaura los permisos de escritura en los canales'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo Admins

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        
        // Respondemos con un mensaje efímero (solo lo ve el admin) para no saturar
        await interaction.deferReply({ ephemeral: true });

        // Obtenemos solo los canales de texto del servidor
        const canales = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        let contador = 0;

        if (sub === 'panico') {
            for (const [id, canal] of canales) {
                try {
                    // Quitamos el permiso de enviar mensajes al rol @everyone
                    await canal.permissionOverwrites.edit(interaction.guild.id, {
                        SendMessages: false
                    });
                    contador++;
                } catch (error) {
                    console.error(`No pude bloquear el canal ${canal.name}:`, error);
                }
            }
            return interaction.editReply({
                content: `🚨 **MODO PÁNICO ACTIVADO**\nSe han bloqueado **${contador}** canales. Nadie (excepto administradores) puede escribir.`
            });
        }

        if (sub === 'calma') {
            for (const [id, canal] of canales) {
                try {
                    // Reseteamos el permiso (null vuelve a la configuración base del canal)
                    await canal.permissionOverwrites.edit(interaction.guild.id, {
                        SendMessages: null
                    });
                    contador++;
                } catch (error) {
                    console.error(`No pude desbloquear el canal ${canal.name}:`, error);
                }
            }
            return interaction.editReply({
                content: `🕊️ **MODO CALMA ACTIVADO**\nSe ha restaurado el acceso en **${contador}** canales.`
            });
        }
    }
};
