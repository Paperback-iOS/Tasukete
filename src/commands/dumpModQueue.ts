import { CacheType, ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class DumpModQueueCommand implements Command {
    get moduleConfig() {
        return discordBot.liveConfig.modules?.moderation
    }

    get warnConfig() {
        return this.moduleConfig?.warnConfig ?? {}
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('dumpmodqueue')
            .setDescription('dump everything queued')
            .setDefaultMemberPermissions((this.moduleConfig?.enabled == true) ? null : 0)
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        if (!hasPermission(this.warnConfig.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageRoles)) {
            throw new Error('You\'re not authorized to use this command')
        }

        await interaction.deferReply()
        
        try {
            const queue = discordBot.moderationManager.getAllQueuedModerationActions()

            await interaction.editReply({
                embeds: Object.values(queue).map(({ action }) => discordBot.moderationManager.getEmbedForModerationAction(action))
            })
        } catch(error: any) {
            await interaction.editReply(error.message ?? error)
        }
    }

}