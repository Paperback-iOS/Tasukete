import { CacheType, ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { stripIndent } from 'common-tags'
import { discordBot } from '..'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class ListWarnsCommand implements Command {
    get moduleConfig() {
        return discordBot.liveConfig.modules?.moderation
    }

    get warnConfig() {
        return this.moduleConfig?.warnConfig ?? {}
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('listwarns')
            .setDescription('Mute a user for a specified duration')
            .addUserOption(builder => builder
                .setName('user')
                .setDescription('the user to list the warns for')
                .setRequired(true)
            )
            .setDefaultMemberPermissions((this.moduleConfig?.enabled == true) ? null : 0)
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        if (!hasPermission(this.warnConfig.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageRoles)) {
            throw new Error('You\'re not authorized to use this command')
        }

        await interaction.deferReply()
        
        const user = interaction.options.getMember('user')
        if (!(user instanceof GuildMember)) {
            throw new Error('something went wrong, please report to Paper')
        }
        
        try {
            const warns = await discordBot.moderationManager.getWarnsForUser(user.id)

            await interaction.editReply({
                embeds: [{
                    fields: warns?.map((warn, index) => {
                        return {
                            name: `Warn #${index}`,
                            value: stripIndent`
                                **Moderator:** <@${warn.moderator}>
                                **Action:** ${warn.action?.action}
                                ${warn.action?.duration ? `**Duration:** ${warn.action}` : '\u0008'}
                                **Date:** ${warn.date}
                                **Reason:** ${warn.reason}
                            `,
                            inline: true
                        }
                    }) ?? []
                }]
            })
        } catch(error: any) {
            await interaction.editReply(error.message ?? error)
        }
    }

}