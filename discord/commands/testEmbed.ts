import type { Command } from "$types/command.ts";
import {
	type ChatInputCommandInteraction,
	EmbedBuilder,
	SlashCommandBuilder,
} from "discord.js";
import type { BlueskyDiscordBot } from "../client.ts";

export class TestEmbedCommand implements Command {
	data = new SlashCommandBuilder()
		.setName("testembed")
		.setDescription("Test Embed");

	async run(
		interaction: ChatInputCommandInteraction,
		_botClient: BlueskyDiscordBot,
	): Promise<unknown> {
		const embed = new EmbedBuilder()
			.setColor("#1da1f2")
			.setTimestamp(new Date())
			.setDescription(`
                ### [The Kyiv Independent](https://example.com/)
                ⚡️Russia loses almost 46,000 troops, over $3 billion worth of military equipment in November, Defense Ministry says.

In the previous month, the Russian military lost 2,030 soldiers in one day, which is the highest rate of Russian losses in a day since Feb. 24, 2022.`)
			.setAuthor({
				name: "Anders Puck Nielsen",
				iconURL:
					"https://images-ext-1.discordapp.net/external/-XHin3Ee7iIaZwdCZ0UmO5LnD24h6Gc1VFOzeF4zADw/https/cdn.bsky.app/img/avatar/plain/did%3Aplc%3Ahewxr27p6lkudlzb3p4gkie3/bafkreiejt53uxxydvgyej3wuis3gqz7lwmsywxsoq3sf3tfvrffqzrfnua%40jpeg",
				url: "https://bsky.app/profile/did:plc:hewxr27p6lkudlzb3p4gkie3",
			});

		return await interaction.reply({ embeds: [embed] });
	}
}
