// Require the necessary discord.js classes
import { REST } from '@discordjs/rest'
import AdmZip from 'adm-zip'
import { RESTPatchAPIApplicationCommandJSONBody, Routes } from 'discord-api-types/v9'
import { Client, CommandInteraction, Intents, MessageActionRow, MessageButton, TextBasedChannel, TextChannel } from 'discord.js'
import { https } from 'follow-redirects'
import { Constants } from './constants'
import { LocalCommandManager } from './managers/commandManager'
import { LiveCommandManager } from './managers/liveCommandManager'
import fs from 'fs'
import fsp from 'fs/promises'
import { LocalInteractionManager } from './managers/interactionManager'
import { LiveInteractionManager } from './managers/liveInteractionManager'
import yaml from 'js-yaml'
import path from 'path'
import { substituteTemplateLiterals } from './utils'
import { LiveConfig } from './models/LiveConfig'
import { MessageLiveInteraction } from './models/MessageLiveInteraction'
import { LiveTriggerManager } from './managers/triggerManager'

class DiscordBotHandler {
    client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS] })
    restClient = new REST({ version: '9' }).setToken(Constants.DISCORD_BOT_TOKEN)

    localCommandManager = new LocalCommandManager()
    liveCommandManager = new LiveCommandManager()

    localInteractionManager = new LocalInteractionManager()
    liveInteractionManager = new LiveInteractionManager()

    liveTriggerManager = new LiveTriggerManager()

    liveConstants: any | undefined = {}
    liveConfig: LiveConfig = {}

    constructor() {
        console.log('Initialized a new Bot Handler')
    }

    async initialize() {
        await this.loadCommands()

        // When the client is ready, run this code (only once)
        this.client.once('ready', () => {
            console.log('Ready!')
        })

        this.client.on('guildMemberAdd', async (member) => {
            console.log('kekw someone joined')
            const welcomeChannelId = this.liveConfig.modules?.verification?.welcome_channel
            if (welcomeChannelId) {
                const channel = this.client.channels.cache.get(welcomeChannelId)
                if(channel && channel.isText())
                    await this.sendWelcomeMessage(channel)
            }
        })

        this.client.on('threadUpdate', async (oldThread, newThread) => {
            if (oldThread.archived || !newThread.archived) { return }
            if (Constants.SUPPORT_CHANNEL_ID != newThread.parentId) { return }

            try {
                const starterMessage = await newThread.fetchStarterMessage()
                await starterMessage.delete()
            } catch(error: any) {
                console.error(error)
            }
        })

        this.client.on('messageCreate', async message => {
            await this.liveTriggerManager.parseMessage(message)

            if (!message.channel.isThread()) { return }
            if (message.member?.user.bot) { return }
            if (message.channel.autoArchiveDuration != 60) { return }
            if (Constants.SUPPORT_CHANNEL_ID != message.channel.parentId) { return }

            await message.channel.send({content: 'Setting archive duration to **24** hours due to activity'})
            await message.channel.setAutoArchiveDuration(1440)
        })

        this.client.on('interactionCreate', async interaction => {
            try {
                if (interaction.isCommand()) {
                    const CommandClass =
                        this.localCommandManager.resolveLocalCommand(interaction.commandName) ??
                        this.liveCommandManager.resolveLiveCommand(interaction.commandName)
                    if (!CommandClass) return

                    const commandInstance = new CommandClass()
                    await commandInstance.execute(interaction)
                } else if (interaction.isButton() || interaction.isSelectMenu()) {
                    const ExecutableInteractionClass = this.localInteractionManager.resolveInteraction(interaction.customId)
                    if (!ExecutableInteractionClass) return

                    const executableInteractionInstance = new ExecutableInteractionClass()
                    await executableInteractionInstance.execute(interaction)
                }
            } catch (error) {
                console.error(error)
                if (!interaction.isCommand() && !interaction.isSelectMenu() && !interaction.isMessageComponent()) return

                await interaction.followUp({ content: '**ERROR**: ' + error, ephemeral: true })
            }
        })


        // Login to Discord with your client's token
        await this.client.login(Constants.DISCORD_BOT_TOKEN)


    }

    async loadCommands() {
        await this.downloadAndExtractLiveCommandRepo()
        await this.loadConstants()
        await this.loadConfig()

        await this.liveTriggerManager.loadTriggers()

        return this.registerCommands([
            ...await this.liveCommandManager.getLiveCommands(),
            ...await this.localCommandManager.getLocalCommands()
        ])
    }

    async loadConstants() {
        this.liveConstants = {}

        const liveConstantsPath = path.join(
            Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
            Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
            'constants.yaml'
        )

        if (!fs.existsSync(liveConstantsPath)) {
            return
        }

        try {
            this.liveConstants = await yaml.load(
                (await fsp.readFile(liveConstantsPath)).toString()
            )

            console.log(`loaded constants: ${JSON.stringify(this.liveConstants, null, 2)}`)
        } catch(error: any) {
            this.liveConstants = {}
        }
    }

    async loadConfig() {
        this.liveConfig = {}

        const liveConfigPath = path.join(
            Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
            Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
            'config.yaml'
        )

        if (!fs.existsSync(liveConfigPath)) {
            return
        }

        try {
            this.liveConfig = await yaml.load(
                substituteTemplateLiterals(
                    this.liveConstants,
                    (await fsp.readFile(liveConfigPath)).toString()
                ) 
            ) as LiveConfig

            console.log(`loaded config: ${JSON.stringify(this.liveConfig, null, 2)}`)
        } catch(error: any) {
            this.liveConfig = {}
        }
    }

    async registerCommands(commands: RESTPatchAPIApplicationCommandJSONBody[]) {
        const hashSet: Record<string, RESTPatchAPIApplicationCommandJSONBody> = {}
        for (const command of commands) {
            if (!command.name) continue
            hashSet[command.name] = command
        }

        if (Constants.DEV_MODE) {
            await this.restClient.put(Routes.applicationGuildCommands(Constants.DISCORD_CLIENT_ID, Constants.DISCORD_DEV_GUILD_ID), { body: Object.values(hashSet) })
        } else {
            await this.restClient.put(Routes.applicationGuildCommands(Constants.DISCORD_CLIENT_ID, Constants.DISCORD_GUILD_ID), { body: Object.values(hashSet) })
        }
    }

    async downloadAndExtractLiveCommandRepo() {
        const downloadFilePath = Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR + '.zip'

        if (fs.existsSync(Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR))
            await fsp.rm(Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR, { recursive: true, force: true })

        if (fs.existsSync(downloadFilePath))
            await fsp.rm(downloadFilePath)

        console.log('deleted existing file')

        // Download the zip
        await this.download(Constants.LIVE_COMMANDS_REPO, downloadFilePath)

        console.log('downloaded file')

        const zip = new AdmZip(downloadFilePath)
        zip.extractAllTo(Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR)
    }

    private async download(url: string, filePath: string) {
        const proto = https

        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(filePath)
            let fileInfo: unknown = null

            const request = proto.get(url, response => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to get '${url}' (${response.statusCode})`))
                    return
                }

                fileInfo = {
                    mime: response.headers['content-type'],
                    size: parseInt(response.headers['content-length'] ?? '', 10),
                }

                response.pipe(file)
            })

            // The destination stream is ended by the time it's called
            file.on('finish', () => resolve(fileInfo))

            request.on('error', err => {
                fs.unlink(filePath, () => reject(err))
            })

            file.on('error', err => {
                fs.unlink(filePath, () => reject(err))
            })

            request.end()
        })
    }

    async sendWelcomeMessage(channel: TextBasedChannel) {
        const liveInteractionId = discordBot.liveConfig.modules?.verification?.interactions?.initial_message
        if (!liveInteractionId) {
            await channel.send('**ERROR:** `interactions.initial_message` not set')
            return
        }
        
        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(liveInteractionId)
        if (!liveInteraction) {
            await channel.send('**ERROR:** Unable to parse live interaction for id ' + liveInteractionId)
            return
        }

        const message = new MessageLiveInteraction(liveInteraction)
        await channel.send(message.toMessage({
            components: [
                new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('verificationInteraction')
                            .setLabel(discordBot.liveConfig.modules?.verification?.button?.title ?? 'Verify')
                            .setStyle(discordBot.liveConfig.modules?.verification?.button?.type ?? 'PRIMARY'),
                    )
                    
            ]
        }))
    }
}

export const discordBot = new DiscordBotHandler()
discordBot.initialize()