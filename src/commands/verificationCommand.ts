import { SlashCommandBuilder } from '@discordjs/builders'
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types'
import { CommandInteraction, Guild, GuildMember, MessageActionRow, MessageButton } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { Command } from './command'

export default class VerificationCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('verification')
            .setDescription('Display the Verification prompt')
            .toJSON()
    }

    async execute(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply()

        const permissionRole = discordBot.liveConfig.modules?.verification?.permission
        if (permissionRole) {
            if (!(interaction.member as GuildMember)?.roles.cache.has(permissionRole)) {
                await interaction.editReply({ content: `Command restricted to <@${permissionRole}>` })
                return
            }
        }

        const liveInteractionId = discordBot.liveConfig.modules?.verification?.interactions?.initial_message
        if (!liveInteractionId) {
            await interaction.editReply('**ERROR:** `interactions.initial_message` not set')
            return
        }
        
        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if (!liveInteraction) {
            await interaction.editReply('**ERROR:** Unable to parse live interaction for id ' + liveInteractionId)
            return
        }

        const message = new MessageLiveInteraction(liveInteraction)
        await message.replyToInteraction(interaction, {
            components: [
                new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('verificationInteraction')
                            .setLabel(discordBot.liveConfig.modules?.verification?.button?.title ?? 'Verify')
                            .setStyle(discordBot.liveConfig.modules?.verification?.button?.type ?? 'PRIMARY'),
                    )
                    
            ]
        })
    }

}
