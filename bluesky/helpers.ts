import { type AppBskyFeedDefs, AppBskyFeedPost, RichText } from "@atproto/api";
import type { BlueskyDiscordBot } from "../discord/client.ts";

export const processPostText = (post: AppBskyFeedDefs.PostView): string => {
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
			if (segment.text === segment.link?.uri) {
				processedText += segment.text;
			} else {
				processedText += `[${segment.text}](${segment.link?.uri})`;
			}
		} else if (segment.isMention()) {
			processedText += `[${segment.text}](https://bsky.app/profile/${segment.mention?.did})`;
		} else if (segment.isTag()) {
			processedText += `[${segment.text}](https://bsky.app/hashtag/${segment.tag?.tag})`;
		} else {
			processedText += segment.text;
		}
	}
	return processedText;
};

export const getBlueskyPostLink = (post: AppBskyFeedDefs.PostView): string => {
	const uriParts = post.uri.split("/");
	const handle = post.author.handle;
	const rkey = uriParts[uriParts.length - 1];

	return `https://bsky.app/profile/${handle}/post/${rkey}`;
};

export const didOrHandleToBlueskyAccount = async (
	didorhandle: string,
	botClient: BlueskyDiscordBot,
) => {
	if (!didorhandle) throw new Error("No DID or handle provided.");

	let localDidOrHandle = didorhandle;

	const didRegex = /^did:plc:[a-z0-9]{24}$/;
	const handleRegex = /^@?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

	console.log(`Got didorhandle: ${didorhandle}`);

	if (didRegex.test(localDidOrHandle)) {
		console.log(`didorhandle: "${localDidOrHandle}" seems like a DID.`);
	} else if (handleRegex.test(didorhandle)) {
		console.log(`didorhandle: "${didorhandle}" seems like a handle.`);
		if (didorhandle.charAt(0) === "@") {
			console.log("Cut @ off the start");
			localDidOrHandle = didorhandle.substring(1);
		} else {
			localDidOrHandle = didorhandle;
		}
	} else {
		throw new Error("String isn't DID or handle");
	}

	console.log("Finding Bluesky account...");
	const { data } = await botClient.bskyAgent.getProfile({
		actor: localDidOrHandle,
	});

	return data;
};
