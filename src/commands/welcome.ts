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
                            .setLabel('I need help')
                            .setCustomId('selfHelpInteraction')
                            .setStyle('PRIMARY'),
                        new MessageButton()
                            .setLabel('My issue isn\'t listed')
                            .setCustomId('supportThreadConfirmationInteraction')
                            .setStyle('DANGER'),
                        new MessageButton()
                            .setLabel('I want to chat')
                            .setCustomId('serverRulesAcknowledgementInteraction')
                            .setStyle('SECONDARY'),
                        new MessageButton()
                            .setLabel('Support on Patreon')
                            .setStyle('LINK')
                            .setURL('https://www.patreon.com/FaizanDurrani')
                    )
            ]
        })
    }

}
