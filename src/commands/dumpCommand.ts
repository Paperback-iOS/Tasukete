import { AttachmentBuilder, AutocompleteInteraction, CacheType, ChatInputCommandInteraction, GuildMember, MessageFlags, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder, SlashCommandStringOption } from 'discord.js'
import fs from 'fs'
import path from 'path'
import { Constants } from '../constants'
import { hasPermission } from '../utils'
import { Command, IAutocompletableCommand } from './command'

export default class DumpCommand implements Command, IAutocompletableCommand {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('dump')
            .setDescription('dump the contents of the file')
            .addStringOption(
                new SlashCommandStringOption()
                    .setName('file')
                    .setDescription('path to the file')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(undefined, interaction.member as GuildMember, PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'You are not allowed to use this command', flags: MessageFlags.Ephemeral })
            return
        }
        
        await interaction.deferReply()

        const file = interaction.options.getString('file', true)
        const fileLastComponent = file.split('/').pop()
        if (file.includes('..') || fileLastComponent?.startsWith('.')) {
            await interaction.editReply('Invalid Path')
            return
        }

        const filePath = path.join(
            Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
            Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
            file
        )


        await interaction.editReply({
            content: `**File**: ${interaction.options.getString('file', true)}`,
            files: [
                new AttachmentBuilder(filePath),
            ]
        })
    }

    async handleAutocomplete(interaction: AutocompleteInteraction<CacheType>): Promise<void> {
        const focusedOption = interaction.options.getFocused(true)
        if (typeof focusedOption.value != 'string' || focusedOption.name != 'file') return
        if (focusedOption.value.includes('..')) {
            await interaction.respond([
                {
                    name: 'Invalid Path',
                    value: 'invalidPath'
                }
            ])
            return
        }
        
        const initialDir = path.join(
            Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
            Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME
        )

        const input = focusedOption.value
        const inputBreadcrumb = input.split('/')
        const inputLastComponent = inputBreadcrumb.pop() ?? ''

        const _filePath = path.join(initialDir, ...inputBreadcrumb)
        const filePath = fs.existsSync(_filePath) ? _filePath : initialDir

        if (!fs.lstatSync(filePath).isDirectory()) {
            await interaction.respond([
                {
                    name: input,
                    value: input
                }
            ])
            return
        }

        const choices: string[] = []
        for (const fileName of fs.readdirSync(filePath)) {
            if (fileName.includes(inputLastComponent) && !fileName.startsWith('.')) {
                choices.push(
                    path.join(
                        ...inputBreadcrumb,
                        fileName + (
                            fs.lstatSync(path.join(filePath, fileName))
                                .isDirectory() ? '/' : ''
                        )
                    )
                )
            }
        }

        await interaction.respond(
            choices
                .sort((a, b) => a.length - b.length)
                .map(x => ({ name: x, value: x }))
                .slice(0, 25)
        )
    }
}
