import { ChatInputCommandInteraction, GuildMember, PermissionFlagsBits, RESTPostAPIApplicationCommandsJSONBody, SlashCommandBuilder } from 'discord.js'
import { discordBot } from '..'
import { hasPermission } from '../utils'
import { Command, IModuleConfig } from './command'
import {stripIndent } from 'common-tags'

export default class PointsCommand extends IModuleConfig('pointsSystem') implements Command {
    getCommandMetadata(): RESTPostAPIApplicationCommandsJSONBody {
        return new SlashCommandBuilder()
            .setName('points')
            .setDescription('Manage points of a user')
            .setDefaultMemberPermissions((this.moduleConfig?.enabled ?? false) ? null : 0)
            .addSubcommand(builder => builder
                .setName('list')
                .setDescription('Get the points of all users')
                .addNumberOption(builder => builder
                    .setName('page')
                    .setDescription('The page')
                    .setRequired(false)
                )
            )
            .addSubcommand(builder => builder
                .setName('get')
                .setDescription('Get the points of a user')
                .addUserOption(builder => builder
                    .setName('user')
                    .setDescription('The user to get the points for')
                    .setRequired(true)
                )
            )
            .addSubcommand(builder => builder
                .setName('clean')
                .setDescription('Removes all the points and history of a user')
                .addUserOption(builder => builder
                    .setName('user')
                    .setDescription('The user to remove the points for')
                    .setRequired(true)
                )
            )
            .addSubcommand(builder => builder
                .setName('import')
                .setDescription('import points from csv')
                .addStringOption(builder => builder
                    .setName('messageid')
                    .setDescription('the message id in this channel with the csv file')
                    .setRequired(true)
                )
            )
            .addSubcommand(builder => builder
                .setName('add')
                .setDescription('Add/Remove points to a user')
                .addNumberOption(builder => builder
                    .setName('points')
                    .setDescription('Points to add')
                    .setRequired(true)
                )
                .addUserOption(builder => builder
                    .setName('user')
                    .setDescription('The user to get the points for')
                    .setRequired(true)
                )
                .addStringOption(builder => builder
                    .setName('reason')
                    .setDescription('The reason for these points')
                    .setRequired(true)
                )
            )
            .toJSON()
    }

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!hasPermission(this.moduleConfig?.permissions, interaction.member as GuildMember, PermissionFlagsBits.ManageGuild)) {
            throw new Error('You dont have permission to use this command')
        }

        await interaction.deferReply()

        const subcommand = interaction.options.getSubcommand()

        if (subcommand == 'import') {
            const message = await interaction.channel?.messages.fetch({ message: interaction.options.getString('messageid', true), force: true })
            const attachment = message?.attachments.first()
            if (!attachment) {
                throw new Error('no attachment in message')
            }

            await interaction.editReply('Fetching attachment')
            const response = await fetch(attachment.url)
            if (!response.ok) {
                throw new Error(`Unable to fetch attachment (${response.status})`)
            }
            const file = await response.text()
            
            await interaction.editReply('Importing points')
            const lines = file.toString().split('\n')
            console.log(message?.attachments)
            for (const row of lines) {
                const columns = row.split(',')
                const user = await discordBot.client.users.fetch(columns[0])

                await discordBot.pointsManager.addPointsToUser(
                    user,
                    Number(columns[1]),
                    `Imported from [CSV](<${message?.url}>)`,
                    interaction.user,
                )
            }
            await interaction.editReply('Imported all points')
            return
        }

        if (subcommand == 'list') {
            const page = interaction.options.getNumber('page') ?? 1
            const limit = 50
            const { entries, total } = discordBot.pointsManager.getPointsPage(page, limit)
            await interaction.editReply({
                embeds: [{
                    title: 'Points list',
                    description: stripIndent`
                    ${total == 0 ? 'No Points' : ''}${entries.map(({ userId, amount }) => `<@${userId}>: ${amount}`).join('\n')}
                    `,
                    footer: {
                        text: `Page ${page} of ${Math.ceil(total/limit)} (${total})`
                    }
                }]
            })
            return
        }

        const user = interaction.options.getUser('user', true)
        if (subcommand == 'clean') {
            await discordBot.pointsManager.removeAllPointsForUser(user, interaction.user)
            await interaction.editReply(`Cleaned <@${user.id}>`)
            return
        }

        if (subcommand == 'add') {
            await discordBot.pointsManager.addPointsToUser(
                user,
                interaction.options.getNumber('points', true),
                interaction.options.getString('reason', true),
                interaction.user,
            )
        }

        const points = discordBot.pointsManager.getPointsForUser(user)

        await interaction.editReply({
            embeds: [{
                description: stripIndent`
                Points for <@${user.id}>: ${points?.amount ?? 0}

                **Point History**
                ${points?.history.map(entry => `[${entry.amount}] <@${entry.assigner}> ${entry.reason}`).join('\n') ?? 'No History' }
                `
            }]
        })
    }

}