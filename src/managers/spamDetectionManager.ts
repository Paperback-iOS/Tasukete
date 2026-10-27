import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, GuildMember, Message, PermissionFlagsBits } from 'discord.js'
import { stripIndent } from 'common-tags'
import { discordBot } from '..'
import { SpamDetectionConfig } from '../models/LiveConfig'
import { parseHumanDate } from '../utils'
import { MutexBasedManager } from './mutexBasedManager'

const DEFAULT_WINDOW_SECONDS = 30
const DEFAULT_DUPLICATE_CHANNEL_THRESHOLD = 3
const DEFAULT_MEDIA_CHANNEL_THRESHOLD = 3
const DEFAULT_CHANNEL_THRESHOLD = 5
const DEFAULT_TIMEOUT_DURATION = '1 day'
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 60_000

const LINK_REGEX = /(https?:\/\/|discord\.gg\/|discord(app)?\.com\/invite\/)/i

export interface TrackedMessage {
    messageId: string
    channelId: string
    fingerprint: string
    hasMedia: boolean
    content: string
    timestamp: number
}

export interface SpamThresholds {
    windowMs: number
    duplicateChannelThreshold: number
    mediaChannelThreshold: number
    channelThreshold: number
}

export interface SpamDetection {
    reason: string
    messages: TrackedMessage[]
}

// Keeps a sliding window of recent messages per user and decides when they look like cross-channel spam
export class SpamTracker {
    private messages = new Map<string, TrackedMessage[]>()

    record(userId: string, message: TrackedMessage, thresholds: SpamThresholds): SpamDetection | undefined {
        const recent = (this.messages.get(userId) ?? [])
            .filter(tracked => message.timestamp - tracked.timestamp <= thresholds.windowMs)
        recent.push(message)
        this.messages.set(userId, recent)

        const windowSeconds = Math.round(thresholds.windowMs / 1000)
        const channelCount = (messages: TrackedMessage[]) => new Set(messages.map(tracked => tracked.channelId)).size

        if (message.fingerprint) {
            const duplicates = recent.filter(tracked => tracked.fingerprint == message.fingerprint)
            const count = channelCount(duplicates)
            if (count >= thresholds.duplicateChannelThreshold) {
                return { reason: `Same message posted in ${count} channels within ${windowSeconds}s`, messages: recent }
            }
        }

        const mediaCount = channelCount(recent.filter(tracked => tracked.hasMedia))
        if (mediaCount >= thresholds.mediaChannelThreshold) {
            return { reason: `Links or attachments posted in ${mediaCount} channels within ${windowSeconds}s`, messages: recent }
        }

        const count = channelCount(recent)
        if (count >= thresholds.channelThreshold) {
            return { reason: `Messages posted in ${count} channels within ${windowSeconds}s`, messages: recent }
        }

        return undefined
    }

    clear(userId: string) {
        this.messages.delete(userId)
    }

    sweep(now: number, windowMs: number) {
        for (const [userId, messages] of this.messages) {
            const recent = messages.filter(tracked => now - tracked.timestamp <= windowMs)
            if (recent.length == 0) this.messages.delete(userId)
            else this.messages.set(userId, recent)
        }
    }
}

export function trackMessage(message: Message): TrackedMessage {
    const text = message.content.toLowerCase().replace(/\s+/g, ' ').trim()
    // Re-uploaded images get new URLs every time, so compare them by name and size
    const attachments = message.attachments.map(attachment => `${attachment.name}:${attachment.size}`).sort().join(',')
    const stickers = message.stickers.map(sticker => sticker.id).sort().join(',')
    const fingerprint = text || attachments || stickers ? [text, attachments, stickers].join('|') : ''

    return {
        messageId: message.id,
        channelId: message.channelId,
        fingerprint,
        hasMedia: message.attachments.size > 0 || message.stickers.size > 0 || LINK_REGEX.test(message.content),
        content: message.content || message.attachments.map(attachment => attachment.name).join(', '),
        timestamp: message.createdTimestamp
    }
}

