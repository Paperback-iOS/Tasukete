import { ChatInputCommandInteraction, GuildMember, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { RoleKit, RoleKitsModule } from '../models/LiveConfig'
import { hasPermission, cleanString } from '../utils'
import { Command } from './command'

export default class RoleKitsCommand implements Command {
    get moduleConfig(): RoleKitsModule | undefined {
        return discordBot.liveConfig.modules?.roleKits
    }

    get roleKits(): Record<string, RoleKit> {
        return this.moduleConfig?.kits ?? {}
    }

    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('rolekit')
            .setDescription('Give a user a role kit')
            .addMentionableOption(builder => builder
                .setName('user')
                .setDescription('User to give the kit to')
                .setRequired(true)
            )
            .addStringOption(builder => builder
                .setName('kit')
                .setDescription('The kit to give')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(this.roleKits)
                        .map(key => ({ name: this.roleKits[key].name ?? key, value: key }))
                )
            )
            .setDefaultMemberPermissions((this.moduleConfig?.enabled ?? false) ? null : 0)
            .toJSON()
    }

    getCommandAliasMetadata(): RESTPostAPIApplicationCommandsJSONBody[] {
        return <RESTPostAPIApplicationCommandsJSONBody[]> Object.keys(this.roleKits).map(key => {
            const value = this.roleKits[key]
            if(!value.exportAsCommand) return undefined

            return new SlashCommandBuilder()
                .setName(cleanString(key))
                .setDescription('Give `'+key+'` kit to a user')
                .addMentionableOption(builder => builder
                    .setName('user')
                    .setDescription('User to give the kit to')
                    .setRequired(true)
                )
                .toJSON()
        }).filter(x => x)
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {        
        if (!hasPermission(this.moduleConfig?.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageRoles)) {
            await interaction.reply({ content: 'You dont have permission to use this command', flags: MessageFlags.Ephemeral })
            return
        }
        
        await interaction.deferReply()
        
        const member = interaction.options.getMentionable('user', true) as GuildMember
        const roleKitName = interaction.commandName == 'rolekit' ? interaction.options.getString('kit', true) : interaction.commandName
        const roleKit = this.roleKits[roleKitName]
        if (!roleKit) {
            await interaction.editReply(`Role kit with the name ${roleKitName} does not exist`)
            return
        }

        if (!hasPermission(roleKit.permissions, interaction.member as GuildMember)) {
            await interaction.editReply(`You are not allowed to give this role kit ${roleKit.name ?? roleKitName}`)
            return
        }
        
        if (roleKit.addRoles && roleKit.addRoles.length > 0)
            await member.roles.add(roleKit.addRoles)
        if (roleKit.removeRoles && roleKit.removeRoles.length > 0)
            await member.roles.remove(roleKit.removeRoles)
        
        await interaction.editReply(`Successfully gave <@${member.id}> the role kit ${roleKit.name ?? roleKitName}`)
    }

}
