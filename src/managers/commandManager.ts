import { REST } from '@discordjs/rest'
import { RESTPatchAPIApplicationCommandJSONBody, RESTPostAPIApplicationCommandsJSONBody, Routes } from 'discord-api-types/v9'
import { Constants } from '../constants'
import path from 'path'
import fsp from 'fs/promises'
import { Command } from '../commands/command'

export class LocalCommandManager {
    loadedCommands: Record<string, string> = {}

    async getLocalCommands(): Promise<RESTPostAPIApplicationCommandsJSONBody[]> {
        const commandsDir = path.join(__dirname, '../commands')
        const commandFiles = await fsp.readdir(commandsDir)
        this.loadedCommands = {}

        return <RESTPostAPIApplicationCommandsJSONBody[]> commandFiles.map(file => {
            if (!file.endsWith('.js')) return undefined

            const commandPath = path.join(commandsDir, file)

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const CommandClass: (new () => Command | undefined) | undefined = require(commandPath)?.['default']
            if(!CommandClass) return undefined

            const commandInstance = new CommandClass()
            const metadata = commandInstance?.getCommandMetadata()
            if (!metadata) return undefined

            this.loadedCommands[metadata.name] = commandPath
            console.log('Found command: ' + metadata.name)

            return metadata
        }).filter(x => x)
    }

    resolveLocalCommand(name: string): (new () => Command) | undefined {
        const commandPath = this.loadedCommands[name]
        if (!commandPath) return undefined

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(commandPath)?.['default']
    }
}
