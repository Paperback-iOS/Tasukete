import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { LiveTriggerManager } from '../managers/triggerManager'
import { hasPermission } from '../utils'
import { Command } from './command'

export default class DumpTriggersCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('dumptriggers')
            .setDescription('dump all the loaded triggers')
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(undefined, interaction.member as GuildMember, PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'You are not allowed to use this command', flags: MessageFlags.Ephemeral })
            return
        }
        
        await interaction.deferReply()

        const triggers = discordBot.liveTriggerManager.getAllLoadedTriggers()
        const triggerFile = triggers.map((value, key) => `${key}: ${value.replace(LiveTriggerManager.liveTriggersDir, '')}`).join('\n')

        await interaction.editReply({
            content: 'All loaded triggers',
            files: [
                new AttachmentBuilder(
                    Buffer.from(triggerFile),
                    { name: 'alltriggers.yaml' }
                ),
            ]
        })
    }

}
