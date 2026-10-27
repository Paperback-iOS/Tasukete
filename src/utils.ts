/* eslint-disable @typescript-eslint/ban-ts-comment */

import { ApplicationCommandOptionType, GuildMember, Interaction, PermissionResolvable } from 'discord.js'
import { LiveInteractionPermissions } from './managers/liveCommandManager'
import ivm from 'isolated-vm'
import yaml from 'js-yaml'
import fs from 'fs'

const SANDBOX_MEMORY_LIMIT_MB = 128
const SANDBOX_TIMEOUT_MS = 500
const MATHJS_LOAD_TIMEOUT_MS = 5000

// Helpers exposed to template expressions, re-declared inside the sandbox from their source
const utilityFunctionsSource = [
    getValuesRecursive,
    keysToUpperCaseRecursive,
    cleanString,
    randomFromList,
    randomNumberBetween
].map(fn => fn.toString()).join('\n')

const mathjsSetupSource = `
globalThis.mathjs = math.create(math.all)
globalThis.mathjsEvaluate = mathjs.evaluate
mathjs.import({
    'import': function () { return 'Function \`import\` is disabled' },
    'createUnit': function () { return 'Function \`createUnit\` is disabled' },
    'evaluate': function () { return 'Function \`evaluate\` is disabled' },
    'parse': function () { return 'Function \`parse\` is disabled' },
}, { override: true })
delete globalThis.math
`

interface Sandbox {
    isolate: ivm.Isolate
    utilityScript: ivm.Script
    mathjsScript?: ivm.Script
    mathjsSetupScript?: ivm.Script
}

let sandbox: Sandbox | undefined

function getSandbox(): Sandbox {
    if (sandbox && !sandbox.isolate.isDisposed) return sandbox

    const isolate = new ivm.Isolate({ memoryLimit: SANDBOX_MEMORY_LIMIT_MB })
    sandbox = {
        isolate,
        utilityScript: isolate.compileScriptSync(utilityFunctionsSource)
    }

    return sandbox
}

function loadMathjs(sandbox: Sandbox, context: ivm.Context) {
    if (!sandbox.mathjsScript || !sandbox.mathjsSetupScript) {
        const mathjsSource = fs.readFileSync(require.resolve('mathjs/lib/browser/math.js')).toString()
        sandbox.mathjsScript = sandbox.isolate.compileScriptSync(mathjsSource, { filename: 'mathjs.js' })
        sandbox.mathjsSetupScript = sandbox.isolate.compileScriptSync(mathjsSetupSource)
    }

    sandbox.mathjsScript.runSync(context, { timeout: MATHJS_LOAD_TIMEOUT_MS })
    sandbox.mathjsSetupScript.runSync(context, { timeout: MATHJS_LOAD_TIMEOUT_MS })
}

function evaluateInSandbox(code: string, constants: any): any {
    const sandbox = getSandbox()
    const context = sandbox.isolate.createContextSync()

    try {
        const jail = context.global
        for (const [key, value] of Object.entries(constants ?? {})) {
            jail.setSync(key, new ivm.ExternalCopy(value).copyInto())
        }

        sandbox.utilityScript.runSync(context)
        if (code.includes('mathjs')) {
            loadMathjs(sandbox, context)
        }

        return context.evalSync(code, { timeout: SANDBOX_TIMEOUT_MS, copy: true })
    } finally {
        context.release()
    }
}

// Substitutes `${...}` and `<$js ... $>` templates in a single pass, evaluated text is never re-scanned
function substituteTemplateLiterals(str: string, constants: any): any {
    const matches = [...str.matchAll(/(?:\$\{([\s\S]*?)\}|<\$js([\s\S]*?)\$>)/g)]
    if (matches.length == 0) return str

    const evaluate = (match: RegExpExecArray) => {
        try {
            return evaluateInSandbox(match[1] ?? match[2], constants)
        } catch(error: any) {
            throw new Error(`Error while evaluating JS:${match.index} \n${error.message}\n${error.stack}`, { cause: error })
        }
    }

    // A template spanning the whole string keeps the evaluated value's type
    if (matches.length == 1 && matches[0][0].length == str.length) {
        return evaluate(matches[0])
    }

    let result = ''
    let lastIndex = 0
    for (const match of matches) {
        result += str.slice(lastIndex, match.index) + evaluate(match)
        lastIndex = match.index + match[0].length
    }

    return result + str.slice(lastIndex)
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
            'AVATAR': obj.user.displayAvatarURL({ size: 4096, extension: 'png' })
        }
    }

    if (!(obj instanceof GuildMember) && obj.isChatInputCommand()) {
        const interaction = obj

        for (const option of interaction.options.data) {
            if (option.type == ApplicationCommandOptionType.Subcommand || option.type == ApplicationCommandOptionType.SubcommandGroup) continue
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
    const matches = str.matchAll(/(\d+)\s?([a-z]+)/gi)
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
    case 'w': case 'wk': case 'wks': case 'week': case 'weeks':
        return 6.048e+8
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
