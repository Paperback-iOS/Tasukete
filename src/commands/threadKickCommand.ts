import { SlashCommandBuilder, SlashCommandMentionableOption, SlashCommandUserOption } from '@discordjs/builders';
import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types';
import { CommandInteraction, ThreadChannel } from 'discord.js';
import { Command } from './command'

export default class ThreadKickCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('threadkick')
            .setDescription('kicks the user from the thread')
            .addUserOption(
                new SlashCommandUserOption()
                    .setName('user')
                    .setRequired(true)
                    .setDescription('the user to kick')
            )
            .toJSON()
    }

    async execute(interaction: CommandInteraction): Promise<void> {
        await interaction.deferReply({ephemeral: true})

        if (!interaction.channel?.isThread()) {
            await interaction.editReply({ content: "Command can only be used in a thread" })
            return
        }

        await (interaction.channel as ThreadChannel).members.remove(interaction.options.getUser('user', true).id)

        await interaction.editReply({ content: `Done` })
    }

}