export class SpamDetectionManager extends MutexBasedManager {
    private tracker = new SpamTracker()
    // Users flagged within the current window, so stragglers are cleaned up instead of re-flagged
    private recentlyFlagged = new Map<string, number>()

    get moderationConfig() { return discordBot.liveConfig.modules?.moderation }
    get moduleConfig(): SpamDetectionConfig | undefined { return this.moderationConfig?.spamDetection }

    get thresholds(): SpamThresholds {
        return {
            windowMs: (this.moduleConfig?.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000,
            duplicateChannelThreshold: this.moduleConfig?.duplicateChannelThreshold ?? DEFAULT_DUPLICATE_CHANNEL_THRESHOLD,
            mediaChannelThreshold: this.moduleConfig?.mediaChannelThreshold ?? DEFAULT_MEDIA_CHANNEL_THRESHOLD,
            channelThreshold: this.moduleConfig?.channelThreshold ?? DEFAULT_CHANNEL_THRESHOLD
        }
    }

    get timeoutDuration(): number {
        const configured = this.moduleConfig?.timeoutDuration ?? DEFAULT_TIMEOUT_DURATION
        let duration = parseHumanDate(configured)
        if (duration <= 0) {
            console.log(`[SPAM_DETECTION] invalid timeoutDuration "${configured}", using ${DEFAULT_TIMEOUT_DURATION}`)
            duration = parseHumanDate(DEFAULT_TIMEOUT_DURATION)
        }

        return Math.min(duration, MAX_TIMEOUT_MS)
    }

    constructor() {
        super()

        setInterval(() => {
            const now = Date.now()
            const { windowMs } = this.thresholds
            this.tracker.sweep(now, windowMs)
            for (const [userId, flaggedAt] of this.recentlyFlagged) {
                if (now - flaggedAt > windowMs) this.recentlyFlagged.delete(userId)
            }
        }, SWEEP_INTERVAL_MS)
    }

    // Returns true when the message was handled as spam and should not be processed further
    async handleMessage(message: Message): Promise<boolean> {
        if (!this.moderationConfig?.enabled || !this.moduleConfig?.enabled) return false
        if (!message.inGuild() || message.author.bot || message.webhookId || !message.member) return false

        const member = message.member
        if (this.isExempt(member, message)) return false

        return this.getMutex(member.id).runExclusive(async () => {
            if (this.recentlyFlagged.has(member.id)) {
                if (this.moduleConfig?.deleteMessages ?? true) {
                    await message.delete().catch(() => undefined)
                }
                return true
            }

            const detection = this.tracker.record(member.id, trackMessage(message), this.thresholds)
            if (!detection) return false

            this.recentlyFlagged.set(member.id, Date.now())
            this.tracker.clear(member.id)

            await this.flagMember(member, detection)
            return true
        })
    }

    private isExempt(member: GuildMember, message: Message): boolean {
        if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true
        if (this.moduleConfig?.exemptRoles && member.roles.cache.hasAny(...this.moduleConfig.exemptRoles)) return true

        const ignoredChannels = this.moduleConfig?.ignoredChannels ?? []
        const parentId = message.channel.isThread() ? message.channel.parentId : undefined
        return ignoredChannels.includes(message.channelId) || (parentId != undefined && ignoredChannels.includes(parentId))
    }

    private async flagMember(member: GuildMember, detection: SpamDetection) {
        const errors: string[] = []
        const channels = [...new Set(detection.messages.map(tracked => tracked.channelId))]
        const auditReason = `Spam detection: ${detection.reason}`

        let timedOutUntil: Date | undefined
        if (member.moderatable) {
            try {
                const duration = this.timeoutDuration
                await member.timeout(duration, auditReason)
                timedOutUntil = new Date(Date.now() + duration)
            } catch (error) {
                errors.push(`Timeout failed: ${error}`)
            }
        } else {
            errors.push('Timeout failed: member is not moderatable by the bot')
        }

        if (this.moduleConfig?.deleteMessages ?? true) {
            for (const channelId of channels) {
                const channel = member.guild.channels.cache.get(channelId)
                if (!channel?.isTextBased()) continue

                const messageIds = detection.messages.filter(tracked => tracked.channelId == channelId).map(tracked => tracked.messageId)
                try {
                    await channel.bulkDelete(messageIds, true)
                } catch (error) {
                    errors.push(`Deleting messages in <#${channelId}> failed: ${error}`)
                }
            }
        }

        const sample = detection.messages[detection.messages.length - 1].content.slice(0, 500)
        const previousFlags = discordBot.databaseManager.countSpamFlagsForUser(member.id)
        const flagId = discordBot.databaseManager.addSpamFlag({
            userId: member.id,
            reason: detection.reason,
            channels,
            messageCount: detection.messages.length,
            sample,
            timedOutUntil
        })

        if (this.moduleConfig?.notifyUser ?? true) {
            try {
                await member.send(stripIndent`
                    Your account posted the same or similar messages in several channels of **${member.guild.name}** in a short time, which usually means the account was compromised.
                    ${timedOutUntil ? `You have been timed out until <t:${Math.floor(timedOutUntil.getTime() / 1000)}:f>.` : ''}

                    Please change your password, enable two-factor authentication, and remove any authorized apps you don't recognize (User Settings → Authorized Apps). Then contact the moderators.
                `)
            } catch {
                errors.push('Unable to DM the user')
            }
        }

        await this.sendAlert(member, detection, { flagId, channels, sample, timedOutUntil, previousFlags, errors })
    }

    private async sendAlert(
        member: GuildMember,
        detection: SpamDetection,
        details: { flagId: number, channels: string[], sample: string, timedOutUntil?: Date, previousFlags: number, errors: string[] }
    ) {
        const channelId = this.moduleConfig?.alertChannel ?? this.moderationConfig?.loggingChannel
        if (!channelId) {
            console.log(`[SPAM_DETECTION] flagged ${member.id} but no alert channel is configured`)
            return
        }

        const alertRole = this.moduleConfig?.alertRole
        await discordBot.sendToChannel(channelId, {
            content: alertRole ? `<@&${alertRole}>` : undefined,
            allowedMentions: { roles: alertRole ? [alertRole] : [] },
            embeds: [{
                title: `Possible compromised account (flag #${details.flagId})`,
                color: Colors.Red,
                thumbnail: { url: member.user.displayAvatarURL() },
                description: stripIndent`
                    **USER:** <@${member.id}> (${member.user.tag} - ${member.id})
                    **REASON:** ${detection.reason}
                    **MESSAGES:** ${detection.messages.length}
                    **CHANNELS:** ${details.channels.map(id => `<#${id}>`).join(', ')}
                    **TIMEOUT:** ${details.timedOutUntil ? `until <t:${Math.floor(details.timedOutUntil.getTime() / 1000)}:f>` : 'not applied'}
                    **PREVIOUS FLAGS:** ${details.previousFlags}
                `,
                fields: [
                    { name: 'Sample', value: details.sample ? '```\n' + details.sample.replace(/```/g, '`​``') + '\n```' : '*empty*' },
                    ...(details.errors.length > 0 ? [{ name: 'Errors', value: details.errors.join('\n').slice(0, 1024) }] : [])
                ],
                timestamp: new Date().toISOString()
            }],
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Remove Timeout')
                            .setStyle(ButtonStyle.Success)
                            .setCustomId(`spamDetectionInteraction#untimeout&${details.flagId}`),
                        new ButtonBuilder()
                            .setLabel('Ban')
                            .setStyle(ButtonStyle.Danger)
                            .setCustomId(`spamDetectionInteraction#ban&${details.flagId}`)
                    )
            ]
        })
    }
}
