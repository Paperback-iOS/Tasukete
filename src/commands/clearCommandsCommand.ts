import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { Command } from './command'

export default class ClearCommandsCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('clearcommands')
            .setDescription('Clears all the commands')
            .toJSON()
    }
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({content: 'Unauthorized to use this command', flags: MessageFlags.Ephemeral})
            return
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        await discordBot.unloadCommands()
        await interaction.editReply('Unloaded commands!')
    }

}