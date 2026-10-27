// Require the necessary discord.js classes
import AdmZip from 'adm-zip'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Channel, ChannelType, Client, Events, GatewayIntentBits, MessageFlags, Guild, GuildMember, MessageCreateOptions, Partials, REST, RESTPostAPIApplicationCommandsJSONBody, Routes, SendableChannels } from 'discord.js'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { Constants } from './constants'
import { LocalCommandManager } from './managers/commandManager'
import { LiveCommandManager } from './managers/liveCommandManager'
import fs from 'fs'
import fsp from 'fs/promises'
import { LocalInteractionManager } from './managers/interactionManager'
import { LiveInteractionManager } from './managers/liveInteractionManager'
import yaml from 'js-yaml'
import path from 'path'
import { constantsFromObject, hasPermission, loadYaml } from './utils'
import { ChannelId, LiveConfig } from './models/LiveConfig'
import { MessageLiveInteraction } from './models/MessageLiveInteraction'
import { LiveTriggerManager } from './managers/triggerManager'
import { IAutocompletableCommand, IExecutableCommand } from './commands/command'
import { ModMailManager } from './managers/modMailManager'
import { ReactRolesManager } from './managers/reactRolesManager'
import { VanityRolesManager } from './managers/vanityRolesManager'
import { BotActivity, DatabaseManager } from './managers/databaseManager'
import { PointsManager } from './managers/pointsManager'
import { ModerationModuleManager } from './managers/moderationModuleManager'
import { SpamDetectionManager } from './managers/spamDetectionManager'
import { resolveButtonStyle } from './models/liveCompat'

