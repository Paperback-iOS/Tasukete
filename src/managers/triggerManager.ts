import { Constants } from '../constants'
import path from 'path'
import { LiveInteractionPermissions } from './liveCommandManager'
import fs from 'fs'
import { Collection, Message } from 'discord.js'
import { constantsFromObject, loadYaml } from '../utils'
import { discordBot } from '..'
import { MessageLiveInteraction } from '../models/MessageLiveInteraction'

interface LiveTrigger {
    match: string
    interaction: string
    regexFlags: string

    channels?: LiveInteractionPermissions
}

export class LiveTriggerManager {
    private loadedTriggers = new Collection<string, string>()
    static liveTriggersDir = path.join(
        Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
        Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
        'triggers'
    )

    getAllLoadedTriggers() {
        return this.loadedTriggers
    }

    loadTriggers(dir = '') {
        if(dir.length == 0) {
            this.loadedTriggers.clear()
        }
        
        for(const file of fs.readdirSync(path.join(LiveTriggerManager.liveTriggersDir, dir))) {
            const filePath = path.join(LiveTriggerManager.liveTriggersDir, dir, file)

            if (fs.lstatSync(filePath).isDirectory()) {
                this.loadTriggers(path.join(dir, file))
                continue
            }

            if (!file.endsWith('yaml')) continue

            const trigger = loadYaml(
                fs.readFileSync(filePath).toString(),
                discordBot.liveConstants
            ) as LiveTrigger
            
            console.log(trigger.match, path.join(dir, file))
            this.loadedTriggers.set(
                trigger.match,
                filePath
            )
        }
    }

    resolveTrigger(match: string, constants: any): LiveTrigger | undefined {
        try {
            const interactionPath = this.loadedTriggers.get(match)

            if (!interactionPath || !fs.existsSync(interactionPath)) return undefined

            return loadYaml(
                fs.readFileSync(interactionPath).toString(),
                { ...discordBot.liveConstants, ...constants }
            )
        } catch (error) {
            throw new Error(`Unable to load trigger for ${match}\n${error}`, { cause: error })
        }
    }

    async parseMessage(message: Message) {
        if (!message.member || message.author.bot) return

        const content = message.content
        for (const [match] of this.loadedTriggers) {
            const regex = new RegExp(match, 'g')
            const matches = regex.exec(content) ?? []
            
            if (matches.length == 0) continue
            
            const constants: any = {
                '$MATCH': []
            }
            
            let index = 0
            for (const match of matches) {
                constants['$MATCH'][index++] = match
            }
            
            const trigger = this.resolveTrigger(
                match, 
                { ...constantsFromObject(message.member), ...constants }
            )

            if (!trigger) continue

            if (trigger.channels) {
                const channelIds: string[] = [message.channelId]
                if (message.channel.isThread() && message.channel.parentId)
                    channelIds.push(message.channel.parentId)

                if (trigger.channels?.blacklist) {
                    if (trigger.channels.blacklist.filter(x => channelIds.includes(x)).length > 0) continue
                }
                if (trigger.channels?.whitelist) {
                    if (trigger.channels.whitelist.filter(x => channelIds.includes(x)).length == 0) continue
                }
            }
            
            const interaction = discordBot.liveInteractionManager.resolveLiveInteraction(
                trigger.interaction,
                { ...constantsFromObject(message.member), ...constants }
            )

            if (!interaction) {
                await message.reply({content: 'Unable to resolve interaction: ' + trigger.interaction})
                continue
            }

            const interactionMessage = new MessageLiveInteraction(interaction)
            if (!interactionMessage.memberIsAllowedToExecute(message.member)) {
                continue
            }

            await message.reply({ ...interactionMessage.toMessage(), allowedMentions: { repliedUser: false } })
        } 
    }

}