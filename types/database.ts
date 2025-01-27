export type TrackedAccount = {
  did: string;
  last_checked_at: string;
};

export type ChannelSubscription = {
  did: string;
  discord_channel_id: string;
  track_top_level: number;
  track_replies: number;
  track_reposts: number;
};

export type ProcessedPost = {
  post_uri: string;
  did: string;
  post_type: string;
  processed_at: string;
};
