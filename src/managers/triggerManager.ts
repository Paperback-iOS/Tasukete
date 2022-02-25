import { Constants } from '../constants'
import path from 'path'
import { LiveInteraction, LiveCommandManager, LiveInteractionPermissions } from './liveCommandManager'
import yaml from 'js-yaml'
import fs from 'fs'
import { Collection, CommandInteractionOptionResolver, Message } from 'discord.js'
import { substituteTemplateLiterals } from '../utils'
import { discordBot } from '..'
import { SlashCommandBuilder } from '@discordjs/builders'
import { RESTPatchAPIApplicationCommandJSONBody } from 'discord.js/node_modules/discord-api-types'
import { LiveInteractionManager } from './liveInteractionManager'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'

interface LiveTrigger {
    match: string
    interaction: string

    channels?: LiveInteractionPermissions
}

export class LiveTriggerManager {
    private loadedTriggers = new Collection<string, LiveTrigger>()
    static liveTriggersDir = path.join(
        Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
        Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
        'triggers'
    )

    async loadTriggers() {
        this.loadedTriggers.clear()
        
        fs.readdirSync(LiveTriggerManager.liveTriggersDir).forEach((file) => {
            const commandMetadata: any = yaml.load(
                substituteTemplateLiterals(
                    discordBot.liveConstants,
                    fs.readFileSync(path.join(LiveTriggerManager.liveTriggersDir, file)).toString()
                )
            ) as LiveTrigger

            if (!commandMetadata || !commandMetadata.interaction || !commandMetadata.match) return
            
            this.loadedTriggers.set(file, commandMetadata)
        })
    }

    async parseMessage(message: Message) {
        if (!message.member || message.author.bot) return

        const content = message.content
        for (const [_, trigger] of this.loadedTriggers) {
            const regex = new RegExp(trigger.match, 'g')
            if (!regex.test(content)) continue

            if (trigger.channels) {
                if (trigger.channels?.blacklist) {
                    if (trigger.channels.blacklist.includes(message.channelId)) continue
                } else if (trigger.channels?.whitelist) {
                    if (trigger.channels.whitelist.includes(message.channelId)) continue
                }
            }

            const interaction = discordBot.liveInteractionManager.resolveLiveInteraction(trigger.interaction)
            if (!interaction) {
                await message.reply({content: 'Unable to resolve interaction: ' + trigger})
                continue
            }

            const interactionMessage = new MessageLiveInteraction(interaction)
            if (!interactionMessage.userIsAllowedToExecute(message.member)) {
                continue
            }

            await message.reply(interactionMessage.toMessage())
        } 
    }

}