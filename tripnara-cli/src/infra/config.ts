import dotenv from "dotenv";

dotenv.config();

export interface CliConfig {
  debug: boolean;
  llmProvider: string;
  apiBase?: string;
  apiToken?: string;
}

export function getConfig(): CliConfig {
  return {
    debug: process.env.TRIPNARA_DEBUG === "1",
    llmProvider: process.env.TRIPNARA_LLM_PROVIDER || "mock",
    apiBase: process.env.TRIPNARA_API_BASE,
    apiToken: process.env.TRIPNARA_API_TOKEN,
  };
}
