
import { stripIndent } from 'common-tags'
import { GuildMember, Message, MessageOptions, User } from 'discord.js'
import { discordBot } from '..'
import { UserWarnConfig } from '../models/LiveConfig'
import { parseHumanDate } from '../utils'
import { ModerationAction, ModerationActionType, UserData } from './databaseManager'
import { MutexBasedManager } from './mutexBasedManager'

export class ModerationModuleManager extends MutexBasedManager {
    private DEFAULT_MUTEX_ID = 'DEFAULT'

    get moduleConfig() { return discordBot.liveConfig.modules?.moderation }

    constructor() {
        super()

        // Tick every minute
        setInterval(async () => await this.processTasks(), 30_000)
    }

    async processTasks() {
        await this.getMutex(this.DEFAULT_MUTEX_ID).runExclusive(async () => {
            const actionQueue = this.getAllQueuedModerationActions()
            for (const document of Object.values(actionQueue)) {
                const action = document.readOnlyValue()
                
                if (Date.now() < action.executionTime.getTime()) continue
        
                await this.handleModerationAction(action)
                await document.deleteDocument()
            }
        })
    }

    getAllQueuedModerationActions() {
        return discordBot.databaseManager.getAllQueuedModerationActions(0, Infinity)
    }

    async getWarnsForUser(userId: string) {
        const userDocument = discordBot.databaseManager.getUserDocument(userId)
        return await userDocument.get('warns')
    }

    async warnMember(member: GuildMember, moderator: User, reason: string) {
        const document = discordBot.databaseManager.getUserDocument(member.id)
        const date = new Date()
        const moderationAction: ModerationAction = {
            executionTime: date,
            moderator: moderator.id,
            queueTime: date,
            reason: reason,
            subactions: [],
            target: member.id
        }
        const guild = await discordBot.guild
        const user = document.readOnlyValue()

        const action = this.getWarnAction(
            user.warns,
            this.moduleConfig?.warnConfig?.levels,
            this.moduleConfig?.warnConfig?.cooldownPeriod
        )

        if (!action) {
            throw new Error('Unable to determine the action to take for this warn')
        }

        switch (action.action) {
        case 'BAN':
            await member.ban({ reason: reason })

            moderationAction.subactions.push({
                type: 'BAN',
                metadata: member.id
            })
            break
        case 'MUTE':
            await this.muteMember(
                member,
                moderator,
                reason,
                parseHumanDate(action.duration ?? '99 years')
            )

            moderationAction.subactions.push({
                type: 'MUTE',
                metadata: 'DURATION: ' + action.duration
            })
            break
        default:
            break
        }

        await document.set('warns', [...(user.warns ?? []), {
            date: date,
            moderator: moderator.id,
            reason: reason,
            action: action
        }])

        await this.logModerationAction(moderationAction)

        try {
            await member.send(`You've been warned in **${guild.name}**. **Reason**: ${reason}. **Moderator**: <@${moderator.id}>`)
        } catch {
            throw new Error('Unable to DM the user.')
        }
    }

    getWarnAction(warns: UserData['warns'], levels: UserWarnConfig['levels'], cooldownPeriod: UserWarnConfig['cooldownPeriod']) {
        if (!levels || levels.length == 0) return undefined
        if (!warns) return levels[0]

        let previousWarn
        let warnCount = 0
        for (const warn of warns) {
            if (!previousWarn || !cooldownPeriod) {
                previousWarn = warn
                warnCount++
                continue
            }

            if (warn.date.getTime() - previousWarn.date.getTime() > parseHumanDate(cooldownPeriod)) {
                previousWarn = warn
                warnCount--
                continue
            } else {
                previousWarn = warn
                warnCount++
                continue
            }
        }

        return levels[Math.min(levels.length, warnCount)]
    }

