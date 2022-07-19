import { ButtonInteraction, Message, MessageActionRow, MessageButton, MessageManager, ThreadChannel } from 'discord.js'
import { discordBot } from '..'
import { Constants } from '../constants'
import { ModMailModule } from '../models/LiveConfig'
import { MultiButtonOptionInteraction } from './interaction'

export default class ModMailInteraction extends MultiButtonOptionInteraction {
    get moduleConfig(): ModMailModule | undefined {
        return discordBot.liveConfig.modules?.modMail
    }

    async executeDefaultOption(interaction: ButtonInteraction): Promise<void> {
        await interaction.reply({ content: 'Invalid option', ephemeral: true })
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

            if (!threadChannel?.isText() || threadChannel.type != 'GUILD_TEXT') {
                throw new Error('thread channel is not text based')
            }

            if (!loggingChannel?.isText()) {
                throw new Error('logging channel is not text based')
            }

            let thread: ThreadChannel
            
            const userDocument = discordBot.databaseManager.getUserDocument(interaction.user.id)
            const existingThreadId = await userDocument.get('modMailThread')
            const existingThread = existingThreadId != undefined ? await threadChannel.threads.fetch(existingThreadId) : undefined

            if (existingThread != undefined && !existingThread.archived) {
                thread = existingThread
            } else {
                thread = await threadChannel.threads.create({
                    name: `ModMail by ${interaction.user.username} - ${interaction.user.id}`,
                    invitable: false,
                    autoArchiveDuration: 1440,
                    type: 'GUILD_PRIVATE_THREAD',
                })

                await userDocument.set('modMailThread', thread.id)
                
                await thread.members.add(interaction.user.id)
                
                await loggingChannel.send({
                    content: `You've got Mail, @here! **${interaction.user.username}#${interaction.user.discriminator}** - ${interaction.user.id} opened a thread`,
                    components: [
                        new MessageActionRow()
                            .addComponents(
                                new MessageButton()
                                    .setLabel('Show Thread')
                                    .setStyle('LINK')
                                    .setURL(`https://discord.com/channels/${Constants.DISCORD_GUILD_ID}/${thread.id}`),
                                new MessageButton()
                                    .setLabel('Close Thread')
                                    .setCustomId(`modMailInteraction#closeThread&${threadChannelId}/${thread.id}`)
                                    .setStyle('DANGER')
                            )
                    ]
                })
            }

            await thread.send({
                content: `**User ID**: ${interaction.user.username}#${interaction.user.discriminator} - ${interaction.user.id}\n**Message**: ${message.cleanContent}\n**Attachments**:\n${message.attachments.map(x => x.proxyURL).join('\n')}`,
                allowedMentions: {
                    users: []
                }
            })

            await interaction.editReply(`Successfully opened a private thread with the admins, please use <#${thread.id}> for further communication`)
        } else if (option.startsWith('closeThread')) {
            await interaction.deferReply({ephemeral: true})

            const query = option.split('&')
            const threadId = query[1]
            const messageId = interaction.message.id
            interaction.editReply({
                content: `Are you sure you want to close the thread <@${threadId.split('/')[1]}>?`,
                components: [
                    new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setLabel('Cancel')
                                .setStyle('PRIMARY')
                                .setCustomId('modMailInteraction#cancel'),
                            new MessageButton()
                                .setLabel('Yes')
                                .setCustomId(`modMailInteraction#confirmCloseThread&${threadId}&${messageId}`)
                                .setStyle('DANGER')
                        )
                ]
            })
        } else if (option.startsWith('confirmCloseThread')) {
            await interaction.update({ components: [] })

            const [threadInfo, messageId] = option.split('&').slice(1)
            const [threadChannelId, threadId] = threadInfo.split('/')

            const guild = await discordBot.guild

            const threadChannel = await guild?.channels.fetch(threadChannelId)
            if (!threadChannel?.isText()) {
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
                    const ogMessage = await interaction.channel?.messages.fetch(messageId, {force: true})
                    if (ogMessage) {
                        await ogMessage.edit({
                            content: `~~You've got Mail, @here! **${interaction.user.username}#${interaction.user.discriminator}** - ${interaction.user.id} opened a thread~~\nClosed by <@${interaction.user.id}>`,
                            components: [
                                new MessageActionRow()
                                    .addComponents(
                                        new MessageButton()
                                            .setLabel('Show Thread')
                                            .setStyle('LINK')
                                            .setURL(`https://discord.com/channels/${Constants.DISCORD_GUILD_ID}/${thread.id}`)
                                    )
                            ]
                        })

                        await ogMessage.react('🔒')
                    } else {
                        throw new Error('Unable to fetch original message')
                    }
                } catch(error: any) {
                    await interaction.followUp({ephemeral: true, content: error.message})
                    await interaction.channel?.send(`Thread <#${thread.id}> closed by <@${interaction.user.id}>`)
                }
            } else {
                await interaction.editReply('Thread already closed')
            }
        } else {
            await interaction.update({ components: [] })
        }
    }
}