import { ActionRowBuilder, BaseMessageOptions, ButtonBuilder, GuildMember, Interaction, InteractionReplyOptions, Message, MessageActionRowComponentBuilder, StringSelectMenuBuilder } from 'discord.js'
import { LiveInteraction } from '../managers/liveCommandManager'
import { hasPermission } from '../utils'
import { legacyButton, legacyEmbed } from './liveCompat'


// @deprecated use LiveInteraction.asMessage()
export class MessageLiveInteraction {
    constructor(public liveInteraction: LiveInteraction) { }

    memberIsAllowedToExecute(member: GuildMember | null): boolean {
        return hasPermission(this.liveInteraction.permissions, member)
    }

    async replyToInteraction(interaction: Interaction, content: BaseMessageOptions = {}): Promise<Message | undefined> {
        if (!interaction.isMessageComponent() && !interaction.isChatInputCommand()) {
            console.log('interaction not a message component')
            return
        }

        if (!this.memberIsAllowedToExecute(interaction.member as GuildMember)){
            if (interaction.replied || interaction.deferred) {
                return interaction.editReply({content: 'You don\'t have permission to execute this interaction.'})
            } else {
                return (await interaction.reply({ content: 'You don\'t have permission to execute this interaction.', withResponse: true })).resource?.message ?? undefined
            }
        }

        if (interaction.replied || interaction.deferred) {
            return interaction.editReply(this.toMessage(content))
        } else {
            return (await interaction.reply({...this.toMessage(content) as InteractionReplyOptions, withResponse: true})).resource?.message ?? undefined
        }
    }

    toMessage(content: BaseMessageOptions = {}): BaseMessageOptions & { components: ActionRowBuilder<MessageActionRowComponentBuilder>[] } {
        const components = [...(content.components ?? [])] as ActionRowBuilder<MessageActionRowComponentBuilder>[]
        const message = {
            content: this.liveInteraction.content,
            embeds: (this.liveInteraction.embeds ?? []).map(legacyEmbed),
            ...content,
            components
        }

        const buttons = <ButtonBuilder[]>this.liveInteraction.buttons?.map(button => {
            if (button.customId && !button.customId.startsWith('liveInteraction'))
                return undefined
            
            return legacyButton(button)
        }).filter(x => x)

        if (buttons && buttons.length > 0) {
            components.unshift(
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(buttons)
            )
        }

        if (this.liveInteraction.options && this.liveInteraction.options.length > 0) {
            components.unshift(
                new ActionRowBuilder<StringSelectMenuBuilder>()
                    .addComponents(
                        new StringSelectMenuBuilder()
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
