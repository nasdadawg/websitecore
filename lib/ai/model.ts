import { openai, createOpenAI } from "@ai-sdk/openai";
import { env, requireSecret } from "@/lib/env";

/**
 * Resolve the language model from `AI_MODEL` (e.g. "openai/gpt-4o-mini" or
 * "deepseek/deepseek-chat"). DeepSeek is OpenAI-compatible and configured via
 * a custom baseURL.
 */
export function getModel() {
  const [provider, ...rest] = env.AI_MODEL.split("/");
  const modelId = rest.join("/");

  if (provider === "deepseek") {
    const deepseek = createOpenAI({
      apiKey: requireSecret("DEEPSEEK_API_KEY", env.DEEPSEEK_API_KEY),
      baseURL: env.DEEPSEEK_BASE_URL,
    });
    return deepseek(modelId || "deepseek-chat");
  }

  return openai(modelId || "gpt-4o-mini");
}
