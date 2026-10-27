import path from 'path'
import { IExecutableInteraction } from '../interactions/interaction'
import fs from 'fs'

export class LocalInteractionManager {
    static interactionsDir = path.join(__dirname, '../interactions')

    resolveInteraction(interactionId: string): (new () => IExecutableInteraction) | undefined {
        const interactionPath = path.join(LocalInteractionManager.interactionsDir, interactionId.split('#')[0] + '.js')
        if (!fs.existsSync(interactionPath)) return undefined

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(interactionPath)?.['default']
    }
}