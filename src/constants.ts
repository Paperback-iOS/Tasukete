import dotenv from 'dotenv'
import path from 'path'

class _Constants {
    constructor() {
        dotenv.config()
    }

    get DISCORD_BOT_TOKEN(): string {
        return this.fromEnvConfig('DISCORD_BOT_TOKEN')
    }

    get DISCORD_CLIENT_ID(): string {
        return this.fromEnvConfig('DISCORD_CLIENT_ID')
    }

    get LIVE_COMMANDS_REPO(): string {
        return this.fromEnvConfig('LIVE_COMMANDS_REPO')
    }
    
    get DISCORD_DEV_GUILD_ID(): string {
        return this.fromEnvConfig('DISCORD_DEV_GUILD_ID')
    }
    
    get DISCORD_GUILD_ID(): string {
        return this.fromEnvConfig('DISCORD_GUILD_ID')
    }
    
    get LIVE_COMMANDS_REPO_BASE_FOLDER_NAME(): string {
        return this.fromEnvConfig('LIVE_COMMANDS_REPO_BASE_FOLDER_NAME')
    }

    get LIVE_COMMANDS_REPO_EXTRACT_DIR(): string {
        return path.join(__dirname, 'liveCommandsRepo')
    }

    get DEV_MODE(): boolean {
        return this.fromEnvConfig('DEV_MODE') == 1
    }

    get SUPPORT_CHANNEL_ID(): string {
        return this.fromEnvConfig('SUPPORT_CHANNEL_ID')
    }

    get MEMBER_ROLE_ID(): string {
        return this.fromEnvConfig('MEMBER_ROLE_ID')
    }

    fromEnvConfig(key: string): any {
        const value = process.env[key]
        if(value !== undefined) return value

        console.log(`[FATAL] ENV VARIABLE "${key}" NOT PRESENT`)
        return ''
    }
}

export const Constants = new _Constants()