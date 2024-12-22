import { BlueskyDiscordBot } from "./discord/client.ts";

const token = Deno.env.get("DISCORD_TOKEN");

if (!token) {
	throw new Error('No discord token provided. Please set ENV "DISCORD_TOKEN"');
}
const bot = new BlueskyDiscordBot({
	bskyService: "https://public.api.bsky.app/xrpc",
	discordToken: token,
});

bot.initialise();
