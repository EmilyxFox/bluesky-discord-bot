import type { Command } from "$types/command.ts";
import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { BlueskyDiscordBot } from "../client.ts";
import type { ChannelSubscription } from "$types/database.ts";
import { didOrHandleToBlueskyAccount } from "../../bluesky/helpers.ts";

export class SubscriptionsCommand implements Command {
	data = new SlashCommandBuilder()
		.setName("subscriptions")
		.setDescription("Inspect and manage subscriptions in the current chanenl.")
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
		.addSubcommand((sub) =>
			sub
				.setName("list")
				.setDescription("List all the current subscriptions in this channel."),
		)
		.addSubcommand((sub) =>
			sub
				.setName("add")
				.setDescription("Add a new subscription in the current channel.")
				.addStringOption((op) =>
					op
						.setName("account")
						.setDescription(
							"A DID (Decentralised Identification) or Bluesky handle.",
						)
						.setRequired(true),
				)
				.addBooleanOption((op) =>
					op
						.setName("toplevel")
						.setDescription("Whether to track top level posts (Default: true)"),
				)
				.addBooleanOption((op) =>
					op
						.setName("replies")
						.setDescription("Whether to track replies (Default: false)"),
				)
				.addBooleanOption((op) =>
					op
						.setName("reposts")
						.setDescription("Whether to track reposts (Default: false)"),
				),
		)
		.addSubcommand((sub) =>
			sub
				//TODO: add feature to enable autocomplete
				.setName("remove")
				.setDescription("Remove a subscription in the current channel.")
				.addStringOption((op) =>
					op
						.setName("account")
						.setDescription(
							"A DID (Decentralised Identification) or Bluesky handle.",
						)
						.setRequired(true),
				),
		);

