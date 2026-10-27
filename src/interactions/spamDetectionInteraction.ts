import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js'
import { discordBot } from '..'
import { MultiButtonOptionInteraction } from './interaction'

export default class SpamDetectionInteraction extends MultiButtonOptionInteraction {
    async executeDefaultOption(interaction: ButtonInteraction): Promise<void> {
        await interaction.reply({ content: 'Invalid option', flags: MessageFlags.Ephemeral })
    }

    async executeWithOption(option: string, interaction: ButtonInteraction): Promise<void> {
        const [action, rawFlagId, alertMessageId] = option.split('&')
        if (action == 'cancel') {
            await interaction.update({ content: 'Cancelled', components: [] })
            return
        }

        const flag = discordBot.databaseManager.getSpamFlag(Number(rawFlagId))
        if (!flag) {
            await interaction.reply({ content: `Spam flag #${rawFlagId} not found`, flags: MessageFlags.Ephemeral })
            return
        }

        const guild = await discordBot.guild

        if (action == 'untimeout') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
                await interaction.reply({ content: 'You need the Timeout Members permission to do this.', flags: MessageFlags.Ephemeral })
                return
            }

            const member = await guild.members.fetch(flag.userId).catch(() => undefined)
            if (member) {
                await member.timeout(null, `Spam flag #${flag.id} reviewed by ${interaction.user.tag}`)
            }

            discordBot.databaseManager.resolveSpamFlag(flag.id, 'TIMEOUT_REMOVED', interaction.user.id)
            await interaction.update({
                embeds: interaction.message.embeds.map(embed => EmbedBuilder.from(embed)
                    .setFooter({ text: `Timeout removed by ${interaction.user.tag}${member ? '' : ' (user already left)'}` })),
                components: []
            })
        } else if (action == 'ban') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
                await interaction.reply({ content: 'You need the Ban Members permission to do this.', flags: MessageFlags.Ephemeral })
                return
            }

            await interaction.reply({
                content: `Are you sure you want to ban <@${flag.userId}>?`,
                flags: MessageFlags.Ephemeral,
                components: [
                    new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Secondary)
                                .setCustomId('spamDetectionInteraction#cancel'),
                            new ButtonBuilder()
                                .setLabel('Ban')
                                .setStyle(ButtonStyle.Danger)
                                .setCustomId(`spamDetectionInteraction#confirmBan&${flag.id}&${interaction.message.id}`)
                        )
                ]
            })
        } else if (action == 'confirmBan') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
                await interaction.update({ content: 'You need the Ban Members permission to do this.', components: [] })
                return
            }

            await guild.members.ban(flag.userId, {
                reason: `Spam flag #${flag.id}: ${flag.reason} (banned by ${interaction.user.tag})`,
                deleteMessageSeconds: 60 * 60
            })

            discordBot.databaseManager.resolveSpamFlag(flag.id, 'BANNED', interaction.user.id)
            await interaction.update({ content: `Banned <@${flag.userId}>`, components: [] })

            const alertMessage = alertMessageId ? await interaction.channel?.messages.fetch(alertMessageId).catch(() => undefined) : undefined
            await alertMessage?.edit({
                embeds: alertMessage.embeds.map(embed => EmbedBuilder.from(embed)
                    .setFooter({ text: `Banned by ${interaction.user.tag}` })),
                components: []
            })
        } else {
            await interaction.reply({ content: 'Invalid option', flags: MessageFlags.Ephemeral })
        }
    }
}
