import { CacheType, ChannelType, ChatInputCommandInteraction, EmbedBuilder, Colors, GuildExplicitContentFilter, GuildVerificationLevel, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { Command } from './command'
import { discordBot } from '..'

const filterLevels: Record<GuildExplicitContentFilter, string> = {
    [GuildExplicitContentFilter.Disabled]: 'Off',
    [GuildExplicitContentFilter.MembersWithoutRoles]: 'No Role',
    [GuildExplicitContentFilter.AllMembers]: 'Everyone',
}
  
const verificationLevels: Record<GuildVerificationLevel, string> = {
    [GuildVerificationLevel.None]: 'None',
    [GuildVerificationLevel.Low]: 'Low',
    [GuildVerificationLevel.Medium]: 'Medium',
    [GuildVerificationLevel.High]: '(╯°□°）╯︵ ┻━┻',
    [GuildVerificationLevel.VeryHigh]: '┻━┻ ﾐヽ(ಠ益ಠ)ノ彡┻━┻',
}
  
export default class ServerInfoCommand implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('serverinfo')
            .setDescription('Shows info about the server')
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
        await interaction.deferReply()

        const guild = await discordBot.guild

        const roles = guild.roles.cache
            .sort((a, b) => b.position - a.position)
            .map((role) => role.toString())
        const members = guild.members.cache
        const channels = guild.channels.cache
        const emojis = guild.emojis.cache
        const owner = await guild.fetchOwner()
  
        const embed = new EmbedBuilder()
            .setDescription('**Server Info**')
            .setColor(Colors.Purple)
            .setThumbnail(guild.iconURL())
            .addFields({
                name: 'General',
                value: [
                    `**Name:** ${guild.name}`,
                    `**ID:** ${guild.id}`,
                    `**Owner:** ${owner.user.tag} (${guild.ownerId})`,
                    `**Boost Tier:** ${
                        guild.premiumTier
                            ? `Tier ${guild.premiumTier}`
                            : 'None'
                    }`,
                    `**Explicit Filter:** ${
                        filterLevels[guild.explicitContentFilter]
                    }`,
                    `**Verification Level:** ${
                        verificationLevels[guild.verificationLevel]
                    }`,
                    `**Time Created:** <t:${(guild.createdTimestamp/1000).toFixed(0)}> <t:${(guild.createdTimestamp/1000).toFixed(0)}:R>`,
                ].join('\n')
            }, {
                name: 'Statistics',
                value: [
                    `**Role Count:** ${roles.length}`,
                    `**Emoji Count:** ${emojis.size}`,
                    `**Regular Emoji Count:** ${
                        emojis.filter((emoji) => !emoji.animated).size
                    }`,
                    `**Animated Emoji Count:** ${
                        emojis.filter((emoji) => emoji.animated ?? false).size
                    }`,
                    `**Member Count:** ${guild.memberCount}`,
                    `**Bots:** ${members.filter((member) => member.user.bot).size}`,
                    `**Text Channels:** ${
                        channels.filter((channel) => channel.type === ChannelType.GuildText).size
                    }`,
                    `**Voice Channels:** ${
                        channels.filter((channel) => channel.type === ChannelType.GuildVoice).size
                    }`,
                    `**Stage Channels:** ${
                        channels.filter((channel) => channel.type === ChannelType.GuildStageVoice).size
                    }`,
                    `**Boost Count:** ${guild.premiumSubscriptionCount || '0'}`,
                ].join('\n')
            })
            .setFooter({
                text: `Requested by ${interaction.user.username}`
            })
            .setTimestamp(Date.now())
  
        await interaction.editReply({
            embeds: [embed.toJSON()]
        })
    }
}