class DiscordBotHandler {
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.MessageContent
        ],
        partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction
        ],
        rest: {
            retries: 2,
            globalRequestsPerSecond: 50
        }
    })
    restClient = new REST().setToken(Constants.DISCORD_BOT_TOKEN)

    get guild(): Promise<Guild> {
        return (async () => {
            let guild: Guild | undefined

            if (this.client.guilds.cache.has(Constants.DISCORD_GUILD_ID))
                guild = this.client.guilds.cache.get(Constants.DISCORD_GUILD_ID)
            else
                guild = await this.client.guilds.fetch(Constants.DISCORD_GUILD_ID)
            
            if (!guild) {
                throw new Error(`Unable to resolve guild ${Constants.DISCORD_GUILD_ID}`)
            }

            return guild
        })()
    }


    localCommandManager = new LocalCommandManager()
    liveCommandManager = new LiveCommandManager()

    localInteractionManager = new LocalInteractionManager()
    liveInteractionManager = new LiveInteractionManager()
    liveTriggerManager = new LiveTriggerManager()
    modMailManager = new ModMailManager()
    reactRolesManager = new ReactRolesManager()
    vanityRolesManager = new VanityRolesManager()
    databaseManager = new DatabaseManager()
    pointsManager = new PointsManager()
    moderationManager = new ModerationModuleManager()
    spamDetectionManager = new SpamDetectionManager()

    liveConstants: any | undefined = {}
    liveConfig: LiveConfig = {}

    constructor() {
        console.log('Initialized a new Bot Handler')
    }

    async initialize() {
        try {
            await this.loadCommands()

            // When the client is ready, run this code (only once)
            this.client.once(Events.ClientReady, () => {
                console.log('Ready!')
            })

            this.client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
                if (newThread.parent) { newThread = await newThread.fetch() }

                const autoArchiveDuration = oldThread.autoArchiveDuration
                if (!autoArchiveDuration) { return }
                
                if (oldThread.archived || autoArchiveDuration > 144 || oldThread.type == ChannelType.PrivateThread) { return }
                if (!newThread.archived) { return }

                try {
                    const starterMessage = await newThread.fetchStarterMessage()
                    await starterMessage?.delete()
                } catch (error) {
                    console.log(error)
                }
            })

            this.client.on(Events.GuildMemberRemove, async (member) => {
                try {
                    if (member.partial) {
                        member = await member.fetch()
                    }
                    
                    await this.vanityRolesManager.memberUpdated(member)
                } catch (err) {
                    this.logInternalError(err)
                }
            })

            this.client.on(Events.GuildMemberUpdate, async (_, member) => {
                try {
                    if (member.partial) {
                        member = await member.fetch()
                    }
                    
                    await this.vanityRolesManager.memberUpdated(member)
                } catch (err) {
                    this.logInternalError(err)
                }
            })

            this.client.on(Events.GuildMemberAvailable, async (member) => {
                try {
                    if (member.partial) {
                        member = await member.fetch()
                    }
                    
                    await this.vanityRolesManager.memberUpdated(member)
                } catch (err) {
                    this.logInternalError(err)
                }
            })

            this.client.on(Events.GuildMemberAdd, async (member) => {
                const welcomeChannelId = this.liveConfig.modules?.verification?.welcomeChannel
                if (welcomeChannelId) {
                    const channel = this.client.channels.cache.get(welcomeChannelId)
                    if (channel && channel.isSendable())
                        await this.sendWelcomeMessage(channel, member)
                }
            })

            this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
                try {
                    console.log('message reaction add')
                    await this.reactRolesManager.handleReaction(reaction, user)
                } catch (err) {
                    this.logInternalError(err, reaction.message)
                }
            })

            this.client.on(Events.MessageCreate, async message => {
                try {
                    console.log('messageCreate')
                    if (await this.spamDetectionManager.handleMessage(message)) { return }

                    await this.moderationManager.parseMessage(message)
                    await this.modMailManager.handleMessage(message)
                    await this.liveTriggerManager.parseMessage(message)
                    
                    if (!message.channel.isThread()) { return }
                    if (message.member?.user.bot) { return }
                    if (message.channel.autoArchiveDuration != 60) { return }
                    if (Constants.SUPPORT_CHANNEL_ID != message.channel.parentId) { return }
                    
                    await message.channel.send({ content: 'Setting archive duration to **24** hours due to activity' })
                    await message.channel.setAutoArchiveDuration(1440)
                } catch (err) {
                    this.logInternalError(err, message)
                }
            })

            this.client.on(Events.InteractionCreate, async interaction => {
                console.log('Interaction Created')
                try {
                    if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
                        const commandName = path.join(interaction.commandName, interaction.options.getSubcommand(false) ?? '')
                        const commandPerms = this.liveConfig.permissions?.[commandName]
                        if (commandPerms) {
                            if (!hasPermission(commandPerms, interaction.member as GuildMember)) {
                                if (interaction.isChatInputCommand())
                                    await interaction.reply({ content: 'You don\'t have permission to execute this command', flags: MessageFlags.Ephemeral })
                                return
                            }
                        }

                        const CommandClass =
                            this.localCommandManager.resolveLocalCommandClass(interaction.commandName) ??
                            this.liveCommandManager.resolveLiveCommandClass(interaction.commandName, interaction.options.getSubcommand(false) ?? undefined)
                        if (!CommandClass) return

                        const commandInstance: IExecutableCommand | IAutocompletableCommand = new CommandClass()

                        if (interaction.isChatInputCommand() && (commandInstance as IExecutableCommand).execute)
                            await (commandInstance as IExecutableCommand).execute(interaction)
                        else if (interaction.isAutocomplete() && (commandInstance as IAutocompletableCommand).handleAutocomplete)
                            await (commandInstance as IAutocompletableCommand).handleAutocomplete(interaction)
                    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
                        const ExecutableInteractionClass = this.localInteractionManager.resolveInteraction(interaction.customId)
                        if (!ExecutableInteractionClass) return

                        const executableInteractionInstance = new ExecutableInteractionClass()
                        await executableInteractionInstance.execute(interaction)
                    }
                } catch (error) {
                    if (!interaction.isChatInputCommand() && !interaction.isMessageComponent()) {
                        await this.logInternalError(error)
                        return
                    }

                    console.error(error)
                    if (interaction.replied || interaction.deferred) {
                        await interaction.editReply({ content: '**ERROR**: ' + error })
                    } else {
                        await interaction.reply({content: `**ERROR:** ${error}`, flags: MessageFlags.Ephemeral})
                    }
                }
            })

            this.client.on(Events.Error, async error => {
                await this.logInternalError(error)
            })

            // Login to Discord with your client's token
            await this.client.login(Constants.DISCORD_BOT_TOKEN)

            await this.loadActivity()
        } catch (error: any) {
            console.log('interal error')
            await this.client.login(Constants.DISCORD_BOT_TOKEN)
            await this.logInternalError(error)
            this.client.destroy()
        }
    }

    async loadActivity() {
        const activity = this.databaseManager.getActivity()
        if (!activity) return

        this.setActivity(activity.message, activity.type)
    }

    setActivity(message: string, type: BotActivity['type']) {
        this.client.user?.setActivity({
            name: message,
            type: type
        })

        this.databaseManager.setActivity({ message, type: type })
    }

    removeActivity() {
        this.client.user?.setPresence({ activities: [] })
        this.databaseManager.setActivity(undefined)
    }

    async logInternalError(error: any, message: {url?: string} | undefined = undefined) {
        console.log(error)

        const channelId = Constants.BOT_INTERNAL_LOG_CHANNEL
        if (!channelId) return
        
        let channel: Channel | null | undefined = this.client.channels.cache.get(channelId)
        if (!channel) {
            channel = await this.client.channels.fetch(channelId)
        }

        if (!channel?.isSendable()) return

        await channel.send(`**INTERNAL UNHANDLED ERROR**${message?.url == undefined ? '' : '\nMESSAGE:' + message?.url}\n${error}`)
    }

    async loadCommands() {
        await this.downloadAndExtractLiveCommandRepo()
        this.loadConstants()
        this.loadConfig()

        this.liveTriggerManager.loadTriggers()

        return this.registerCommands([
            ...this.liveCommandManager.getLiveCommands(),
            ...await this.localCommandManager.getLocalCommands()
        ])
    }

    async unloadCommands() {
        return this.registerCommands([])
    }

    loadConstants() {
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
            this.liveConstants = yaml.load(
                fs.readFileSync(liveConstantsPath).toString()
            ) ?? {}

            console.log(`loaded constants: ${JSON.stringify(this.liveConstants, null, 2)}`)
        } catch (error: any) {
            throw new Error('Unable to load constants\n'+error, { cause: error })
        }
    }

    loadConfig() {
        this.liveConfig = {}

        const liveConfigPath = path.join(
            Constants.LIVE_COMMANDS_REPO_EXTRACT_DIR,
            Constants.LIVE_COMMANDS_REPO_BASE_FOLDER_NAME,
            'config.yaml'
        )

        if (!fs.existsSync(liveConfigPath)) {
            console.log('Live config dont exist')
            return
        }

        try {
            this.liveConfig = loadYaml(
                fs.readFileSync(liveConfigPath).toString(),
                this.liveConstants
            ) ?? {}

            console.log(`loaded config: ${JSON.stringify(this.liveConfig, null, 2)}`)
        } catch(error: any) {
            throw new Error('Unable to load config\n' + error, { cause: error })
        }
    }

    async registerCommands(commands: RESTPostAPIApplicationCommandsJSONBody[]) {
        const hashSet: Record<string, RESTPostAPIApplicationCommandsJSONBody> = {}
        for (const command of commands) {
            if (!command.name) continue
            hashSet[command.name] = command

            console.log(`Registering Command: ${command.name}`)
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
        const response = await fetch(url)
        if (!response.ok || !response.body) {
            throw new Error(`Failed to get '${url}' (${response.status})`)
        }

        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath))
    }

    private async sendWelcomeMessage(channel: SendableChannels, member: GuildMember) {
        if (!discordBot.liveConfig.modules?.verification?.enabled) return

        const liveInteractionId = discordBot.liveConfig.modules?.verification?.interactions?.initialMessageInteractionPath
        if (!liveInteractionId) {
            await channel.send('**ERROR:** `interactions.initial_message` not set')
            return
        }
        
        const liveInteraction = discordBot.liveInteractionManager.resolveLiveInteraction(
            liveInteractionId,
            constantsFromObject(member)
        )
        if (!liveInteraction) {
            await channel.send('**ERROR:** Unable to parse live interaction for id ' + liveInteractionId)
            return
        }

        const message = new MessageLiveInteraction(liveInteraction)
        await channel.send(message.toMessage({
            components: [
                new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('verificationInteraction')
                            .setLabel(discordBot.liveConfig.modules?.verification?.button?.title ?? 'Verify')
                            .setStyle(resolveButtonStyle(discordBot.liveConfig.modules?.verification?.button?.type, ButtonStyle.Primary)),
                    )
                    
            ]
        }))
    }

    async sendToChannel(channelId: ChannelId, message: MessageCreateOptions) {
        const guild = await discordBot.guild

        let channel = guild.channels.cache.get(channelId)
        if (!channel) channel = await guild.channels.fetch(channelId) ?? undefined
        
        if (!channel || !channel.isSendable()) {
            throw new Error('Channel is not TextBased')
        }

        await channel.send(message)
    }
}

export const discordBot = new DiscordBotHandler()
discordBot.initialize()