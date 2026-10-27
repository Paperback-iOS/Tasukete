import { User } from 'discord.js'
import { discordBot } from '..'
import { PointsModule } from '../models/LiveConfig'
import { UserPoints } from './databaseManager'
import { MutexBasedManager } from './mutexBasedManager'

export class PointsManager extends MutexBasedManager {
    get moduleConfig(): PointsModule | undefined {
        return discordBot.liveConfig.modules?.pointsSystem
    }

    getPointsPage(page: number, limit: number) {
        return {
            entries: discordBot.databaseManager.getPointsPage((page - 1) * limit, limit),
            total: discordBot.databaseManager.countUsersWithPoints()
        }
    }

    async addPointsToUser(user: User, amount: number, reason: string, assigner: User) {
        await this.getMutex(user.id).runExclusive(async () => {
            discordBot.databaseManager.addPoints(user.id, amount, reason, assigner.id)

            if (!this.moduleConfig?.loggingChannel) return
            
            await discordBot.sendToChannel(this.moduleConfig?.loggingChannel, {
                content: `[${amount}] <@${assigner.id}> -> <@${user.id}> ${reason}`,
                allowedMentions: { users: [] }
            })
        })
    }

    getPointsForUser(user: User): UserPoints | undefined {
        return discordBot.databaseManager.getPoints(user.id)
    }

    async removeAllPointsForUser(user: User, assigner: User) {
        await this.getMutex(user.id).runExclusive(async () => {
            discordBot.databaseManager.clearPoints(user.id)
            if (!this.moduleConfig?.loggingChannel) return

            await discordBot.sendToChannel(this.moduleConfig?.loggingChannel, {
                content: ` <@${assigner.id}> Cleaned <@${user.id}>`,
                allowedMentions: { users: [] }
            })
        })
    }
}
