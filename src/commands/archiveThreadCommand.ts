import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { Command } from './command'

export default class ArchiveThreadCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('archivethread')
            .setDescription('Archives a thread and deletes its message from the channel')
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads)) {
            interaction.reply({
                content: 'You do not have permission to execute this command.',
                flags: MessageFlags.Ephemeral
            })
            return
        }
        
        if (!interaction.channel?.isThread()) {
            interaction.reply({
                content: 'Command can only be used inside a thread',
                flags: MessageFlags.Ephemeral
            })
            return
        }
        
        await interaction.reply({
            content: `Thread closed by <@${interaction.user.id}>`,
            allowedMentions: {
                users: []
            }
        })

        try {
            const starterMessage = await interaction.channel.fetchStarterMessage()
            if (!starterMessage) throw new Error('message was deleted')
            await starterMessage.delete()
        } catch(err) {
            await interaction.followUp({
                content: 'Starter message not found: ' + err,
                flags: MessageFlags.Ephemeral
            })
        }

        await interaction.channel.setLocked(true)
        await interaction.channel.setArchived(true)
    }
}