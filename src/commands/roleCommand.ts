import { SlashCommandBuilder } from '@discordjs/builders'
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types'
import { CommandInteraction, Guild, GuildMember, GuildMemberRoleManager, MessageActionRow, MessageButton, RoleManager } from 'discord.js'
import { discordBot } from '..'
import { ModerationActionType } from '../managers/databaseManager'
import { RoleKit, RoleKitsModule } from '../models/LiveConfig'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { parseHumanDate } from '../utils'
import { Command } from './command'

export default class RoleCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('role')
            .setDescription('Give a user a role')
            .addMentionableOption(builder => builder
                .setName('user')
                .setDescription('User to give the kit to')
                .setRequired(true)
            )
            .addRoleOption(builder => builder
                .setName('role')
                .setDescription('The role to give')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('reason')
                .setDescription('reason to give out this role')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('duration')
                .setDescription('Accepted format: <number> min(s)/hr(s)/day(s)/month(s)/year(s)')
                .setRequired(false)
            )
            .toJSON()
    }

    async execute(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply()

        if (!interaction.memberPermissions?.has('MANAGE_ROLES')) {
            await interaction.editReply('You are not authorized to use this command')
            return
        }

        const member = interaction.options.getMentionable('user', true) as GuildMember
        const role = interaction.options.getRole('role', true)
        const rawDuration = interaction.options.getString('duration')
        const reason = interaction.options.getString('reason', true)
        const removeRole = member.roles.cache.has(role.id) && !rawDuration

        const highestRole = (interaction.member?.roles as GuildMemberRoleManager).highest
        if (!highestRole || highestRole.position < role.position) {
            await interaction.editReply('Role position is higher than the highest role you have')
            return
        }

        const now = new Date()

        await discordBot.moderationManager.handleModerationAction({
            subactions: [{
                metadata: role.id,
                type: removeRole ? ModerationActionType.ROLE_REMOVE : ModerationActionType.ROLE_ADD
            }],
            queueTime: now,
            executionTime: now,
            moderator: interaction.user.id,
            target: member.id,
            reason: `${reason} ${rawDuration ? `**DURATION:** ${rawDuration}` : ''}`
        })

        if (rawDuration) {
            const duration = parseHumanDate(rawDuration)
            if (duration == 0) return
            const end = new Date(Date.now() + duration)
            const endInSeconds = (end.getTime()/1000).toFixed(0)

            await discordBot.moderationManager.queueModerationAction(
                `${member.id}_${role.id}_TEMPROLE`,
                {
                    subactions: [
                        {
                            metadata: role.id,
                            type: ModerationActionType.ROLE_REMOVE
                        }
                    ],
                    queueTime: now,
                    executionTime: end,
                    moderator: interaction.user.id,
                    target: member.id,
                    reason: reason
                }
            )

            await interaction.editReply(`The role ${role.name} will be removed from <@${member.id}> on <t:${endInSeconds}:F>(<t:${endInSeconds}:R>)`)
        } else {
            if (removeRole) {
                await interaction.editReply(`Successfully removed the role \`${role.name}\` from <@${member.id}>`)
            }
            else {
                await interaction.editReply(`Successfully gave <@${member.id}> the role \`${role.name}\``)
            }
        }
        
    }
}
