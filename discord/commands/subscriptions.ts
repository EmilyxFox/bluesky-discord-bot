import type { Command } from "$types/command.ts";
import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
import type { BlueskyDiscordBot } from "../client.ts";
import type { ChannelSubscription } from "$types/database.ts";

export class SubscriptionsCommand implements Command {
	data = new SlashCommandBuilder()
		.setName("subscriptions")
		.setDescription("See all the current subscriptions for this channel");

	async run(
		interaction: ChatInputCommandInteraction,
		botClient: BlueskyDiscordBot,
	): Promise<unknown> {
		const channelId = interaction.channelId;
		const subscriptions = botClient.db.sql`
            SELECT * FROM channel_subscriptions
            WHERE discord_channel_id = ${channelId}
        ` as unknown as ChannelSubscription[];

		let replyMessage = "";
		for (const subscription of subscriptions) {
			const { data: profile } = await botClient.bskyAgent.getProfile({
				actor: subscription.did,
			});
			replyMessage += `@${profile.handle}\n`;
		}

		return await interaction.reply(replyMessage);
	}
}
