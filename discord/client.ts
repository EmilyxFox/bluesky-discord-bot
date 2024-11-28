import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import {
	AppBskyFeedPost,
	AtpAgent,
	RichText,
	type AppBskyFeedDefs,
} from "@atproto/api";

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
	trackedUser: string;
	lastCheckedTimestamp: number | null;
	processedPostUris: Set<unknown>;
	constructor(config: ClientConfig) {
		this.config = config;
		this.discordClient = new Client({
			intents: [GatewayIntentBits.Guilds],
		});

		this.bskyAgent = new AtpAgent({ service: config.bskyService });

		this.trackedUser = config.trackedUser;
		this.lastCheckedTimestamp = null;
		this.processedPostUris = new Set();

		this.setupEventListeners();
	}

	async initialise(): Promise<void> {
		await this.discordClient.login(this.config.discordToken);

		await this.fetchInitialPosts();
	}

	private setupEventListeners(): void {
		this.discordClient.once("ready", () => {
			console.log(`Logged in as ${this.discordClient.user?.tag}`);

			setInterval(() => this.checkForNewPosts(), 60 * 1000);
		});
	}

	private async fetchInitialPosts(): Promise<void> {
		try {
			console.log("Getting author feed...");
			const { data } = await this.bskyAgent.getAuthorFeed({
				actor: this.trackedUser,
				limit: 5,
			});

			if (data.feed.length > 0) {
				const firstPost = data.feed[0].post;
				console.log("First post");
				console.log(firstPost);

				this.lastCheckedTimestamp = new Date(firstPost.indexedAt).getTime();
				console.log(
					"Last checked timestamp:",
					new Date(this.lastCheckedTimestamp).toUTCString(),
				);

				for (const feedItem of data.feed) {
					const post = feedItem.post;
					this.processedPostUris.add(post.uri);
				}
			} else {
				console.log("Data feed less than 0");
			}
		} catch (error) {
			console.error("Error fetching initial posts:", error);
		}
	}

	private async checkForNewPosts(): Promise<void> {
		try {
			console.log("Getting author feed...");
			const { data } = await this.bskyAgent.getAuthorFeed({
				actor: this.trackedUser,
				limit: 10,
			});

			console.log("Filtering posts...");
			const newPosts = data.feed.filter((feedItem) => {
				const post = feedItem.post;
				const postTimestamp = new Date(post.indexedAt).getTime();
				const isNewPost =
					postTimestamp > (this.lastCheckedTimestamp || 0) &&
					!this.processedPostUris.has(post.uri);

				if (isNewPost) {
					console.log(`Post ${post.cid} is new`);
				} else {
					console.log(`Post ${post.cid} is old`);
				}
				return isNewPost;
			});

			newPosts.sort((a, b) => {
				const postA = a.post;
				const postB = b.post;
				return (
					new Date(postA.indexedAt).getTime() -
					new Date(postB.indexedAt).getTime()
				);
			});

			for (const feedItem of newPosts) {
				const post = feedItem.post;
				await this.sendDiscordNotification(post);

				this.processedPostUris.add(post.uri);
			}

			if (newPosts.length > 0) {
				const latestPost = data.feed[0].post;
				this.lastCheckedTimestamp = new Date(latestPost.indexedAt).getTime();
			}

			if (this.processedPostUris.size > 100) {
				const oldestPosts = Array.from(this.processedPostUris).slice(
					0,
					this.processedPostUris.size - 100,
				);
				for (const uri of oldestPosts) {
					this.processedPostUris.delete(uri);
				}
			}
		} catch (error) {
			console.error("Error checking for new posts:", error);
		}
	}

	private processPostText(post: AppBskyFeedDefs.PostView): string {
		if (!AppBskyFeedPost.isRecord(post.record)) {
			throw new Error("Post is not record");
		}

		if (!post.record.facets || post.record.facets.length === 0)
			return post.record.text;

		const rt = new RichText({
			text: post.record.text,
			facets: post.record.facets,
		});

		let processedText = "";
		for (const segment of rt.segments()) {
			if (segment.isLink()) {
				processedText += `[${segment.text}](${segment.link?.uri})`;
			} else if (segment.isMention()) {
				processedText += `[${segment.text}](https://bsky.app/profile/${segment.mention?.did})`;
			} else {
				processedText += segment.text;
			}
		}
		return processedText;
	}

	private getBlueskyPostLink(post: AppBskyFeedDefs.PostView): string {
		// Extract the handle and post's rkey from the URI
		const uriParts = post.uri.split("/");
		const handle = post.author.handle;
		const rkey = uriParts[uriParts.length - 1];

		return `https://bsky.app/profile/${handle}/post/${rkey}`;
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

			// Extract post text
			if (!AppBskyFeedPost.isRecord(post.record)) {
				throw new Error("Post is not record");
			}
			const postText = this.processPostText(post);

			const postLink = this.getBlueskyPostLink(post);

			// Construct embed or message
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
