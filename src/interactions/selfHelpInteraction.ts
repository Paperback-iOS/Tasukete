import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction, MessageFlags } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { IExecutableInteraction } from './interaction'

export default class SelfHelpInteraction implements IExecutableInteraction {
    async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton()) return

        if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
            await interaction.deferUpdate()
        } else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
            console.log('defering reply')
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction('self-help')
        if (!liveInteraction) {
            await interaction.editReply('Unable to find \'self-help\' live interaction, please make sure its loaded')
            return
        }

        await interaction.editReply(
            new MessageLiveInteraction(liveInteraction)
                .toMessage({
                    components: [
                        new ActionRowBuilder<ButtonBuilder>()
                            .setComponents([
                                new ButtonBuilder()
                                    .setLabel('My issue is not listed')
                                    .setCustomId('supportThreadAcknowledgementInteraction')
                                    .setStyle(ButtonStyle.Primary),
                            ])
                    ]
                })
        )
    }
}