import AdmZip from 'adm-zip'
import { Constants } from '../constants'
import { https } from 'follow-redirects'
import fs from 'fs'
import fsp from 'fs/promises'
import { REST } from '@discordjs/rest'
import path from 'path'
import { SlashCommandBuilder } from '@discordjs/builders'
import { RESTPatchAPIApplicationCommandJSONBody, Routes } from 'discord-api-types/v9'
import yaml from 'js-yaml'
import Collection from '@discordjs/collection'
import { MessageButtonOptions, MessageEmbedOptions, MessageSelectOptionData } from 'discord.js'
import { IExecutableCommand } from '../commands/command'
import LiveCommand from '../commands/liveCommand'

export interface LiveInteractionPermissions {
    blacklist?: string[]
    whitelist?: string[]
}

export interface LiveInteraction {
    content?: string
    options?: MessageSelectOptionData[]
    embeds?: MessageEmbedOptions[]
    buttons?: MessageButtonOptions[]
    permissions?: LiveInteractionPermissions
}

export class LiveCommandManager {
    private loadedCommands = new Collection<string, string>()

    async getLiveCommands(): Promise<RESTPatchAPIApplicationCommandJSONBody[]> {
        const commandDir = path.join(Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR, Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME, 'commands')
        this.loadedCommands.clear()
        
        return <RESTPatchAPIApplicationCommandJSONBody[]> fs.readdirSync(commandDir).map((file) => {
            const commandName = file.split('.')[0].replace(/[^a-zA-Z]/gi, '').toLowerCase()

            const commandMetadata: any = yaml.load(fs.readFileSync(path.join(commandDir, file)).toString())
            if (!commandMetadata || !commandMetadata.interaction) return undefined
            
            this.loadedCommands.set(commandName, commandMetadata.interaction)

            return new SlashCommandBuilder()
                .setName(commandName)
                .setDescription(commandMetadata.descripton ?? 'Live Command')
                .toJSON()
        }).filter(x => x)
    }

    resolveLiveCommand(commandName: string): (new () => IExecutableCommand) | undefined {
        if (!this.loadedCommands.has(commandName)) return undefined
        return LiveCommand
    }

    resolveLiveCommandInteractionId(commandName: string): string | undefined {
        return this.loadedCommands.get(commandName) 
    }
}