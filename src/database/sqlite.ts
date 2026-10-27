import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// Each entry upgrades the schema by one version, tracked with PRAGMA user_version
const migrations: string[] = [
    `
    CREATE TABLE users (
        id TEXT PRIMARY KEY,
        mod_mail_thread TEXT,
        vanity_role_id TEXT
    );

    CREATE TABLE user_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        moderator TEXT NOT NULL,
        date TEXT NOT NULL
    );
    CREATE INDEX user_notes_user_id ON user_notes(user_id);

    CREATE TABLE warns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        moderator TEXT NOT NULL,
        reason TEXT NOT NULL,
        date INTEGER NOT NULL,
        action TEXT
    );
    CREATE INDEX warns_user_id ON warns(user_id);

    CREATE TABLE user_points (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        amount REAL NOT NULL
    );

    CREATE TABLE point_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        reason TEXT NOT NULL,
        assigner TEXT NOT NULL
    );
    CREATE INDEX point_history_user_id ON point_history(user_id);

    CREATE TABLE bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE moderation_queue (
        name TEXT PRIMARY KEY,
        queue_time INTEGER NOT NULL,
        execution_time INTEGER NOT NULL,
        moderator TEXT NOT NULL,
        target TEXT NOT NULL,
        reason TEXT NOT NULL,
        subactions TEXT NOT NULL
    );
    CREATE INDEX moderation_queue_execution_time ON moderation_queue(execution_time);
    `,
    `
    CREATE TABLE spam_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        channels TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        sample TEXT NOT NULL,
        timed_out_until INTEGER,
        created_at INTEGER NOT NULL,
        resolution TEXT,
        resolved_by TEXT,
        resolved_at INTEGER
    );
    CREATE INDEX spam_flags_user_id ON spam_flags(user_id);
    `
]

export function openDatabase(filePath: string): Database.Database {
    if (filePath != ':memory:') {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
    }

    const db = new Database(filePath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    migrate(db)
    return db
}

function migrate(db: Database.Database) {
    const currentVersion = db.pragma('user_version', { simple: true }) as number

    for (let version = currentVersion; version < migrations.length; version++) {
        db.transaction(() => {
            db.exec(migrations[version])
            db.pragma(`user_version = ${version + 1}`)
        })()
    }
}
