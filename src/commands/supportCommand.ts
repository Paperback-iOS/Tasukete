import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, GuildMember, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { resolveButtonStyle } from '../models/liveCompat'

import { discordBot } from '..'
import { SupportThreadConfigs, SupportThreadsModule } from '../models/LiveConfig'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class SupportCommand implements Command {
    get moduleConfig(): SupportThreadsModule | undefined {
        return discordBot.liveConfig.modules?.supportThreads
    }

    get threadConfigs(): Record<string, SupportThreadConfigs> {
        return this.moduleConfig?.configs ?? {}
    }
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        
        return new SlashCommandBuilder()
            .setName('supportthreads')
            .setDescription('Display support thread opening button')
            .addStringOption(builder => builder
                .setName('configname')
                .setDescription('Config name for support threads.')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(this.threadConfigs)
                        .map(key => ({ name: key, value: key }))
                )
            )
            .setDefaultMemberPermissions((this.moduleConfig?.enabled ?? false) ? null : 0)
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(this.moduleConfig?.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageThreads)) {
            await interaction.reply({ content: 'You dont have permission to use this command', flags: MessageFlags.Ephemeral })
            return
        }
        
        await interaction.deferReply()

        const configName = interaction.options.getString('configname')
        if (!configName) {
            await interaction.editReply('**ERROR:** `configName` not set')
            return
        }

        const config = this.moduleConfig?.configs?.[configName]
        if (!config) {
            await interaction.editReply('**ERROR:** Could not find the support thread config ' + configName)
            return
        }
        
        const liveInteractionId = config.displayInteractionPath
        if (!liveInteractionId) {
            await interaction.editReply('**ERROR:** displayInteractionPath not set ' + config.displayInteractionPath)
            return
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if (!liveInteraction) {
            await interaction.editReply('**ERROR:** Unable to parse live interaction for id ' + liveInteractionId)
            return
        }

        const message = new MessageLiveInteraction(liveInteraction)
        await message.replyToInteraction(interaction, {
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('supportThreadAcknowledgementInteraction#display&' + configName)
                            .setLabel(config.supportThreadButton?.title ?? 'Open Thread')
                            .setStyle(resolveButtonStyle(config.supportThreadButton?.type, ButtonStyle.Primary)),
                        
                        ...(() => config.troubleshootButton != undefined ? [
                            new ButtonBuilder()
                                .setCustomId('liveInteraction#' + config.troubleshootInteractionPath)
                                .setLabel(config.troubleshootButton?.title ?? 'Troubleshoot')
                                .setStyle(resolveButtonStyle(config.troubleshootButton?.type, ButtonStyle.Success)),
                        ] : [])()
                    ),
            ]
        })
    }

}
