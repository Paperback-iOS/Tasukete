import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { Command } from './command'

export default class ReloadCommandsCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('reloadcommands')
            .setDescription('Reloads all the commands')
            .toJSON()
    }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
            await interaction.reply({content: 'Unauthorized to use this command', flags: MessageFlags.Ephemeral})
            return
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await discordBot.loadCommands()
        await interaction.editReply('Reloaded commands!')
    }

}