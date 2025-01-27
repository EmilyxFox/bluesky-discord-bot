import { Client, Collection, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";
import { AppBskyFeedDefs, AtpAgent } from "@atproto/api";
import { Database } from "@db/sqlite";
import { getBlueskyPostLink, processPostText } from "../bluesky/helpers.ts";
import { CommandHandler } from "./commandHandler.ts";
import type { ChannelSubscription, ProcessedPost, TrackedAccount } from "$types/database.ts";

type ClientConfig = {
  bskyService: string;
  discordToken: string;
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
      if (interaction.isChatInputCommand()) {
        this.commandHandler.handleCommand(interaction, this);
      }
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
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  private getTrackedAccounts(): Omit<TrackedAccount, "last_checked_at">[] {
    const trackedAccounts = this.db.sql<
      Omit<TrackedAccount, "last_checked_at">
    >`
            SELECT did FROM tracked_accounts
        `;
    return trackedAccounts;
  }

  private async pollBlueskyAccounts() {
    const accounts = this.getTrackedAccounts();

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
    if (AppBskyFeedDefs.isReasonRepost(feedItem.reason)) {
      authorOrReposter = feedItem.reason.by.did;
      postType = "repost";
    } else {
      authorOrReposter = feedItem.post.author.did;
      postType = feedItem.reply ? "reply" : "top_level";
    }
    try {
      const dbResp = this.db.sql<ProcessedPost>`
                SELECT * FROM processed_posts WHERE post_uri = ${feedItem.post.uri}
            `;
      if (dbResp.length === 0) {
        this.db.sql`
                    INSERT INTO processed_posts (post_uri, did, post_type) VALUES 
                    (${feedItem.post.uri}, ${authorOrReposter}, ${postType})
                `;
        // TODO: add culling of oldest posts over 100
        this.sendDiscordMessage(feedItem, authorOrReposter, postType);
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

  private async sendDiscordMessage(
    feedItem: AppBskyFeedDefs.FeedViewPost,
    actor: string,
    postType: "top_level" | "reply" | "repost",
  ): Promise<void> {
    try {
      const postTypeToColumnMap = {
        top_level: "track_top_level",
        reply: "track_replies",
        repost: "track_reposts",
      };

      const trackColumn = postTypeToColumnMap[postType];

      const rawQuery = `
                SELECT * FROM channel_subscriptions
                WHERE did = ? AND ${trackColumn} = 1
            `;

      const subscribedChannels = this.db
        .prepare(rawQuery)
        .all<ChannelSubscription>(actor);

      for (const subscribedChannel of subscribedChannels) {
        const channel = await this.discordClient.channels.fetch(
          subscribedChannel.discord_channel_id,
        );
        if (!channel) {
          throw new Error("Channel not found");
        }
        if (!channel.isTextBased()) {
          throw new Error("Channel is not text based");
        }
        if (!channel.isSendable()) {
          throw new Error("Channel is not sendable");
        }

        const postText = processPostText(feedItem.post);

        const postLink = getBlueskyPostLink(feedItem.post);

        const embed = new EmbedBuilder()
          .setColor("#1da1f2")
          .setTimestamp(new Date(feedItem.post.indexedAt))
          .setDescription(`${postText}\n\n[Open on bksy.app](${postLink})`);
        if (
          feedItem.post.embed?.$type === "app.bsky.embed.images#view" &&
          feedItem.post.embed.images
        ) {
          embed.setImage(feedItem.post.embed.images[0].fullsize);
        }
        switch (postType) {
          case "top_level":
            embed
              .setAuthor({
                name: feedItem.post.author.displayName ||
                  feedItem.post.author.handle,
                iconURL: feedItem.post.author.avatar,
                url: `https://bsky.app/profile/${feedItem.post.author.did}`,
              })
              .setFooter({
                text: "Post",
              });
            break;
          case "reply":
            embed
              .setAuthor({
                name: feedItem.post.author.displayName ||
                  feedItem.post.author.handle,
                iconURL: feedItem.post.author.avatar,
                url: `https://bsky.app/profile/${feedItem.post.author.did}`,
              })
              .setFooter({
                text: "Reply",
              });
            break;
          case "repost": {
            if (AppBskyFeedDefs.isReasonRepost(feedItem.reason)) {
              let title = "### ";
              title += `${
                feedItem.post.author.displayName ? `${feedItem.post.author.displayName} (@${feedItem.post.author.handle})` : `@${feedItem.post.author.handle}`
              }`;
              title += "\n";
              embed
                .setAuthor({
                  name: feedItem.reason?.by.displayName ||
                    feedItem.reason?.by.handle,
                  iconURL: feedItem.reason?.by.avatar,
                  url: `https://bsky.app/profile/${feedItem.reason?.by.did}`,
                })
                .setDescription(
                  `${title}${postText}\n\n[Open on bksy.app](${postLink})`,
                )
                .setFooter({
                  text: "Repost",
                });
            } else {
              throw new Error(
                "Attempted to send a repost message without valid repost reason.",
              );
            }
            break;
          }
          default:
            break;
        }
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.log("Error:", error);
    }
  }
}
