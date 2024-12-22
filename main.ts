import { BlueskyDiscordBot } from "./discord/client.ts";

const token = Deno.env.get("DISCORD_TOKEN");

const api = Deno.env.get("SERVICE_API") || "https://public.api.bsky.app/xrpc";

if (!token) {
	throw new Error('No discord token provided. Please set ENV "DISCORD_TOKEN"');
}
const bot = new BlueskyDiscordBot({
	bskyService: api,
	discordToken: token,
});

bot.initialise();
