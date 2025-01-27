import { BlueskyDiscordBot } from "./discord/client.ts";
import { env } from "./utils/env.ts";

const bot = new BlueskyDiscordBot({
    bskyService: env.XRPC_ADDRESS,
    discordToken: env.DISCORD_TOKEN,
});

bot.initialise();
