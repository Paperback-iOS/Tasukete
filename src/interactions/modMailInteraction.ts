import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, MessageFlags, ThreadChannel } from 'discord.js'
import { discordBot } from '..'
import { Constants } from '../constants'
import { ModMailModule } from '../models/LiveConfig'
import { MultiButtonOptionInteraction } from './interaction'

export default class ModMailInteraction extends MultiButtonOptionInteraction {
    get moduleConfig(): ModMailModule | undefined {
        return discordBot.liveConfig.modules?.modMail
    }

    async executeDefaultOption(interaction: ButtonInteraction): Promise<void> {
        await interaction.reply({ content: 'Invalid option', flags: MessageFlags.Ephemeral })
    }

    async executeWithOption(option: string, interaction: ButtonInteraction): Promise<void> {
        if (option.startsWith('openThread')) {
            await interaction.update({ components: [] })
    
            const guild = discordBot.client.guilds.cache.get(Constants.DISCORD_GUILD_ID)
            if (!guild) {
                throw new Error('Unable to find cached guild')
            }

            const messageId = option.split('&')[1]
            const message = await interaction.channel?.messages.fetch(messageId)
            if (!message) {
                throw new Error('Unable to fetch message')
            }

            const threadChannelId = this.moduleConfig?.channels?.threads
            if (!threadChannelId) {
                throw new Error('thread channel not defined for modmail')
            }

            const loggingChannelId = this.moduleConfig?.channels?.logging
            if (!loggingChannelId) {
                throw new Error('logging channel not defined for modmail')
            }

            const [threadChannel, loggingChannel] = await Promise.all([
                guild.channels.fetch(threadChannelId),
                guild.channels.fetch(loggingChannelId)
            ])

            if (!threadChannel?.isTextBased() || threadChannel.type != ChannelType.GuildText) {
                throw new Error('thread channel is not text based')
            }

            if (!loggingChannel?.isTextBased()) {
                throw new Error('logging channel is not text based')
            }

            let thread: ThreadChannel
            
            const existingThreadId = discordBot.databaseManager.getModMailThread(interaction.user.id)
            const existingThread = existingThreadId != undefined ? await threadChannel.threads.fetch(existingThreadId) : undefined

            if (existingThread != undefined && !existingThread.archived) {
                thread = existingThread
            } else {
                thread = await threadChannel.threads.create({
                    name: `ModMail by ${interaction.user.username} - ${interaction.user.id}`,
                    invitable: false,
                    autoArchiveDuration: 1440,
                    type: ChannelType.PrivateThread,
                })

                discordBot.databaseManager.setModMailThread(interaction.user.id, thread.id)
                
                await thread.members.add(interaction.user.id)
                
                await loggingChannel.send({
                    content: `You've got Mail, @here! **${interaction.user.tag}** - ${interaction.user.id} opened a thread`,
                    components: [
                        new ActionRowBuilder<ButtonBuilder>()
                            .addComponents(
                                new ButtonBuilder()
                                    .setLabel('Show Thread')
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(`https://discord.com/channels/${Constants.DISCORD_GUILD_ID}/${thread.id}`),
                                new ButtonBuilder()
                                    .setLabel('Close Thread')
                                    .setCustomId(`modMailInteraction#closeThread&${threadChannelId}/${thread.id}`)
                                    .setStyle(ButtonStyle.Danger)
                            )
                    ]
                })
            }

            await thread.send({
                content: `**User ID**: ${interaction.user.tag} - ${interaction.user.id}\n**Message**: ${message.cleanContent}\n**Attachments**:\n${message.attachments.map(x => x.proxyURL).join('\n')}`,
                allowedMentions: {
                    users: []
                }
            })

            await interaction.editReply(`Successfully opened a private thread with the admins, please use <#${thread.id}> for further communication`)
        } else if (option.startsWith('closeThread')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral })

            const query = option.split('&')
            const threadId = query[1]
            const messageId = interaction.message.id
            interaction.editReply({
                content: `Are you sure you want to close the thread <@${threadId.split('/')[1]}>?`,
                components: [
                    new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Primary)
                                .setCustomId('modMailInteraction#cancel'),
                            new ButtonBuilder()
                                .setLabel('Yes')
                                .setCustomId(`modMailInteraction#confirmCloseThread&${threadId}&${messageId}`)
                                .setStyle(ButtonStyle.Danger)
                        )
                ]
            })
        } else if (option.startsWith('confirmCloseThread')) {
            await interaction.update({ components: [] })

            const [threadInfo, messageId] = option.split('&').slice(1)
            const [threadChannelId, threadId] = threadInfo.split('/')

            const guild = await discordBot.guild

            const threadChannel = await guild?.channels.fetch(threadChannelId)
            if (threadChannel?.type != ChannelType.GuildText) {
                await interaction.editReply('thread parent channel is not a text based')
                return
            }

            const thread = await threadChannel.threads.fetch(threadId)

            if (!thread?.isThread()) {
                await interaction.editReply('Channel is not a thread')
                return
            }

            if (!thread.archived) {
                await thread.send({
                    content: `Thread closed by <@${interaction.user.id}>`,
                    allowedMentions: {
                        users: []
                    }
                })
                
                await thread.setLocked(true)
                await thread.setArchived(true)

                try {
                    const ogMessage = await interaction.channel?.messages.fetch({ message: messageId, force: true })
                    if (ogMessage) {
                        await ogMessage.edit({
                            content: `~~${ogMessage.content}~~\n\nClosed by <@${interaction.user.id}>`,
                            components: [
                                new ActionRowBuilder<ButtonBuilder>()
                                    .addComponents(
                                        new ButtonBuilder()
                                            .setLabel('Show Thread')
                                            .setStyle(ButtonStyle.Link)
                                            .setURL(`https://discord.com/channels/${Constants.DISCORD_GUILD_ID}/${thread.id}`)
                                    )
                            ]
                        })
                    } else {
                        throw new Error('Unable to fetch original message')
                    }
                } catch(error: any) {
                    await interaction.followUp({flags: MessageFlags.Ephemeral, content: error.message})
                    if (interaction.channel?.isSendable())
                        await interaction.channel.send(`Thread <#${thread.id}> closed by <@${interaction.user.id}>`)
                }
            } else {
                await interaction.editReply('Thread already closed')
            }
        } else {
            await interaction.update({ components: [] })
        }
    }
}