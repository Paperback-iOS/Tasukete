// One-time migration from the old msgpack document store (db/<collection>/<document>.db)
// into SQLite. Usage: npm run migrate-db -- [--db-dir db] [--out db/bot.sqlite] [--force]

import fs from 'fs'
import path from 'path'
import { unpack } from 'msgpackr'
import { BotSettings, DatabaseManager, ModerationAction, UserData } from '../managers/databaseManager'

const TABLES = ['users', 'user_notes', 'warns', 'user_points', 'point_history', 'bot_settings', 'moderation_queue']

function parseArgs() {
    const args = process.argv.slice(2)
    const valueOf = (flag: string) => {
        const index = args.indexOf(flag)
        return index >= 0 ? args[index + 1] : undefined
    }

    const dbDir = path.resolve(valueOf('--db-dir') ?? path.join(process.cwd(), 'db'))
    return {
        dbDir,
        out: path.resolve(valueOf('--out') ?? path.join(dbDir, 'bot.sqlite')),
        force: args.includes('--force')
    }
}

function readCollection<T>(dbDir: string, collection: string): [string, T][] {
    const folder = path.join(dbDir, collection)
    if (!fs.existsSync(folder)) return []

    return fs.readdirSync(folder)
        .filter(file => file.endsWith('.db'))
        .map(file => {
            const filePath = path.join(folder, file)
            try {
                return [file.slice(0, -3), unpack(fs.readFileSync(filePath)) as T]
            } catch (error) {
                throw new Error(`Unable to read ${filePath}`, { cause: error })
            }
        })
}

function main() {
    const { dbDir, out, force } = parseArgs()

    const users = readCollection<UserData>(dbDir, 'users')
    const botSettings = readCollection<BotSettings>(dbDir, 'botSettings')
    const moderationQueue = readCollection<ModerationAction>(dbDir, 'moderationQueue')

    const database = new DatabaseManager(out)
    const { db } = database

    const existingRows = TABLES.reduce((sum, table) => sum + (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0)
    if (existingRows > 0 && !force) {
        console.error(`${out} already contains data. Re-run with --force to replace it.`)
        process.exitCode = 1
        return
    }

    const counts = { users: 0, notes: 0, warns: 0, points: 0, pointHistory: 0, botSettings: 0, moderationQueue: 0 }

    db.transaction(() => {
        for (const table of [...TABLES].reverse()) {
            db.prepare(`DELETE FROM ${table}`).run()
        }

        for (const [userId, data] of users) {
            let hasData = false

            if (data.modMailThread) {
                database.setModMailThread(userId, data.modMailThread)
                hasData = true
            }

            if (data.vanityRoleId) {
                database.setVanityRoleId(userId, data.vanityRoleId)
                hasData = true
            }

            for (const note of data.notes ?? []) {
                database.addNote(userId, note)
                counts.notes++
                hasData = true
            }

            for (const warn of data.warns ?? []) {
                database.addWarn(userId, { ...warn, date: new Date(warn.date) })
                counts.warns++
                hasData = true
            }

            if (data.points) {
                database.setPoints(userId, { amount: data.points.amount, history: data.points.history ?? [] })
                counts.points++
                counts.pointHistory += data.points.history?.length ?? 0
                hasData = true
            }

            if (hasData) counts.users++
        }

        const activity = botSettings.find(([name]) => name == 'botSettings')?.[1].activity
        if (activity) {
            database.setActivity(activity)
            counts.botSettings++
        }

        for (const [name, action] of moderationQueue) {
            database.queueModerationAction(name, {
                ...action,
                queueTime: new Date(action.queueTime),
                executionTime: new Date(action.executionTime)
            })
            counts.moderationQueue++
        }
    })()

    db.close()

    console.log(`Migrated ${dbDir} -> ${out}`)
    console.table({
        'users (with data)': { source: users.length, migrated: counts.users },
        'user notes': { migrated: counts.notes },
        'warns': { migrated: counts.warns },
        'users with points': { migrated: counts.points },
        'point history entries': { migrated: counts.pointHistory },
        'bot settings': { source: botSettings.length, migrated: counts.botSettings },
        'moderation queue': { source: moderationQueue.length, migrated: counts.moderationQueue }
    })
}

main()
