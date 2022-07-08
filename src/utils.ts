/* eslint-disable @typescript-eslint/ban-ts-comment */

import {MessageOptions, MessageActionRow, MessageSelectMenu, MessageButton, GuildMember, Interaction, CommandInteraction, PermissionResolvable } from 'discord.js'
import { LiveInteraction, LiveInteractionPermissions } from './managers/liveCommandManager'
import { NodeVM, VM } from 'vm2'
import yaml from 'js-yaml'
import { create, all} from 'mathjs'

const utilityConstants = {
    getValuesRecursive,
    keysToUpperCaseRecursive,
    cleanString,
    randomFromList,
    randomNumberBetween
}

function substituteTemplateLiterals(str: string, constants: any): any {
    let templateRegex = /(?:\$\{([\s\S]*?)\}|<\$js([\s\S]*?)\$>)/g
    let match
    while ((match = templateRegex.exec(str)) != undefined) {
        if (match.length <= 1) continue
        
        try {
            const mathjs = create(all)
            const mathjsEvaluate = mathjs.evaluate
            mathjs.import({
                'import': function () { return 'Function `import` is disabled' },
                'createUnit': function () { return 'Function `createUnit` is disabled' },
                'evaluate': function () { return 'Function `evaluate` is disabled' },
                'parse': function () { return 'Function `parse` is disabled' },
            }, { override: true })

            const result = new VM({
                allowAsync: false,
                wasm: false,
                eval: true,
                timeout: 500,
                sandbox: {
                    ...constants,
                    ...utilityConstants,
                    mathjs,
                    mathjsEvaluate
                }
            }).run(match[1] ?? match[2])

            const start = str.slice(0, match.index)
            const end = str.slice(templateRegex.lastIndex)
            if(start.length > 0 || end.length > 0)
                str = str.slice(0, match.index) + result + str.slice(templateRegex.lastIndex)
            else 
                return result

            templateRegex = /(?:\$\{([\s\S]*?)\}|<\$js([\s\S]*?)\$>)/g
        } catch(error: any) {
            throw new Error(`Error while evaluating JS:${match.index} \n${error.message}\n${error.stack}`)
        }
    }

    return str
}

export function constantsFromObject(obj: GuildMember | Interaction): any {
    const date = new Date()
    const constants: any = {
        '$DATE': {
            'TIMESTAMP': date.getTime(),

            'DATE_STRING': date.toDateString(),
            'TIME_STRING': date.toTimeString(),
            'JSON_STRING': date.toJSON(),

            'DAY': date.getDay(),
            'MONTH': date.getMonth(),
            'YEAR': date.getFullYear(),

            'HOURS': date.getHours(),
            'MINUTES': date.getMinutes(),
            'SECONDS': date.getSeconds()
        }
    }

    if (obj.user) {
        constants['$USER'] = {
            'ID': obj.user.id,
            'USERNAME': obj.user.username,
            'TAG': obj.user.discriminator,
            'AVATAR': obj.user.displayAvatarURL({ size: 4096, format: 'png' })
        }
    }

    if ((obj as Interaction).isCommand?.()) {
        const interaction = obj as CommandInteraction

        for (const option of interaction.options.data) {
            if (option.type == 'SUB_COMMAND' || option.type == 'SUB_COMMAND_GROUP') continue
            if (!constants['$OPTIONS']) constants['$OPTIONS'] = {}

            if(typeof option.value == 'object')
                constants['$OPTIONS'][option.name.toUpperCase()] = keysToUpperCaseRecursive(option.value)
            else {
                constants['$OPTIONS'][option.name.toUpperCase()] = option.value
            }
        }
    }

    return constants
}

export function hasPermission(permissions: LiveInteractionPermissions | undefined, member: GuildMember | null | undefined, fallbackRolePermission: PermissionResolvable | undefined = undefined) {
    if (!member) {
        return false
    }

    if (!permissions) {
        return fallbackRolePermission ? member.permissions.has(fallbackRolePermission) : true
    }

    if (!member.roles || !member.roles.cache) {
        if (permissions.blacklist || permissions.whitelist) return false
        return true
    }

    const roles = member.roles.cache

    if (permissions.blacklist) {
        if (roles.hasAny(...permissions.blacklist)) return false
    }

    if (permissions.whitelist) {
        if (roles.hasAny(...permissions.whitelist)) return true
        else return false
    }

    return true
}

export function loadYaml<T extends object>(str: string, constants: any): T | undefined {
    const loadedObj = yaml.load(str) as T
    return getProxy(loadedObj, constants)
} 

function getProxy<T extends object>(obj: T, constants: any): T {
    if (obj == undefined) {
        return obj
    } else if (typeof obj == 'string') {
        return substituteTemplateLiterals(obj, constants)
    } else if (Array.isArray(obj)) {
        // @ts-ignore
        return obj.map(v => getProxy(v, constants))
    } else if (typeof obj == 'object') {
        return new Proxy<T>(obj, {
            get: (target, name) => {
                // @ts-ignore
                const value = target?.[name]
                return getProxy(value, constants)
            }
        })
    }

    return obj
}

export function keysToUpperCaseRecursive(obj: any): any {
    const newObj: any = {}

    for (const key of Object.keys(obj)) {
        const value = obj[key]
        if (typeof value == 'object') {
            newObj[key.toUpperCase()] = keysToUpperCaseRecursive(value)
        } else {
            newObj[key.toUpperCase()] = value
        }

    }

    return newObj
}

export function cleanString(str: string): string {
    return str.split('.')[0].replace(/[^a-zA-Z]/gi, '').toLowerCase()
}

export function getValuesRecursive(obj: any): any[] {
    return Object.values(obj)
        .flatMap(x => {
            if (Array.isArray(x)) {
                return x
            } else if (typeof x == 'object') {
                return getValuesRecursive(x)
            } else {
                return [x]
            }
        })
}

export function randomFromList(list: any[]) {
    if (list.length == 0) return undefined
    return list[randomNumberBetween(0, list.length - 1)]
}

export function randomNumberBetween(start: number, end: number) {
    return start + Math.round(Math.random() * (end - start))
}

export function sleep(ms: number) {
    return new Promise(res => setTimeout(res, ms))
}

export async function invokeRepeatedly(func: () => Promise<void> | void, interval: number, invocations = Infinity): Promise<void> {
    for (let i = 0; i < invocations; i++) {
        await func()
        await sleep(interval)
    }
}

export function parseHumanDate(str: string) {
    const matches = str.matchAll(/(\d+)\s?([A-z]+)/gi)
    let time = 0
    for (const match of matches) {
        match.shift()
        time += parseFloat(match[0]) * (parseDateComponent(match[1]) ?? 0)
    }
    return time
}

function parseDateComponent(str: string) {
    switch (str.toLowerCase()) {
    case 'y': case 'yr': case 'yrs': case 'year': case 'years':
        return 3.156e+10
    case 'm': case 'min': case 'mins': case 'minute': case 'minutes':
        return 6e+4
    case 'd': case 'day': case 'days':
        return 8.64e+7
    case 'h': case 'hr': case 'hrs': case 'hour': case 'hours':
        return 3.6e+6
    case 'mth': case 'mths': case 'month': case 'months':
        return 2.628e+9
    default:
        return undefined
    }
}
