import { APIInteractionGuildMember } from 'discord-api-types'
import { GuildMember, Interaction, InteractionReplyOptions, Message, MessageActionRow, MessageButton, MessageOptions, MessageSelectMenu } from 'discord.js'
import { LiveInteraction } from '../managers/liveCommandManager'


// @deprecated use LiveInteraction.asMessage()
export class MessageLiveInteraction {
    constructor(public liveInteraction: LiveInteraction) { }

    userIsAllowedToExecute(user: GuildMember | null): boolean {
        if (!user || !user.roles || !user.roles.cache) {
            if (this.liveInteraction.permissions?.blacklist || this.liveInteraction.permissions?.whitelist) return false
            return true
        }

        const roles = user.roles.cache

        if (this.liveInteraction.permissions?.blacklist) {
            if (roles.hasAny(...(this.liveInteraction.permissions?.blacklist ?? []))) return false
            else return true
        } else if (this.liveInteraction.permissions?.whitelist) {
            if (roles.hasAny(...(this.liveInteraction.permissions?.whitelist ?? []))) return true
            else return false
        }

        return true
    }

    async replyToInteraction(interaction: Interaction, content: MessageOptions | InteractionReplyOptions = {}): Promise<void> {
        if (!interaction.isMessageComponent() && !interaction.isCommand()) {
            console.log('interaction not a message component')
            return
        }

        if (!this.userIsAllowedToExecute(interaction.member as GuildMember)){
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({content: 'You don\'t have permission to execute this interaction.'})
            } else {
                await interaction.reply({ content: 'You don\'t have permission to execute this interaction.'})
            }
            return
        }

        if (interaction.replied || interaction.deferred) {
            console.log('editing reply')
            await interaction.editReply(this.toMessage(content))
        } else {
            console.log('replying')
            await interaction.reply(this.toMessage(content))
        }
    }

    toMessage(content: MessageOptions = {}): MessageOptions {
        const message: MessageOptions = {
            content: this.liveInteraction.content,
            embeds: this.liveInteraction.embeds ?? [],
            components: [],
            ...content
        }

        const buttons = <MessageButton[]>this.liveInteraction.buttons?.map(button => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (!button.url) return undefined

            return new MessageButton(button)
        }).filter(x => x)

        if (buttons && buttons.length > 0) {
            message.components?.unshift(
                new MessageActionRow()
                    .addComponents(buttons)
            )
        }

        if (this.liveInteraction.options && this.liveInteraction.options.length > 0) {
            message.components?.unshift(
                new MessageActionRow()
                    .addComponents(
                        new MessageSelectMenu()
                            .setCustomId('liveInteraction')
                            .setMaxValues(1)
                            .setMinValues(1)
                            .setPlaceholder('Topic')
                            .addOptions(this.liveInteraction.options)
                    )
            )
        }

        return message
    }
}