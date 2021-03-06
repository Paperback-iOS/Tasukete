import { SlashCommandBuilder } from '@discordjs/builders'
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types'
import { Activity, CommandInteraction, ExcludeEnum } from 'discord.js'
import { ActivityTypes } from 'discord.js/typings/enums'
import { discordBot } from '..'
import { Command } from './command'

export default class SetActivityCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('activity')
            .setDescription('Sets the bots activity message')
            .addSubcommand(builder => builder
                .setName('set')
                .setDescription('set the activity of the bot')
                .addNumberOption(builder => builder
                    .setRequired(true)
                    .setName('type')
                    .setDescription('the type of activity')
                    .addChoices([
                        ['PLAYING', 0],
                        ['STREAMING', 1],
                        ['LISTENING', 2],
                        ['WATCHING', 3],
                        ['COMPETING', 5]
                    ])
                )
                .addStringOption(builder => builder
                    .setName('activity')
                    .setDescription('the activity to set')
                    .setRequired(true)
                )
            )
            .addSubcommand(builder => builder
                .setName('remove')
                .setDescription('remove the activity of the bot')
            )
            .toJSON()
    }
    async execute(interaction: CommandInteraction): Promise<void> {
        if (!interaction.memberPermissions?.has('MANAGE_GUILD')) {
            await interaction.reply({content: 'Unauthorized to use this command', ephemeral: true})
            return
        }
        
        await interaction.deferReply({ ephemeral: true })
        
        const subcommand = interaction.options.getSubcommand()

        if (subcommand == 'set') {
            await discordBot.setActivity(
                interaction.options.getString('activity', true),
                interaction.options.getNumber('type', true) as ExcludeEnum<typeof ActivityTypes, 'CUSTOM'>
            )
    
            await interaction.editReply('Successfully set bot activity!')
            return
        }

        if (subcommand == 'remove') {
            await discordBot.removeActivity()
            await interaction.editReply('Successfully removed bot activity!')
            return
        }

    }

}