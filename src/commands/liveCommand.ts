import { SlashCommandBuilder, SlashCommandStringOption, SlashCommandSubcommandBuilder } from '@discordjs/builders'
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types'
import { CommandInteraction, MessagePayload } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { Command } from './command'

export default class LiveCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('livecommand')
            .setDescription('Try to execute a live command. The command MUST be loaded')
            .addStringOption(
                new SlashCommandStringOption()
                    .setName('command')
                    .setDescription('Name of the live command')
                    .setRequired(true)
            )
            .toJSON()
    }

    async execute(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply()
        let liveCommandName: string | null = interaction.commandName
        
        if(liveCommandName == 'livecommand') {
            liveCommandName = interaction.options.getString('command')
        }

        if(!liveCommandName){
            await interaction.editReply('**ERROR:** Unable to resolve live command name')
            return
        }

        const liveInteractionId = discordBot.liveCommandManager.resolveLiveCommandInteractionId(liveCommandName)
        if(!liveInteractionId) {
            await interaction.editReply('**ERROR:** Unable to parse live interaction ID for live command ' + liveCommandName)
            return
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if (!liveInteraction) {
            await interaction.editReply('**ERROR:** Unable to parse live interaction for id ' + liveInteractionId)
            return
        }

        try {
            await interaction.editReply(new MessageLiveInteraction(liveInteraction).toMessage())
        } catch(error) {
            console.log(error)
            await interaction.editReply('Unable to send live interaction\n**ERROR:** ' + error)
        }
    }
}