	async run(
		interaction: ChatInputCommandInteraction,
		botClient: BlueskyDiscordBot,
	): Promise<unknown> {
		// TODO: add permissions checking
		const channelId = interaction.channelId;
		switch (interaction.options.getSubcommand()) {
			case "list": {
				if (
					!interaction.channel?.isSendable() &&
					interaction.channel?.isTextBased()
				) {
					return console.log("Command run in non-sendable channel.");
				}
				if (interaction.channel?.isDMBased()) {
					return interaction.reply(
						"This command is not available in direct messages.",
					);
				}
				const subscriptions = botClient.db.sql`
                    SELECT * FROM channel_subscriptions
                    WHERE discord_channel_id = ${channelId}
                ` as unknown as ChannelSubscription[];

				const dids = subscriptions.map((subscription) => subscription.did);

				let replyMessage = "";

				const embed = new EmbedBuilder()
					.setColor("#1da1f2")
					.setTimestamp(new Date())
					.setFooter({
						text: "List",
					});

				if (dids.length <= 0) {
					embed.setDescription("No active subscriptions.");
					return await interaction.reply({ embeds: [embed] });
				}

				try {
					const { data } = await botClient.bskyAgent.getProfiles({
						actors: dids,
					});

					const profileMap = new Map(
						data.profiles.map((profile) => [profile.did, profile]),
					);

					replyMessage = subscriptions
						.map((subscription) => {
							const profile = profileMap.get(subscription.did);
							return profile ? `@${profile.handle}` : null;
						})
						.filter(Boolean)
						.join("\n");
				} catch (error) {
					console.error("Error fetching profiles:", error);
					replyMessage = "There was an error fetching profiles.";
				}

				embed.setDescription(replyMessage);

				return await interaction.reply({ embeds: [embed] });
			}
			case "add": {
				let didorhandle = interaction.options.getString("account");
				if (!didorhandle)
					return await interaction.reply("Error getting DID or handle.");
				const toplevel = interaction.options.getBoolean("toplevel") ?? true;
				const replies = interaction.options.getBoolean("replies") ?? false;
				const reposts = interaction.options.getBoolean("reposts") ?? false;

				const didRegex = /^did:plc:[a-z0-9]{24}$/;
				const handleRegex = /^@?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

				if (
					!interaction.channel?.isSendable() &&
					interaction.channel?.isTextBased()
				) {
					return console.log("Command run in non-sendable channel.");
				}
				if (interaction.channel?.isDMBased()) {
					return interaction.reply(
						"This command is not available in direct messages.",
					);
				}

				console.log(`Got didorhandle: ${didorhandle}`);

				if (didRegex.test(didorhandle)) {
					console.log(`didorhandle: "${didorhandle}" seems like a DID.`);
				} else if (handleRegex.test(didorhandle)) {
					console.log(`didorhandle: "${didorhandle}" seems like a handle.`);
					if (didorhandle.charAt(0) === "@")
						didorhandle = didorhandle.substring(1);
					console.log("Cut @ off the start");
				} else {
					return await interaction.reply({
						content:
							"The string provided doesn't seem to be either a DID or a handle.\n-# If you think this error is wrong please contact the developer.",
						flags: MessageFlags.Ephemeral,
					});
				}

				try {
					console.log("Finding Bluesky account...");
					const { data } = await botClient.bskyAgent.getProfile({
						actor: didorhandle,
					});

					const transaction = botClient.db.transaction(() => {
						const [existingAccount] = botClient.db.sql`
                            INSERT INTO tracked_accounts (did)
                            VALUES (${data.did})
                            ON CONFLICT (did) DO NOTHING
                            RETURNING *
                        `;

						if (existingAccount) {
							console.log("Account added to tracked_accounts");
						} else {
							console.log("This account is already tracked");
						}

						botClient.db.sql`
							    INSERT INTO channel_subscriptions
							    (did, discord_channel_id, track_top_level, track_replies, track_reposts)
							    VALUES (${data.did}, ${interaction.channelId}, ${toplevel}, ${replies}, ${reposts})
							`;

						console.log(
							`Started subscription for ${data.handle} (${data.did}) in ${interaction.channel?.id}`,
						);
					});
					transaction();
					await interaction.reply(`Added subscription for ${data.handle}!`);
				} catch (error) {
					if (error.message.includes("UNIQUE constraint")) {
						console.log(
							"A subscription for this account already exists in this channel.",
						);
						return await interaction.reply({
							content:
								"This Bluesky account is already subscribed to this channel.\n-# If you think this is an error, please contact the developer.",
							flags: MessageFlags.Ephemeral,
						});
					}
					console.log(error);
					return await interaction.reply({
						content:
							"An unknown error has occurred. Please contact the developer about this issue.",
						flags: MessageFlags.Ephemeral,
					});
				}
				break;
			}
			case "remove": {
				const didorhandle = interaction.options.getString("account");
				if (!didorhandle) {
					return interaction.reply(
						"No DID or handle provided.\n-# If you think this is an error, please contact the developer.",
					);
				}

				try {
					const blueskyAccount = await didOrHandleToBlueskyAccount(
						didorhandle,
						botClient,
					);

					const transaction = botClient.db.transaction(async () => {
						using stmt = botClient.db.prepare(`
                            DELETE FROM channel_subscriptions
                            WHERE discord_channel_id = ? AND did = ?
                        `);

						const deleteResult = stmt.run(
							interaction.channelId,
							blueskyAccount.did,
						);

						console.log(deleteResult);

						if (deleteResult === 0) {
							return await interaction.reply(
								"There is no active subscription to that account in this channel.\n-# If you think this is an error, please contact the developer.",
							);
						}

						const remainingSubscriptions = botClient.db.sql`
                        SELECT COUNT(*) as subscription_count
                        FROM channel_subscriptions
                        WHERE did = ${blueskyAccount.did}
                        `;

						if (remainingSubscriptions[0].subscription_count === 0) {
							botClient.db.sql`
                            DELETE FROM tracked_accounts
                            WHERE did = ${blueskyAccount.did}
                            `;
							console.log(
								`Unsubscribed did: ${blueskyAccount.did} from channel: ${interaction.channelId} and removed account from tracking.`,
							);
						}
						return await interaction.reply(
							`Unsubscribed from @${blueskyAccount.handle}'s posts.`,
						);
					});

					await transaction();
				} catch (error) {
					console.error("Error untracking Bluesky account:", error);
					return await interaction.reply(
						"An error occurred while unsubscribing.\n-# Please contact the developer.",
					);
				}
				break;
			}
			default:
				break;
		}
	}
}
