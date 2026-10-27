import { LiveInteractionPermissions } from '../managers/liveCommandManager'

export type InteractionPath = string
export type EmojiId = string
export type RoleId = string
export type ChannelId = string

export interface LiveConfig {
    modules?: Modules
    permissions?: Record<string, LiveInteractionPermissions>
}

export interface Modules {
    verification?: VerificationModule;
    supportThreads?: SupportThreadsModule
    roleKits?: RoleKitsModule
    modMail?: ModMailModule
    reactRoles?: ReactRolesModule
    vanityRoles?: VanityRolesModule
    pointsSystem?: PointsModule
    moderation?: ModerationModule
}

interface ModuleConfig {
    enabled?: boolean
    permissions?: LiveInteractionPermissions
}

export interface ModerationModule extends ModuleConfig {
    loggingChannel?: ChannelId

    muteConfig?: UserMuteConfig
    warnConfig?: UserWarnConfig
    wordCensorConfig?: WordCensorConfig
    spamDetection?: SpamDetectionConfig
}

// Detects members (usually compromised accounts) posting across many channels in a short time
export interface SpamDetectionConfig {
    enabled?: boolean

    // Sliding window in which messages are compared
    windowSeconds?: number
    // Distinct channels containing the same message
    duplicateChannelThreshold?: number
    // Distinct channels containing links or attachments
    mediaChannelThreshold?: number
    // Distinct channels containing any message
    channelThreshold?: number

    timeoutDuration?: string
    deleteMessages?: boolean
    notifyUser?: boolean

    // Defaults to the moderation logging channel
    alertChannel?: ChannelId
    alertRole?: RoleId

    exemptRoles?: RoleId[]
    ignoredChannels?: ChannelId[]
}

export interface WordCensorConfig {
    matches?: {
        regex: string
        flags?: string
        warn?: boolean
    }[]
}

export interface UserWarnConfig {
    permissions?: LiveInteractionPermissions

    levels?: {
        action: 'MUTE' | 'BAN' | 'NOTICE'
        duration?: string
    }[]

    cooldownPeriod?: string
}

export interface UserMuteConfig {
    permissions?: LiveInteractionPermissions
    muteRole?: RoleId
}

export interface PointsModule extends ModuleConfig {
    loggingChannel?: ChannelId
}

export interface VanityRolesModule extends ModuleConfig {
    loggingChannel?: ChannelId
    createRoleAfter?: RoleId
}

export interface ReactRolesModule extends ModuleConfig {
    configs?: Record<string, ReactRolesConfig>
}

export interface ReactRolesConfig {
    image?: string
    title?: string
    description?: string
    permissions?: LiveInteractionPermissions
    color?: number
    reactions?: Record<EmojiId, {
        role?: string
        description?: string
    }>
}

export interface ModMailModule extends ModuleConfig {
    channels?: {
        logging?: ChannelId
        threads?: ChannelId
    }

    ignoreRole?: RoleId
}

export interface RoleKitsModule extends ModuleConfig {
    kits?: Record<string, RoleKit>
}

export interface RoleKit {
    name?: string
    description?: string
    addRoles?: RoleId[]
    removeRoles?: RoleId[]
    permissions?: LiveInteractionPermissions
    exportAsCommand?: boolean
}

export interface SupportThreadsModule extends ModuleConfig {
    configs?: Record<string, SupportThreadConfigs>
}

export interface VerificationModule extends ModuleConfig {
    welcomeChannel?: ChannelId
    verifiedRole?: RoleId | RoleId[]

    interactions?: {
        initialMessageInteractionPath?: string
        rulesAcknowledgementInteractionPath?: string
    }

    button?: LiveButtonConfig
}

export interface SupportThreadConfigs {
    displayInteractionPath?: InteractionPath

    supportThreadConfirmationInteractionPath?: InteractionPath
    supportThreadDisplayInteractionPath?: InteractionPath
    supportThreadChannel?: ChannelId
    supportThreadButton?: LiveButtonConfig
    
    troubleshootInteractionPath?: InteractionPath
    troubleshootButton?: LiveButtonConfig
}

export interface LiveButtonConfig {
    title?: string;
    type?: 'PRIMARY' | 'SECONDARY' | 'DANGER' | 'SUCCESS';
}
