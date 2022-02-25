import { ButtonInteraction, CacheType, Interaction } from 'discord.js'

export interface IExecutableInteraction {
    execute(interaction: Interaction): Promise<void>
}

export abstract class MultiButtonOptionInteraction implements IExecutableInteraction {
    async execute(interaction: Interaction): Promise<void> {
        if (!interaction.isButton()) return

        const metadata = interaction.customId.split('#')
        if (metadata.length > 1) {
            await interaction.update({ components: [] })
            return this.executeWithOption(metadata[1], interaction)
        }

        return this.executeDefaultOption(interaction)
    }

    abstract executeDefaultOption(interaction: ButtonInteraction): Promise<void>
    abstract executeWithOption(option: string, interaction: ButtonInteraction): Promise<void>
}