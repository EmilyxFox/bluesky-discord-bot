import { type AppBskyFeedDefs, AppBskyFeedPost, RichText } from "@atproto/api";

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
			processedText += `[${segment.text}](${segment.link?.uri})`;
		} else if (segment.isMention()) {
			processedText += `[${segment.text}](https://bsky.app/profile/${segment.mention?.did})`;
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
