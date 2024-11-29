import {
	type ChatInputCommandInteraction,
	SlashCommandBuilder,
} from "discord.js";
import type { Command } from "$types/command.ts";
import type { BlueskyDiscordBot } from "../client.ts";

export class TrackCommand implements Command {
	data = new SlashCommandBuilder()
		.setName("track")
		.setDescription("Track a Bluesky account in this channel.")
		.addStringOption(
			(op) =>
				op
					.setName("didorhandle")
					.setDescription("A Decentralized Identifier or Bluesky handle")
					.setRequired(true),
			// .setMaxLength(32) DID length is 32
		)
		.addBooleanOption((op) =>
			op
				.setName("toplevel")
				.setDescription("Whether to track top level posts (Default true)"),
		)
		.addBooleanOption((op) =>
			op
				.setName("replies")
				.setDescription("Whether to track replies (Default false)"),
		)
		.addBooleanOption((op) =>
			op
				.setName("reposts")
				.setDescription("Whether to track reposts (Default false)"),
		);

	async run(
		interaction: ChatInputCommandInteraction,
		botClient: BlueskyDiscordBot,
	): Promise<unknown> {
		let didorhandle = interaction.options.getString("didorhandle");
		if (!didorhandle)
			return await interaction.reply("Error getting DID or handle.");
		const toplevel = interaction.options.getBoolean("toplevel") ?? true;
		const replies = interaction.options.getBoolean("replies") ?? false;
		const reposts = interaction.options.getBoolean("reposts") ?? false;

		const didRegex = /^did:plc:[a-z0-9]{24}$/;
		const handleRegex = /^@?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

		let replyMessage = "";

		console.log(`Got didorhandle: ${didorhandle}`);

		if (didRegex.test(didorhandle)) {
			replyMessage += "This seems like a DID string";
		} else if (handleRegex.test(didorhandle)) {
			replyMessage += "This seems like a handle string";
			if (didorhandle.charAt(0) === "@") didorhandle = didorhandle.substring(1);
			console.log("Cut @ off the start");
		} else {
			return await interaction.reply(
				"The string provided doesn't seem to be either a DID or a handle.\n-# If you think this error is wrong please contact the developer.",
			);
		}

		try {
			console.log("Finding bluesky account...");
			const { data } = await botClient.bskyAgent.getProfile({
				actor: didorhandle,
			});

			replyMessage += `\n\nFound user...\nHandle: ${data.handle}\nDID: ${data.did}`;

			try {
				console.log("Adding did to tracked_accounts...");
				botClient.db.sql`
                    INSERT INTO tracked_accounts (did) VALUES (${data.did})
                `;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("UNIQUE constraint failed")
				) {
					console.log("Account was already in tracked_accounts");
					return await interaction.reply(
						"This user is already in the database.",
					);
				}
			}
		} catch (_error) {
			return await interaction.reply(
				"There was an error finding this Bluesky user.\n-# If you think this error is wrong please contact the developer.",
			);
		}

		return await interaction.reply(replyMessage);
	}
}
