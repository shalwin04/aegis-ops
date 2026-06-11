import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const configSchema = z.object({
  // Splunk
  splunk: z.object({
    mode: z.enum(["live", "mock"]).default("mock"),
    mcpEndpoint: z.string().optional(),
    token: z.string().optional(),
    index: z.string().default("aegis"),
  }),

  // Anthropic
  anthropic: z.object({
    apiKey: z.string(),
    model: z.string().default("claude-sonnet-4-20250514"),
  }),

  // Server
  server: z.object({
    port: z.number().default(3001),
    corsOrigins: z.array(z.string()).default(["http://localhost:5173"]),
  }),

  // Features
  features: z.object({
    autoExecute: z.boolean().default(false),
    verboseLogging: z.boolean().default(true),
    memoryLookback: z.number().default(10),
  }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const raw = {
    splunk: {
      mode: process.env.SPLUNK_MODE || "mock",
      mcpEndpoint: process.env.SPLUNK_MCP_ENDPOINT,
      token: process.env.SPLUNK_TOKEN,
      index: process.env.SPLUNK_INDEX || "aegis",
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    },
    server: {
      port: parseInt(process.env.API_PORT || "3001", 10),
      corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173").split(","),
    },
    features: {
      autoExecute: process.env.AUTO_EXECUTE === "true",
      verboseLogging: process.env.VERBOSE_LOGGING !== "false",
      memoryLookback: parseInt(process.env.MEMORY_LOOKBACK || "10", 10),
    },
  };

  return configSchema.parse(raw);
}

export const config = loadConfig();
