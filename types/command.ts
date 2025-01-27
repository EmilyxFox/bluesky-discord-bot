import type { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from "discord.js";
import type { BlueskyDiscordBot } from "../discord/client.ts";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;

  run(
    interaction: ChatInputCommandInteraction,
    botClient: BlueskyDiscordBot,
  ): Promise<unknown>;
}
