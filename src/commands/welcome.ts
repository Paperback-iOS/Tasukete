import { SlashCommandBuilder } from '@discordjs/builders'
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types'
import { CommandInteraction, MessageActionRow, MessageButton } from 'discord.js'
import { Command } from './command'

export default class WelcomeCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('welcome')
            .setDescription('Display the welcome message')
            .toJSON()
    }

    async execute(interaction: CommandInteraction): Promise<void> {
        if (!interaction.memberPermissions?.has('MANAGE_ROLES')) {
            await interaction.reply({ content: 'Unauthorized to use this command', ephemeral: true })
            return
        }

        await interaction.reply({
            content: 'Welcome to **Paperback**!',
            components: [
                new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setLabel('Troubleshoot Issues')
                            .setCustomId('selfHelpInteraction')
                            .setStyle('SUCCESS'),
                        new MessageButton()
                            .setLabel('I have a Question/Issue')
                            .setCustomId('supportThreadAcknowledgementInteraction')
                            .setStyle('PRIMARY'),
                        new MessageButton()
                            .setLabel('I want to Chat')
                            .setCustomId('serverRulesAcknowledgementInteraction')
                            .setStyle('SECONDARY'),
                        new MessageButton()
                            .setLabel('Support On Patreon')
                            .setStyle('LINK')
                            .setURL('https://www.patreon.com/FaizanDurrani')
                    )
            ]
        })
    }

}
