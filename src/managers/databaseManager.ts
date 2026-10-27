import { ActivityType } from 'discord.js'
import path from 'path'
import Database from 'better-sqlite3'
import { openDatabase } from '../database/sqlite'
import { RoleId, UserWarnConfig } from '../models/LiveConfig'

export interface UserNote {
    note: string
    moderator: string
    date: string
}

export interface UserWarn {
    action?: NonNullable<UserWarnConfig['levels']>[0]
    moderator: string
    reason: string
    date: Date
}

export interface UserPoints {
    amount: number
    history: {
        reason: string
        amount: number
        assigner: string
    }[]
}

export interface UserData {
    modMailThread?: string
    notes?: UserNote[]
    warns?: UserWarn[]
    vanityRoleId?: string
    points?: UserPoints
}

export interface BotActivity {
    message: string
    type: Exclude<ActivityType, ActivityType.Custom>
}

export interface BotSettings {
    activity?: BotActivity
}

export interface ModerationAction {
    subactions: {
        type: ModerationActionType
        metadata: RoleId
    }[]
    queueTime: Date
    executionTime: Date
    moderator: string
    target: string
    reason: string
}

export interface QueuedModerationAction {
    name: string
    action: ModerationAction
}

export interface SpamFlag {
    id: number
    userId: string
    reason: string
    channels: string[]
    messageCount: number
    sample: string
    timedOutUntil?: Date
    createdAt: Date
    resolution?: string
    resolvedBy?: string
    resolvedAt?: Date
}

interface SpamFlagRow {
    id: number
    user_id: string
    reason: string
    channels: string
    message_count: number
    sample: string
    timed_out_until: number | null
    created_at: number
    resolution: string | null
    resolved_by: string | null
    resolved_at: number | null
}

export class ModerationActionType {
    static ROLE_REMOVE = 'REMOVE ROLE'
    static ROLE_ADD = 'ADD ROLE'

    static BAN_USER = 'BAN USER'
    static UNBAN_USER = 'UNBAN USER'
}

interface ModerationQueueRow {
    name: string
    queue_time: number
    execution_time: number
    moderator: string
    target: string
    reason: string
    subactions: string
}

interface WarnRow {
    moderator: string
    reason: string
    date: number
    action: string | null
}

export class DatabaseManager {
    readonly db: Database.Database

    constructor(filePath = path.join(process.cwd(), 'db', 'bot.sqlite')) {
        this.db = openDatabase(filePath)
    }

    private ensureUser(userId: string) {
        this.db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(userId)
    }

    getModMailThread(userId: string): string | undefined {
        const row = this.db.prepare('SELECT mod_mail_thread FROM users WHERE id = ?').get(userId) as { mod_mail_thread: string | null } | undefined
        return row?.mod_mail_thread ?? undefined
    }

    setModMailThread(userId: string, threadId: string | undefined) {
        this.ensureUser(userId)
        this.db.prepare('UPDATE users SET mod_mail_thread = ? WHERE id = ?').run(threadId ?? null, userId)
    }

    getVanityRoleId(userId: string): string | undefined {
        const row = this.db.prepare('SELECT vanity_role_id FROM users WHERE id = ?').get(userId) as { vanity_role_id: string | null } | undefined
        return row?.vanity_role_id ?? undefined
    }

    setVanityRoleId(userId: string, roleId: string | undefined) {
        this.ensureUser(userId)
        this.db.prepare('UPDATE users SET vanity_role_id = ? WHERE id = ?').run(roleId ?? null, userId)
    }

    getNotes(userId: string): UserNote[] {
        return this.db.prepare('SELECT note, moderator, date FROM user_notes WHERE user_id = ? ORDER BY id').all(userId) as UserNote[]
    }

    addNote(userId: string, note: UserNote) {
        this.ensureUser(userId)
        this.db.prepare('INSERT INTO user_notes (user_id, note, moderator, date) VALUES (?, ?, ?, ?)')
            .run(userId, note.note, note.moderator, note.date)
    }

    getWarns(userId: string): UserWarn[] {
        const rows = this.db.prepare('SELECT moderator, reason, date, action FROM warns WHERE user_id = ? ORDER BY id').all(userId) as WarnRow[]
        return rows.map(row => ({
            moderator: row.moderator,
            reason: row.reason,
            date: new Date(row.date),
            action: row.action ? JSON.parse(row.action) : undefined
        }))
    }

    addWarn(userId: string, warn: UserWarn) {
        this.ensureUser(userId)
        this.db.prepare('INSERT INTO warns (user_id, moderator, reason, date, action) VALUES (?, ?, ?, ?, ?)')
            .run(userId, warn.moderator, warn.reason, warn.date.getTime(), warn.action ? JSON.stringify(warn.action) : null)
    }

    getPoints(userId: string): UserPoints | undefined {
        const row = this.db.prepare('SELECT amount FROM user_points WHERE user_id = ?').get(userId) as { amount: number } | undefined
        if (!row) return undefined

        const history = this.db.prepare('SELECT reason, amount, assigner FROM point_history WHERE user_id = ? ORDER BY id').all(userId) as UserPoints['history']
        return { amount: row.amount, history }
    }

    getPointsPage(offset: number, limit: number): { userId: string, amount: number }[] {
        return this.db.prepare('SELECT user_id AS userId, amount FROM user_points ORDER BY user_id LIMIT ? OFFSET ?').all(limit, offset) as { userId: string, amount: number }[]
    }

    countUsersWithPoints(): number {
        return (this.db.prepare('SELECT COUNT(*) AS count FROM user_points').get() as { count: number }).count
    }

