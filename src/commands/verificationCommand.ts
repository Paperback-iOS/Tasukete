import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, GuildMember, MessageFlags, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { resolveButtonStyle } from '../models/liveCompat'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class VerificationCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('verification')
            .setDescription('Display the Verification prompt')
            .setDefaultMemberPermissions((discordBot.liveConfig.modules?.verification?.enabled ?? false) ? null : 0)
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(discordBot.liveConfig.modules?.verification?.permissions, interaction.member as GuildMember)) {
            await interaction.reply({ content: 'You are not allowed to use this command', flags: MessageFlags.Ephemeral })
            return
        }
        
        await interaction.deferReply()

        const liveInteractionId = discordBot.liveConfig.modules?.verification?.interactions?.initialMessageInteractionPath
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
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('verificationInteraction')
                            .setLabel(discordBot.liveConfig.modules?.verification?.button?.title ?? 'Verify')
                            .setStyle(resolveButtonStyle(discordBot.liveConfig.modules?.verification?.button?.type, ButtonStyle.Primary)),
                    )
                    
            ]
        })
    }

}
