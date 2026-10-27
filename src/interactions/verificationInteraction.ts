import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, GuildMember, MessageFlags } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { MultiButtonOptionInteraction } from './interaction'

export default class VerificationInteraction extends MultiButtonOptionInteraction {
    async executeDefaultOption(interaction: ButtonInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        const liveInteractionId = discordBot.liveConfig.modules?.verification?.interactions?.rulesAcknowledgementInteractionPath
        if (!liveInteractionId) {
            await interaction.editReply('`interactions.rules_acknowledgement` is not set')
            return
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if (!liveInteraction) {
            await interaction.editReply('Unable to find \'serverRulesAcknowledgement\' live interaction, please make sure it\'s loaded.')
            return
        }

        await new MessageLiveInteraction(liveInteraction)
            .replyToInteraction(interaction, {
                components: [
                    new ActionRowBuilder<ButtonBuilder>()
                        .addComponents([
                            new ButtonBuilder()
                                .setLabel('Accept')
                                .setStyle(ButtonStyle.Danger)
                                .setCustomId('verificationInteraction#accept'),
                        ])
                ]
            })
    }

    async executeWithOption(option: string, interaction: ButtonInteraction<CacheType>): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })

        switch (option) {
        case 'accept':
            this.verifyGuildMember(interaction.member as GuildMember, interaction)
            break
        default:
            await interaction.editReply({ content: '**ERROR:** Invalid option selected' })
            break
        }
    }

    async verifyGuildMember(member: GuildMember | undefined, interaction: ButtonInteraction) {
        if (member?.roles) {
            try {
                const verifiedRoleId = discordBot.liveConfig.modules?.verification?.verifiedRole
                if (!verifiedRoleId) {
                    await interaction.editReply('`verified_role` is not set')
                    return
                }

                await member.roles.add(verifiedRoleId)
                await interaction.followUp({ content: 'Enjoy your stay!', flags: MessageFlags.Ephemeral })
            } catch (error: any) {
                await interaction.followUp({ content: error.message, flags: MessageFlags.Ephemeral })
            }
        } else {
            await interaction.followUp({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral })
        }
    }

}