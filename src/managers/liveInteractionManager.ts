import { Constants } from '../constants'
import path from 'path'
import { LiveInteraction } from './liveCommandManager'
import fs from 'fs'
import { loadYaml } from '../utils'
import { discordBot } from '..'

export class LiveInteractionManager {
    static liveInteractionsDir = path.join(
        Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
        Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
        'interactions'
    )

    getAllInteractionNames(dir = ''): string[] {
        const dirPath = path.join(LiveInteractionManager.liveInteractionsDir, dir)
        return fs.readdirSync(dirPath).flatMap((file) => {
            const filePath = path.join(dirPath, file)

            if (fs.lstatSync(filePath).isDirectory()) {
                return this.getAllInteractionNames(path.join(dir, file))
            }

            if (!file.endsWith('.yaml')) return []

            return [path.join(dir, file.split('.')[0])]
        })
    }

    resolveLiveInteraction(interaction: any, constants: any = {}): LiveInteraction | undefined {
        if (typeof interaction == 'string') {
            return this.getLiveInteraction(interaction, constants)
        } else if (typeof interaction == 'object') {
            return interaction
        } else {
            return undefined
        }
    }

    private getLiveInteraction(interactionName: string, constants: any) {
        try {
            const interactionPath = path.join(LiveInteractionManager.liveInteractionsDir, interactionName + '.yaml')

            if (!fs.existsSync(interactionPath)) return undefined

            return loadYaml(
                fs.readFileSync(interactionPath).toString(),
                { ...discordBot.liveConstants, ...constants }
            )
        } catch (error) {
            throw new Error(`Unable to load interaction ${interactionName}\n${error}`, { cause: error })
        }
    }
}