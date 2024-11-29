export type TrackedAccounts = {
	did: string;
	last_checked_at: string;
};

export type ChannelSubscriptions = {
	did: string;
	discord_channel_id: string;
	track_top_level: number;
	track_replies: number;
	track_reposts: number;
};

export type ProcessedPosts = {
	post_uri: string;
	did: string;
	post_type: string;
	processed_at: string;
};
