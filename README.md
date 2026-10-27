# paperback-selfhelp-bot

The code for the Tasukete bot on the Paperback discord server.

The interaction data can be found on the [Paperback-iOS/paperback-selfhelp-bot-interactions](https://github.com/Paperback-iOS/paperback-selfhelp-bot-interactions) repository.

## Running

Requires Node.js 24+.

```bash
npm install
npm run build
npm start
```

Data is stored in SQLite at `db/bot.sqlite`.

The bot needs the **Message Content** privileged intent enabled in the Discord developer portal.

## Migrating from the msgpack document store

Older versions stored data as msgpack files under `db/users`, `db/botSettings` and `db/moderationQueue`. To import them into SQLite once:

1. Stop the bot.
2. `npm run build`
3. `npm run migrate-db` (pass `-- --force` to overwrite an existing `db/bot.sqlite`)
4. Start the bot.

The old folders are left untouched and can be deleted once the import is confirmed.

## Compromised-account spam detection

Times out members who post across many channels in a short time (the usual pattern of hijacked accounts), deletes those messages, DMs the user, and posts an alert with **Remove Timeout** / **Ban** buttons. Flags are stored in the `spam_flags` table.

Enable it in the live config (`config.yaml`) under the moderation module. All values except `enabled` are optional; the defaults are shown:

```yaml
modules:
  moderation:
    enabled: true
    loggingChannel: "<channel id>"
    spamDetection:
      enabled: true
      windowSeconds: 30
      duplicateChannelThreshold: 3   # same message/image in N channels
      mediaChannelThreshold: 3       # links or attachments in N channels
      channelThreshold: 5            # any messages in N channels
      timeoutDuration: 1 day         # max 28 days
      deleteMessages: true
      notifyUser: true
      alertChannel: "<channel id>"   # defaults to loggingChannel
      alertRole: "<role id>"         # pinged on each alert
      exemptRoles: []
      ignoredChannels: []
```

Members with Manage Messages are always exempt. The bot needs the **Timeout Members**, **Manage Messages** and **Ban Members** permissions, and its role must be above the members it times out.
