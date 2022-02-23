import { Interaction, MessageFlags } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { IExecutableInteraction } from './interaction'

export default class LiveInteractionSelect implements IExecutableInteraction {
    async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isSelectMenu()) return

        if ((interaction.message.flags?.valueOf() ?? 0) & MessageFlags.resolve('EPHEMERAL')) {
            await interaction.deferUpdate()
        } else {
            await interaction.deferReply({ephemeral: true})
        }

        if (interaction.values.length != 1) {
            await interaction.editReply('**ERROR:** Invalid selection')
            return
        }

        const liveInteractionId = interaction.values[0]
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