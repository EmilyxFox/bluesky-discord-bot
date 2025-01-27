import { z } from "npm:zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string(),
  CLIENT_ID: z.string(),
  XRPC_ADDRESS: z
    .string()
    .url()
    .optional()
    .default("https://public.api.bsky.app/xrpc"),
});

export const env = envSchema.parse(Deno.env.toObject());
