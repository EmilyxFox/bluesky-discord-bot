import type { Command } from "$types/command.ts";
import { type ChatInputCommandInteraction, REST, Routes } from "discord.js";
import { TrackCommand } from "./commands/track.ts";
import type { BlueskyDiscordBot } from "./client.ts";
import { SubscriptionsCommand } from "./commands/subscriptions.ts";

export class CommandHandler {
	private commands: Command[];
	private discordREST: REST;
	private clientId: string;
	private guildId: string;

	constructor(token: string) {
		if (!token)
			throw new Error("Invalid Discord token when registering commands");

		this.commands = [new TrackCommand(), new SubscriptionsCommand()];
		this.discordREST = new REST().setToken(token);

		const clientId = Deno.env.get("CLIENT_ID");
		const guildId = Deno.env.get("GUILD_ID");
		if (guildId && clientId) {
			this.clientId = clientId;
			this.guildId = guildId;
		} else {
			throw new Error("Invalid client or guild ID");
		}
	}

	getSlashCommands() {
		return this.commands.map((command: Command) => command.data.toJSON());
	}

	registerCommands() {
		const commands = this.getSlashCommands();
		this.discordREST
			.put(Routes.applicationCommands(this.clientId), {
				body: commands,
			})
			.then((data) => {
				console.log(
					`Successfully registered ${data.length} global application commands`,
				);
			})
			.catch((err) => {
				console.error("Error registering application (/) commands", err);
			});
	}

	async handleCommand(
		interaction: ChatInputCommandInteraction,
		botClient: BlueskyDiscordBot,
	) {
		const commandName = interaction.commandName;

		const matchedCommand = this.commands.find(
			(command) => command.data.name === commandName,
		);

		if (!matchedCommand) return Promise.reject("Command not found");

		await matchedCommand
			.run(interaction, botClient)
			.then(() => {
				console.log(
					`Sucesfully executed command [/${interaction.commandName}]`,
					{
						guild: { id: interaction.guildId },
						user: { name: interaction.user.globalName },
					},
				);
			})
			.catch((err) => {
				console.log(
					`Error executing command [/${interaction.commandName}]: ${err}`,
					{
						guild: { id: interaction.guildId },
						user: { name: interaction.user.globalName },
					},
				);
			});
	}
}
