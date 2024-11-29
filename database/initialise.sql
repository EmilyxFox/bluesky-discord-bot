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
                post_type TEXT NOT NULL, --top_level, reply, repost
                processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (did) REFERENCES tracked_accounts(did)
            );