    addPoints(userId: string, amount: number, reason: string, assigner: string) {
        this.db.transaction(() => {
            this.ensureUser(userId)
            this.db.prepare('INSERT INTO user_points (user_id, amount) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET amount = amount + excluded.amount')
                .run(userId, amount)
            this.db.prepare('INSERT INTO point_history (user_id, amount, reason, assigner) VALUES (?, ?, ?, ?)')
                .run(userId, amount, reason, assigner)
        })()
    }

    setPoints(userId: string, points: UserPoints) {
        this.db.transaction(() => {
            this.clearPoints(userId)
            this.ensureUser(userId)
            this.db.prepare('INSERT INTO user_points (user_id, amount) VALUES (?, ?)').run(userId, points.amount)

            const insertHistory = this.db.prepare('INSERT INTO point_history (user_id, amount, reason, assigner) VALUES (?, ?, ?, ?)')
            for (const entry of points.history) {
                insertHistory.run(userId, entry.amount, entry.reason, entry.assigner)
            }
        })()
    }

    clearPoints(userId: string) {
        this.db.transaction(() => {
            this.db.prepare('DELETE FROM user_points WHERE user_id = ?').run(userId)
            this.db.prepare('DELETE FROM point_history WHERE user_id = ?').run(userId)
        })()
    }

    getActivity(): BotActivity | undefined {
        return this.getSetting('activity')
    }

    setActivity(activity: BotActivity | undefined) {
        this.setSetting('activity', activity)
    }

    private getSetting<K extends keyof BotSettings>(key: K): BotSettings[K] | undefined {
        const row = this.db.prepare('SELECT value FROM bot_settings WHERE key = ?').get(key) as { value: string } | undefined
        return row ? JSON.parse(row.value) : undefined
    }

    private setSetting<K extends keyof BotSettings>(key: K, value: BotSettings[K] | undefined) {
        if (value === undefined) {
            this.db.prepare('DELETE FROM bot_settings WHERE key = ?').run(key)
        } else {
            this.db.prepare('INSERT INTO bot_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
                .run(key, JSON.stringify(value))
        }
    }

    queueModerationAction(name: string, action: ModerationAction) {
        this.db.prepare(`
            INSERT OR REPLACE INTO moderation_queue (name, queue_time, execution_time, moderator, target, reason, subactions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            name,
            action.queueTime.getTime(),
            action.executionTime.getTime(),
            action.moderator,
            action.target,
            action.reason,
            JSON.stringify(action.subactions)
        )
    }

    getAllQueuedModerationActions(): QueuedModerationAction[] {
        const rows = this.db.prepare('SELECT * FROM moderation_queue ORDER BY execution_time').all() as ModerationQueueRow[]
        return rows.map(DatabaseManager.rowToQueuedAction)
    }

    getDueModerationActions(now = new Date()): QueuedModerationAction[] {
        const rows = this.db.prepare('SELECT * FROM moderation_queue WHERE execution_time <= ? ORDER BY execution_time').all(now.getTime()) as ModerationQueueRow[]
        return rows.map(DatabaseManager.rowToQueuedAction)
    }

    deleteModerationAction(name: string) {
        this.db.prepare('DELETE FROM moderation_queue WHERE name = ?').run(name)
    }

    addSpamFlag(flag: Omit<SpamFlag, 'id' | 'createdAt' | 'resolution' | 'resolvedBy' | 'resolvedAt'>): number {
        const result = this.db.prepare(`
            INSERT INTO spam_flags (user_id, reason, channels, message_count, sample, timed_out_until, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            flag.userId,
            flag.reason,
            JSON.stringify(flag.channels),
            flag.messageCount,
            flag.sample,
            flag.timedOutUntil?.getTime() ?? null,
            Date.now()
        )

        return Number(result.lastInsertRowid)
    }

    getSpamFlag(id: number): SpamFlag | undefined {
        const row = this.db.prepare('SELECT * FROM spam_flags WHERE id = ?').get(id) as SpamFlagRow | undefined
        return row ? DatabaseManager.rowToSpamFlag(row) : undefined
    }

    countSpamFlagsForUser(userId: string): number {
        return (this.db.prepare('SELECT COUNT(*) AS count FROM spam_flags WHERE user_id = ?').get(userId) as { count: number }).count
    }

    resolveSpamFlag(id: number, resolution: string, moderatorId: string) {
        this.db.prepare('UPDATE spam_flags SET resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
            .run(resolution, moderatorId, Date.now(), id)
    }

    private static rowToSpamFlag(row: SpamFlagRow): SpamFlag {
        return {
            id: row.id,
            userId: row.user_id,
            reason: row.reason,
            channels: JSON.parse(row.channels),
            messageCount: row.message_count,
            sample: row.sample,
            timedOutUntil: row.timed_out_until != null ? new Date(row.timed_out_until) : undefined,
            createdAt: new Date(row.created_at),
            resolution: row.resolution ?? undefined,
            resolvedBy: row.resolved_by ?? undefined,
            resolvedAt: row.resolved_at != null ? new Date(row.resolved_at) : undefined
        }
    }

    private static rowToQueuedAction(row: ModerationQueueRow): QueuedModerationAction {
        return {
            name: row.name,
            action: {
                queueTime: new Date(row.queue_time),
                executionTime: new Date(row.execution_time),
                moderator: row.moderator,
                target: row.target,
                reason: row.reason,
                subactions: JSON.parse(row.subactions)
            }
        }
    }
}
