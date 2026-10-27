import { ActivityType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { BotActivity } from '../managers/databaseManager'
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
                    .addChoices(
                        { name: 'PLAYING', value: ActivityType.Playing },
                        { name: 'STREAMING', value: ActivityType.Streaming },
                        { name: 'LISTENING', value: ActivityType.Listening },
                        { name: 'WATCHING', value: ActivityType.Watching },
                        { name: 'COMPETING', value: ActivityType.Competing }
                    )
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
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({content: 'Unauthorized to use this command', flags: MessageFlags.Ephemeral})
            return
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral })
        
        const subcommand = interaction.options.getSubcommand()

        if (subcommand == 'set') {
            discordBot.setActivity(
                interaction.options.getString('activity', true),
                interaction.options.getNumber('type', true) as BotActivity['type']
            )
    
            await interaction.editReply('Successfully set bot activity!')
            return
        }

        if (subcommand == 'remove') {
            discordBot.removeActivity()
            await interaction.editReply('Successfully removed bot activity!')
            return
        }

    }

}