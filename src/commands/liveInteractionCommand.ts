import { AutocompleteInteraction, CacheType, ChatInputCommandInteraction, MessageFlags, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBooleanOption, SlashCommandBuilder, SlashCommandStringOption } from 'discord.js'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'
import { Command, IAutocompletableCommand } from './command'

export default class LiveInteractionCommand implements Command, IAutocompletableCommand {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return {
            ...new SlashCommandBuilder()
                .setName('liveinteraction')
                .setDescription('Try to display a loaded interaction')
                .addStringOption(
                    new SlashCommandStringOption()
                        .setName('interaction')
                        .setDescription('path to the interaction')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addBooleanOption(
                    new SlashCommandBooleanOption()
                        .setName('ephemeral')
                        .setDescription('Ephemeral or not')
                        .setRequired(false)
                )
                .toJSON(),
        }
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({
            flags: (interaction.options.getBoolean('ephemeral') ?? true) ? MessageFlags.Ephemeral : undefined
        })

        const liveInteractionId = interaction.options.getString('interaction')
        if(!liveInteractionId) {
            await interaction.editReply('**ERROR:** No interaction id set')
            return
        }

        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if (!liveInteraction) {
            await interaction.editReply('**ERROR:** Unable to parse live interaction for id ' + liveInteractionId)
            return
        }

        try {
            await new MessageLiveInteraction(liveInteraction)
                .replyToInteraction(interaction)
        } catch(error) {
            console.log(error)
            await interaction.editReply('Unable to send live interaction\n**ERROR:** ' + error)
        }
    }

    async handleAutocomplete(interaction: AutocompleteInteraction<CacheType>): Promise<void> {
        const focusedOption = interaction.options.getFocused(true)
        if (typeof focusedOption.value != 'string' || focusedOption.name != 'interaction') return

        const allInteractions = discordBot.liveInteractionManager.getAllInteractionNames()
        const choices: string[] = []
        for (const interactionName of allInteractions) {
            if (!interactionName.includes(focusedOption.value)) continue
            choices.push(interactionName)
        }

        await interaction.respond(
            choices
                .sort((a, b) => a.length - b.length)
                .map(x => ({ name: x, value: x }))
                .slice(0, 25)
        )
    }
}