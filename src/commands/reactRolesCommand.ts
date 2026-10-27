import { ChatInputCommandInteraction, GuildMember, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { ReactRolesConfig, ReactRolesModule } from '../models/LiveConfig'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class ReactRolesCommand implements Command {
    get moduleConfig(): ReactRolesModule | undefined {
        return discordBot.liveConfig.modules?.reactRoles
    }

    get configs(): Record<string, ReactRolesConfig> {
        return this.moduleConfig?.configs ?? {}
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('reactroles')
            .setDescription('Display a message with reactions to get roles')
            .addStringOption(builder => builder
                .setName('config')
                .setDescription('The config to use')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(this.configs)
                        .map(key => ({ name: key, value: key }))
                )
            )
            .setDefaultMemberPermissions((this.moduleConfig?.enabled ?? false) ? null : 0)
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(this.moduleConfig?.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageRoles)) {
            await interaction.reply({ content: 'You dont have permission to use this command', flags: MessageFlags.Ephemeral })
            return
        }

        const configId = interaction.options.getString('config', true)
        const config = this.configs[configId]
        if (!config) {
            await interaction.reply({
                content: `Config with the name ${configId} does not exist`,
                flags: MessageFlags.Ephemeral
            })
            return
        }

        const response = await interaction.reply({
            embeds: [{
                title: config.title ?? 'Reaction Roles',
                color: config.color,
                description: (config.description ?? '')
                    + '\n\n'
                    + Object.entries(config.reactions ?? {})
                        .map(([emojiId, config]) => {
                            return `${emojiId.includes(':') ? `<:${emojiId}>` : emojiId} : ${config.description ?? `<@&${config.role ?? '0'}>`}`
                        }).join('\n'),
                footer: {
                    text: `reactRolesManager#${configId}`
                },
                image: config.image ? {
                    url: config.image
                } : undefined,
                timestamp: new Date().toISOString()
            }],
            withResponse: true
        })

        const message = response.resource?.message
        await Promise.all(Object.keys(config.reactions ?? {}).map(emoji => message?.react(emoji)))
    }

}
