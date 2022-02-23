import { Interaction, Message, MessageActionRow, MessageButton, MessageEmbed, MessageFlags, MessagePayload, TextChannel } from "discord.js";
import { discordBot } from "..";
import { Constants } from "../constants";
import { MessageLiveInteraction } from "../models/MessageLiveInteraction";
import { IExecutableInteraction } from "./interaction";

export default class SupportThreadConfirmationInteraction implements IExecutableInteraction {
    async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton()) return

        const metadata = interaction.customId.split('#')
        if (metadata.length > 1 && metadata[0] === 'supportThreadAcknowledgementInteraction') {
            await interaction.update({ components: [] })

            switch (metadata[1]) {
                case 'accept':
                    const supportChannel = await discordBot.client.channels.fetch(Constants.SUPPORT_CHANNEL_ID)
                    if (!supportChannel) {
                        await interaction.followUp({ content: 'Could not fetch support channel details.', ephemeral: false })
                        return
                    }

                    if (!supportChannel.isText()) {
                        await interaction.followUp({ content: 'Support channel is not a text channel.', ephemeral: false })
                        return
                    }

                    if (!(supportChannel as TextChannel).threads) {
                        await interaction.followUp({ content: 'Support channel is does not allow threads.', ephemeral: false })
                        return
                    }

                    const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction('supportThreadPrompt')
                    if (!liveInteraction) {
                        await interaction.followUp({ content: 'Unable to find \'supportThreadPrompt\' live interaction, please make sure its loaded', ephemeral: false })
                        return
                    }

                    try {
                        const thread = await (supportChannel as TextChannel).threads.create({
                            name: `Support Thread - ${interaction.user.id}`,
                            autoArchiveDuration: 60,
                            type: "GUILD_PUBLIC_THREAD",
                            invitable: true
                        })

                        await thread.members.add(interaction.user)
                        await thread.send(new MessageLiveInteraction(liveInteraction).toMessage())
                        await thread.setLocked(true)
                    } catch (error: any) {
                        await interaction.editReply('Unable to create a thread.')
                        console.error(error)
                    }
                    break
                default:
                    await interaction.followUp({ content: 'Invalid option selected', ephemeral: true })
                    break
            }
            return
        }

        console.log((interaction.message.flags?.valueOf() ?? 0) & MessageFlags.resolve('EPHEMERAL'))
        if ((interaction.message.flags?.valueOf() ?? 0) & MessageFlags.resolve('EPHEMERAL')) {
            await interaction.deferUpdate()
        } else {
            await interaction.deferReply({ephemeral: true})
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction('supportDisclaimer')
        if (!liveInteraction) {
            await interaction.editReply('Unable to find \'supportDisclaimer\' live interaction, please make sure its loaded')
            return
        }

        await new MessageLiveInteraction(liveInteraction)
            .replyToInteraction(interaction, {
                components: [
                    new MessageActionRow()
                        .addComponents([
                            new MessageButton()
                                .setLabel('I Understand, Open Thread')
                                .setStyle('DANGER')
                                .setCustomId('supportThreadAcknowledgementInteraction#accept'),
                            new MessageButton()
                                .setLabel('Display Help Topics')
                                .setStyle('PRIMARY')
                                .setCustomId('selfHelpInteraction')
                        ])
                ]
            })
    }
}