import { Interaction, MessageFlags } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { IExecutableInteraction } from './interaction'

export default class LiveInteractionSelect implements IExecutableInteraction {
    async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isStringSelectMenu() && !interaction.isButton()) return

        if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
            await interaction.deferUpdate()
        } else {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        }

        let liveInteractionId: string

        if (interaction.isStringSelectMenu()) {
            if (interaction.values.length != 1) {
                await interaction.editReply('**ERROR:** Invalid selection')
                return
            }
    
            liveInteractionId = interaction.values[0]
        } else {
            liveInteractionId = interaction.customId.split('#')[1]
        }


        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if(!liveInteraction) {
            await interaction.editReply('**ERROR:** Unable to resolve live interaction for id ' + liveInteractionId)
            return
        }

        await interaction.editReply(
            new MessageLiveInteraction(liveInteraction)
                .toMessage()
        )
    }
    
}