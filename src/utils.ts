
import {MessageOptions, MessageActionRow, MessageSelectMenu, MessageButton } from 'discord.js'
import { LiveInteraction } from './managers/liveCommandManager'

export function substituteTemplateLiterals(constants: any, str: string): string {
    function traverse(breadcrumb: string[], obj: any, str: string): string {
        Object.keys(obj).forEach(key => {
            const value = obj[key]
            if (Array.isArray(value)) return
            
            if (typeof value === 'object') {
                str = traverse([...breadcrumb, key], value, str)
                return
            }

            const templateVar = [...breadcrumb, key].join('.')
            const templateRegex = new RegExp(`{{\\s*?${templateVar}\\s*?}}`, 'g')

            str = str.replace(templateRegex, obj[key])
        })

        return str
    }

    return traverse([], constants, str)
}
