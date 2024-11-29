import type {
	ChatInputCommandInteraction,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import type { BlueskyDiscordBot } from "../discord/client.ts";

export interface Command {
	data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;

	run(
		interaction: ChatInputCommandInteraction,
		botClient: BlueskyDiscordBot,
	): Promise<unknown>;
}