    async muteMember(member: GuildMember, moderator: User, reason: string, duration: number) {
        if (!this.moduleConfig?.muteConfig?.muteRole) {
            throw new Error('[MODERATION_MODULE] muteRole not set')
        }

        await member.roles.add(this.moduleConfig.muteConfig.muteRole)

        const muteTime = new Date()
        const expiry = new Date(muteTime.getTime() + duration)

        await this.logModerationAction({
            executionTime: muteTime,
            queueTime: muteTime,
            moderator: moderator.id,
            reason: `${reason} **DURATION:** ${duration}ms **EXPIRES:** <t:${(expiry.getTime()/1000).toFixed(0)}:R>`,
            subactions: [{
                metadata: this.moduleConfig.muteConfig.muteRole,
                type: ModerationActionType.ROLE_ADD
            }],
            target: member.id
        })

        await this.queueModerationAction(`${member.id}_UNMUTE`, {
            executionTime: expiry,
            queueTime: muteTime,
            moderator: moderator.id,
            reason: reason,
            subactions: [{
                metadata: this.moduleConfig.muteConfig.muteRole,
                type: ModerationActionType.ROLE_REMOVE
            }],
            target: member.id
        })
    }

    async handleModerationAction(action: ModerationAction) {
        const guild = await discordBot.guild
        const target = await guild.members.fetch(action.target)

        for (const subaction of action.subactions) {
            switch (subaction.type) {
            case ModerationActionType.ROLE_ADD:
                await target.roles.add(subaction.metadata, action.reason)
                break
            case ModerationActionType.ROLE_REMOVE:
                await target.roles.remove(subaction.metadata, action.reason)
                break
            }
        }

        await this.logModerationAction(action)
    }

    async logModerationAction(action: ModerationAction) {
        if (!this.moduleConfig?.loggingChannel) return
        await discordBot.sendToChannel(
            this.moduleConfig.loggingChannel,
            { embeds: [this.getEmbedForModerationAction(action)] }
        )
    }

    getEmbedForModerationAction(action: ModerationAction): NonNullable<MessageOptions['embeds']>[0] {
        return {
            title: 'Moderation Action',
            description: stripIndent`
            Queue Time: <t:${(action.queueTime.getTime() / 1000).toFixed(0)}>
            Exec Time: <t:${(action.executionTime.getTime() / 1000).toFixed(0)}>
            Reason: ${action.reason}
            Moderator: <@${action.moderator}>
            Target: <@${action.target}>
            `,
            fields: action.subactions.map(action => ({
                name: 'Action',
                value: stripIndent`
                Type: ${action.type}
                Metadata: ${(() => {
                    switch (action.type) {
                    case ModerationActionType.ROLE_ADD:
                    case ModerationActionType.ROLE_REMOVE:
                        return `<@&${action.metadata}>`
                    case ModerationActionType.BAN_USER:
                    case ModerationActionType.UNBAN_USER:
                        return `<@${action.metadata}>`
                    default:
                        return action.metadata
                    }
                })()}`
            }))
        }
    }

    async queueModerationAction(name: string, action: ModerationAction) {
        await this.getMutex(this.DEFAULT_MUTEX_ID).runExclusive(async () => {
            await discordBot.databaseManager.moderationQueueCollection.addDocument(
                name, action
            )
        })
    }

    generateUniqueName() {
        return Date.now() + '_' + (Math.random() * 10000).toFixed(0)
    }

    async parseMessage(message: Message) {
        if (!this.moduleConfig?.enabled) return
        if (!message.member || message.author.bot) return

        const guild = await discordBot.guild
        const date = new Date()
        const content = message.content
        for (const censor of this.moduleConfig.wordCensorConfig?.matches ?? []) {
            const regex = new RegExp(censor.regex, (censor.flags ?? '') + 'g')
            const match = regex.exec(content)
            if (!match) continue

            await message.delete()

            await this.logModerationAction({
                executionTime: date,
                queueTime: date,
                moderator: guild.client.user?.id ?? '',
                reason: `Bad word usage: \`${match[0]}\``,
                subactions: censor.warn ? [{
                    type: 'WARN',
                    metadata: ''
                }] : [],
                target: message.member.id
            })

            if (censor.warn && guild.client.user) {
                try {
                    await this.warnMember(message.member, guild.client.user, `Bad word usage: \`${match[0]}\``)
                } catch {
                    const notice = await message.channel.send({
                        content: 'User warned and message was deleted due to bad word usage.'
                    })

                    setTimeout(() => notice.delete(), 30_000)
                }
            } else {
                try {
                    await message.member.send(`Message deleted due to bad word usage: \`${match[0]}\``)
                } catch {
                    const notice = await message.channel.send({
                        content: 'Message was deleted due to bad word usage.'
                    })

                    setTimeout(() => notice.delete(), 30_000)
                }
            }
        }
    }
}
