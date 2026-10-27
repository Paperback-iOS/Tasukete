import { CacheType, ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class WarnCommand implements Command {
    get moduleConfig() {
        return discordBot.liveConfig.modules?.moderation
    }

    get warnConfig() {
        return this.moduleConfig?.warnConfig ?? {}
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Mute a user for a specified duration')
            .addUserOption(builder => builder
                .setName('user')
                .setDescription('the user to warn')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('reason')
                .setDescription('the reason for the warn')
                .setRequired(true)
            )
            .setDefaultMemberPermissions((this.moduleConfig?.enabled == true && (this.moduleConfig.warnConfig?.levels?.length ?? 0) > 0) ? null : 0)
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
        
        const reason = interaction.options.getString('reason', true)
        
        try {
            await discordBot.moderationManager.warnMember(
                user,
                interaction.user,
                reason
            )

            await interaction.editReply(`Warned ${user}. **Reason**: ${reason}`)
        } catch(error: any) {
            await interaction.editReply(error.message ?? error)
        }
    }

}