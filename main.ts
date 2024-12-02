import { BlueskyDiscordBot } from "./discord/client.ts";

const bot = new BlueskyDiscordBot({
	bskyService: "https://public.api.bsky.app/xrpc",
	// biome-ignore lint/style/noNonNullAssertion: <explanation>
	discordToken: Deno.env.get("DISCORD_TOKEN")!,
	trackedUser: "auonsson.bsky.social",
});

bot.initialise();
