import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelType, MessageFlags, TextChannel } from 'discord.js'
import { resolveButtonStyle } from '../models/liveCompat'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { MultiButtonOptionInteraction } from './interaction'

export default class SupportThreadConfirmationInteraction extends MultiButtonOptionInteraction {
    async executeDefaultOption(interaction: ButtonInteraction<CacheType>): Promise<void> {
        await interaction.reply({content:'Invalid option', flags: MessageFlags.Ephemeral})
    }

    async executeWithOption(option: string, interaction: ButtonInteraction<CacheType>): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        if (option.startsWith('display')) {
            const configName = option.split('&')[1]
            if (!configName) {
                await interaction.editReply('**ERROR:** `configName` not set')
                return
            }
    
            const config = discordBot.liveConfig.modules?.supportThreads?.configs?.[configName]
            if (!config) {
                await interaction.editReply('**ERROR:** Could not find the support thread config ' + configName)
                return
            }

            const interactionId = config.supportThreadConfirmationInteractionPath
            if (!interactionId) {
                await interaction.editReply('supportThreadConfirmationInteractionPath not set')
                return
            }

            const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(interactionId)
            if (!liveInteraction) {
                await interaction.editReply('Unable to find \'supportDisclaimer\' live interaction, please make sure its loaded')
                return
            }

            await new MessageLiveInteraction(liveInteraction)
                .replyToInteraction(interaction, {
                    components: [
                        new ActionRowBuilder<ButtonBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setLabel('Continue')
                                    .setStyle(ButtonStyle.Danger)
                                    .setCustomId('supportThreadAcknowledgementInteraction#accept&'+configName),
                                new ButtonBuilder()
                                    .setLabel('Cancel')
                                    .setStyle(ButtonStyle.Primary)
                                    .setCustomId('supportThreadAcknowledgementInteraction#deny'),
                        
                                ...(() => config.troubleshootButton != undefined ? [
                                    new ButtonBuilder()
                                        .setCustomId('liveInteraction#' + config.troubleshootInteractionPath)
                                        .setLabel(config.troubleshootButton?.title ?? 'Troubleshoot')
                                        .setStyle(resolveButtonStyle(config.troubleshootButton?.type, ButtonStyle.Success)),
                                ] : [])()
                            )
                    ]
                })
        } else if (option.startsWith('accept')) {
            const configName = option.split('&')[1]
            if (!configName) {
                await interaction.editReply('**ERROR:** `configName` not set')
                return
            }
    
            const config = discordBot.liveConfig.modules?.supportThreads?.configs?.[configName]
            if (!config) {
                await interaction.editReply('**ERROR:** Could not find the support thread config ' + configName)
                return
            }

            const supportChannelId = config.supportThreadChannel
            if (!supportChannelId) {
                await interaction.followUp({ content: 'supportChannelId not set.' })
                return
            }
            
            const supportChannel = discordBot.client.channels.cache.get(supportChannelId)
            if (!supportChannel) {
                await interaction.followUp({ content: 'Could not fetch support channel details.' })
                return
            }

            if (!supportChannel.isTextBased()) {
                await interaction.followUp({ content: 'Support channel is not a text channel.' })
                return
            }

            if (!(supportChannel as TextChannel).threads) {
                await interaction.followUp({ content: 'Support channel does not allow threads.' })
                return
            }

            const liveInteractionId = config.supportThreadDisplayInteractionPath
            if (!liveInteractionId) {
                await interaction.followUp({ content: 'supportThreadDisplayInteractionPath not set' })
                return
            }

            const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
            if (!liveInteraction) {
                await interaction.followUp({ content: 'Unable to find \''+liveInteractionId+'\' live interaction, please make sure its loaded' })
                return
            }

            try {
                const thread = await (supportChannel as TextChannel).threads.create({
                    name: `Support Thread - ${interaction.user.id}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread,
                    invitable: true
                })

                await thread.members.add(interaction.user)
                await thread.send(new MessageLiveInteraction(liveInteraction).toMessage())
                await thread.setLocked(true)
            } catch (error: any) {
                await interaction.editReply('Unable to create a thread.')
                console.error(error)
            }
        } else if (option.startsWith('deny')) {
            return
        } else {
            await interaction.followUp({ content: 'Invalid option selected', flags: MessageFlags.Ephemeral })
            return
        }
    }
}