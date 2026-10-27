import { APIEmbed, ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, EmbedData, resolveColor } from 'discord.js'

// The live interactions repo was written against discord.js v13, which used
// SCREAMING_SNAKE_CASE strings for enums. These helpers translate those values
// so the YAML keeps working without changes.

function toPascalCase(value: string): string {
    return value
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('')
}

export function resolveButtonStyle(style: unknown, fallback: ButtonStyle = ButtonStyle.Primary): ButtonStyle {
    if (typeof style == 'number' && ButtonStyle[style] !== undefined) return style
    if (typeof style != 'string') return fallback

    const resolved = ButtonStyle[toPascalCase(style) as keyof typeof ButtonStyle]
    return resolved ?? fallback
}

const legacyColorNames: Record<string, string> = Object.fromEntries(
    [...Object.keys(Colors), 'Random', 'Default'].map(key => [key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(), key])
)

export function resolveLegacyColor(color: unknown): number | undefined {
    if (color == undefined) return undefined

    const resolvable = typeof color == 'string' ? legacyColorNames[color] ?? color : color
    return resolveColor(resolvable as Parameters<typeof resolveColor>[0])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function legacyButton(button: any): ButtonBuilder {
    const { style, type: _type, ...rest } = button
    return new ButtonBuilder({
        ...rest,
        style: resolveButtonStyle(style, rest.url ? ButtonStyle.Link : ButtonStyle.Primary)
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function legacyEmbed(embed: any): APIEmbed {
    const { color, timestamp, ...rest } = embed as EmbedData & { color?: unknown, timestamp?: unknown }
    const data: EmbedData = { ...rest }

    const resolvedColor = resolveLegacyColor(color)
    if (resolvedColor !== undefined) data.color = resolvedColor

    if (timestamp instanceof Date || typeof timestamp == 'number') {
        data.timestamp = new Date(timestamp).toISOString()
    } else if (typeof timestamp == 'string') {
        data.timestamp = timestamp
    }

    return new EmbedBuilder(data).toJSON()
}
