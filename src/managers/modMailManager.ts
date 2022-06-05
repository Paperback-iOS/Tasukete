import { CommandInteraction, Interaction, Message, MessageActionRow, MessageButton } from 'discord.js'
import { discordBot } from '..'
import { Constants } from '../constants'
import { ModMailModule } from '../models/LiveConfig'

export class ModMailManager {
    get moduleConfig(): ModMailModule | undefined {
        return discordBot.liveConfig.modules?.modMail
    }

    async handleMessage(message: Message) {
        console.log(`enabled: ${this.moduleConfig?.enabled}, type: ${message.channel.type}, bot: ${message.author.bot}`)
        if (!this.moduleConfig?.enabled || message.channel.type != 'DM' || message.author.bot) return
        
        const member = await (await discordBot.guild).members.fetch(message.author.id)
        console.log(`handling message ${member.id}`)
        if (!member || (this.moduleConfig?.ignoreRole && member.roles.cache.has(this.moduleConfig.ignoreRole))) return

        await message.reply({
            content: 'Would you like to forward this message to the server admins? Note: If you need support, make a thread first in <#673620355486842920>.',
            components: [
                new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setLabel('Yes')
                            .setStyle('PRIMARY')
                            .setCustomId(`modMailInteraction#openThread&${message.id}`),
                        new MessageButton()
                            .setLabel('No')
                            .setStyle('SECONDARY')
                            .setCustomId('modMailInteraction#cancel')
                    )
            ]
        })
    }
}
