import {
	Client,
	Collection,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
} from "discord.js";
import { AppBskyFeedPost, AtpAgent, type AppBskyFeedDefs } from "@atproto/api";
import { Database } from "@db/sqlite";
import { getBlueskyPostLink, processPostText } from "../bluesky/helpers.ts";
import { CommandHandler } from "./commandHandler.ts";
import type { TrackedAccounts } from "$types/database.ts";

type ClientConfig = {
	bskyService: string;
	discordToken: string;
	trackedUser: string;
	channelId: string;
};

export class BlueskyDiscordBot {
	discordClient: Client<boolean>;
	bskyAgent: AtpAgent;
	config: ClientConfig;
	db: Database;
	commands: Collection<unknown, unknown>;
	commandHandler: CommandHandler;
	constructor(config: ClientConfig) {
		this.config = config;
		this.discordClient = new Client({
			intents: [GatewayIntentBits.Guilds],
		});
		this.commands = new Collection();

		this.bskyAgent = new AtpAgent({ service: config.bskyService });

		this.db = new Database("./database/store.db");
		this.initialiseDatabase();

		this.commandHandler = new CommandHandler(this.config.discordToken);

		this.setupEventListeners();
	}

	async initialise(): Promise<void> {
		this.commandHandler.registerCommands();
		await this.discordClient.login(this.config.discordToken);

		this.discordClient.on(Events.InteractionCreate, (interaction) => {
			if (interaction.isChatInputCommand())
				this.commandHandler.handleCommand(interaction, this);
		});
	}

	private initialiseDatabase(): void {
		this.db.exec(`
CREATE TABLE IF NOT EXISTS tracked_accounts (
                did TEXT PRIMARY KEY,
                last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS channel_subscriptions (
                did TEXT,
                discord_channel_id TEXT,
                track_top_level BOOLEAN DEFAULT 1,
                track_replies BOOLEAN DEFAULT 0,
                track_reposts BOOLEAN DEFAULT 0,
                PRIMARY KEY (did, discord_channel_id),
                FOREIGN KEY (did) REFERENCES tracked_accounts(did)
            );

            CREATE TABLE IF NOT EXISTS processed_posts (
                post_uri TEXT PRIMARY KEY,
                did TEXT,
                post_type TEXT NOT NULL,
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (did) REFERENCES tracked_accounts(did)
            );
            `);
	}

	private setupEventListeners(): void {
		this.discordClient.once("ready", () => {
			console.log(`Logged in as ${this.discordClient.user?.tag}`);

			this.pollBlueskyAccounts();
			Deno.cron("bskyPolling", { minute: { every: 1 } }, () => {
				this.pollBlueskyAccounts();
			});
		});
	}

	private getTrackedAccounts(): Omit<TrackedAccounts, "last_checked_at">[] {
		const trackedAccounts = this.db.sql`
            SELECT did FROM tracked_accounts
        ` as Omit<TrackedAccounts, "last_checked_at">[];
		return trackedAccounts;
	}

	private async pollBlueskyAccounts() {
		const accounts = this.getTrackedAccounts();
		console.log(accounts);

		for (const account of accounts) {
			try {
				const { data } = await this.bskyAgent.getAuthorFeed({
					actor: account.did,
					limit: 5,
					filter: "posts_no_replies",
				});

				if (data.feed.length > 0) {
					const firstPost = data.feed[0].post;
					const indexedAt = new Date(firstPost.indexedAt);

					this.updateLastChecked(account, indexedAt);

					for (const feedItem of data.feed) {
						this.processAndNotifyPost(feedItem);
					}
				} else {
					console.log(`Data feed for ${account.did} less than 0.`);
				}
			} catch (error) {
				console.log(`Error polling account ${account.did}:`, error);
			}
		}
	}

	private processAndNotifyPost(feedItem: AppBskyFeedDefs.FeedViewPost) {
		let authorOrReposter: string;
		let postType: "top_level" | "reply" | "repost";
		if (feedItem.reason?.$type === "app.bsky.feed.defs#reasonRepost") {
			authorOrReposter = feedItem.reason.by.did as string;
			postType = "repost";
		} else {
			authorOrReposter = feedItem.post.author.did;
			postType = feedItem.reply ? "reply" : "top_level";
		}
		try {
			const dbResp = this.db.sql`
                SELECT * FROM processed_posts WHERE post_uri = ${feedItem.post.uri}
            `;
			if (dbResp.length === 0) {
				const _dbResp = this.db.sql`
                    INSERT INTO processed_posts (post_uri, did, post_type) VALUES 
                    (${feedItem.post.uri}, ${authorOrReposter}, ${postType})
                `;
				this.sendDiscordNotification(feedItem.post);
				// TODO: add culling of oldest posts over 100
			}
		} catch (error) {
			console.log(error);
		}
	}

	private updateLastChecked(account: { did: string }, time: Date) {
		const sqliteDate = time.toISOString();
		this.db.sql`
            UPDATE tracked_accounts SET last_checked_at = ${sqliteDate} WHERE did = ${account.did} 
        `;
	}

	private async sendDiscordNotification(
		post: AppBskyFeedDefs.PostView,
	): Promise<void> {
		try {
			const channelId = this.config.channelId;
			const channel = this.discordClient.channels.cache.get(channelId);
			if (!channel) {
				throw new Error("Channel not found");
			}
			if (!channel.isTextBased()) {
				throw new Error("Channel is not text based");
			}

			if (!AppBskyFeedPost.isRecord(post.record)) {
				throw new Error("Post is not record");
			}
			const postText = processPostText(post);

			const postLink = getBlueskyPostLink(post);

			const embed = new EmbedBuilder()
				.setColor("#1da1f2")
				.setAuthor({
					name: post.author.displayName || post.author.handle,
					iconURL: post.author.avatar,
				})
				.setDescription(`${postText}\n\n[Open on bksy.app](${postLink})`)
				.setTimestamp(new Date(post.indexedAt))
				.setFooter({
					text: "New Bluesky Post",
				});

			if (channel.isSendable()) {
				await channel.send({ embeds: [embed] });
			}
		} catch (error) {
			console.error("Error sending Discord notification:", error);
		}
	}
}
