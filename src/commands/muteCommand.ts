import { CacheType, ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { hasPermission, parseHumanDate } from '../utils'
import { Command } from './command'

export default class MuteCommand implements Command {
    get moduleConfig() {
        return discordBot.liveConfig.modules?.moderation
    }

    get muteConfig() {
        return this.moduleConfig?.muteConfig ?? {}
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('mute')
            .setDescription('Mute a user for a specified duration')
            .addUserOption(builder => builder
                .setName('user')
                .setDescription('the user to mute')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('duration')
                .setDescription('the duration to mute the user for')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('reason')
                .setDescription('the reason for the mute')
                .setRequired(true)
            )
            .setDefaultMemberPermissions((this.moduleConfig?.enabled == true && this.moduleConfig.muteConfig?.muteRole != undefined) ? null : 0)
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        if (!hasPermission(this.muteConfig.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageRoles)) {
            throw new Error('You\'re not authorized to use this command')
        }

        await interaction.deferReply()

        const user = interaction.options.getMember('user')
        if (!(user instanceof GuildMember)) {
            throw new Error('something went wrong, please report to Paper')
        }

        const duration = parseHumanDate(interaction.options.getString('duration', true))
        if (duration <= 0) {
            await interaction.editReply('Invalid duration. **Format:** <number> min/hr/day/wk/mth/yr')
            return
        }
        const reason = interaction.options.getString('reason', true)

        const currentDate = new Date()
        await discordBot.moderationManager.muteMember(
            user,
            interaction.user,
            reason,
            duration
        )

        await interaction.editReply(`Muted ${user} for ${duration}ms (until <t:${((currentDate.getTime() + duration)/1000).toFixed(0)}>). Reason: *${reason}*`)
    }

}