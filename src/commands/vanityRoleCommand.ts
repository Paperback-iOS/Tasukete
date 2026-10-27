import { ChatInputCommandInteraction, GuildEmoji, GuildMember, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { VanityRole } from '../managers/vanityRolesManager'
import { VanityRolesModule } from '../models/LiveConfig'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class VanityRoleCommand implements Command {
    get moduleConfig(): VanityRolesModule | undefined {
        return discordBot.liveConfig.modules?.vanityRoles
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('vanityrole')
            .setDescription('Create or update a vanity role')
            .addStringOption(builder => builder
                .setName('name')
                .setDescription('Name for the role')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('color')
                .setDescription('The color for the role')
                .setRequired(false)
            )
            .addStringOption(builder => builder
                .setName('emote')
                .setDescription('The icon to use')
                .setRequired(false)
            )
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(this.moduleConfig?.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageRoles)) {
            await interaction.reply({ 
                content: 'You are not authorized to use this command',
                flags: MessageFlags.Ephemeral
            })
            return
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        
        let color = NaN
        const colorString = interaction.options.getString('color', false)?.match(/([a-f0-9]){6}$/gi)
        if (colorString && colorString.length > 0) {
            color = Number(`0x${colorString}`)
        }

        let iconEmoji: GuildEmoji | undefined = undefined
        const iconString = interaction.options.getString('emote', false)
        if (iconString) {
            iconEmoji = await (await discordBot.guild).emojis.fetch(iconString.replace(/[<>]/gi, '').split(':').pop() ?? '')
        }

        const vanityRole: VanityRole = {
            name: interaction.options.getString('name', true),
            color: isNaN(color) ? undefined : color,
            icon: iconEmoji
        }

        const role = await discordBot.vanityRolesManager.updateOrCreateRole(vanityRole, interaction.member as GuildMember)
        
        await (interaction.member as GuildMember)?.roles.add(role)

        await interaction.followUp({content: 'Successfully updated role list', flags: MessageFlags.Ephemeral})
    }

}
