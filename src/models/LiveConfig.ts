export interface LiveConfig {
    modules?: Modules
}

export interface Modules {
    verification?: VerificationModule;
}

export interface VerificationModule {
    welcome_channel?: string
    permission?: string
    verified_role?: string

    interactions?: {
        initial_message?: string
        rules_acknowledgement?: string
    }

    button?: Button
    links?: Link[]
}

export interface Button {
    title?: string;
    type?: 'PRIMARY' | 'SECONDARY' | 'DANGER' | 'SUCCESS';
}

export interface Link {
    title?: string;
    target?: string;
    emote?: string;
}
