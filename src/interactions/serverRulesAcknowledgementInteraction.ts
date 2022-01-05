import { GuildMember, Interaction, MessageActionRow, MessageButton, MessageComponentInteraction, MessageFlags, MessageInteraction, User } from "discord.js";
import { discordBot } from "..";
import { Constants } from "../constants";
import { MessageLiveInteraction } from "../models/MessageLiveInteraction";
import { IExecutableInteraction } from "./interaction";

export default class ServerRulesAcknowledgementInteraction implements IExecutableInteraction {
    async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isMessageComponent()) {
            return
        }

        const metadata = interaction.customId.split('#')
        if (metadata.length > 1 && metadata[0] === 'serverRulesAcknowledgementInteraction') {
            await interaction.update({ components: [] })

            switch (metadata[1]) {
                case 'accept':
                    if ((interaction.member as GuildMember).roles) {
                        try {
                            await this.assignMemberRoleToGuildMember(interaction.member as GuildMember)
                            await interaction.followUp({ content: 'Enjoy your stay!', ephemeral: true })
                        } catch (error: any) {
                            await interaction.followUp({ content: error.message, ephemeral: true })
                        }
                    } else {
                        await interaction.followUp({ content: 'Something went wrong.', ephemeral: true })
                    }
                    break
                case 'deny':
                    break
                default:
                    await interaction.followUp({ content: 'Invalid option selected.', ephemeral: true })
                    break
            }
            return
        }

        if ((interaction.message.flags?.valueOf() ?? 0) & MessageFlags.resolve('EPHEMERAL')) {
            await interaction.deferUpdate()
        } else {
            await interaction.deferReply({ephemeral: true})
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction('serverRulesAcknowledgement')
        if (!liveInteraction) {
            await interaction.editReply('Unable to find \'serverRulesAcknowledgement\' live interaction, please make sure it\'s loaded.')
            return
        }

        await new MessageLiveInteraction(liveInteraction)
            .replyToInteraction(interaction, {
                components: [
                    new MessageActionRow()
                        .addComponents([
                            new MessageButton()
                                .setLabel('Accept')
                                .setStyle('DANGER')
                                .setCustomId('serverRulesAcknowledgementInteraction#accept'),
                            new MessageButton()
                                .setLabel('Deny')
                                .setStyle('SECONDARY')
                                .setCustomId('serverRulesAcknowledgementInteraction#deny')
                        ])
                ]
            })
    }

    async assignMemberRoleToGuildMember(guildMember: GuildMember): Promise<void> {
        if (guildMember.roles.cache.has(Constants.MEMBER_ROLE_ID)) {
            throw new Error('You already have the role.')
        }

        await guildMember.roles.add(Constants.MEMBER_ROLE_ID)
    }
}
