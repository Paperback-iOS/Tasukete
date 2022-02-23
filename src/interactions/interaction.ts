import { Interaction } from 'discord.js'

export interface IExecutableInteraction {
    execute(interaction: Interaction): Promise<void>
}