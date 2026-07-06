import { OpenAICompatProvider } from "./openaiCompat";
import type { ChatProvider } from "./types";

// Provider selection is an env switch — the whole point of the abstraction:
// validate tool-calling on a small local model first (if it holds up there, a
// hosted model like Gemini Flash will only do better), then flip
// AI_CHAT_PROVIDER=gemini in production without touching any code.
//
//   AI_CHAT_PROVIDER  "ollama" (default) | "gemini"
//   OLLAMA_BASE_URL   default http://localhost:11434
//   OLLAMA_MODEL      default qwen2.5:1.5b-instruct  (ollama pull qwen2.5:1.5b-instruct)
//   GEMINI_API_KEY    required for gemini
//   GEMINI_MODEL      default gemini-2.5-flash

export function getProvider(): ChatProvider {
  const kind = process.env.AI_CHAT_PROVIDER ?? "ollama";
  switch (kind) {
    case "ollama":
      return new OpenAICompatProvider({
        baseUrl: `${process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/v1`,
        model: process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b-instruct",
      });
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is required when AI_CHAT_PROVIDER=gemini");
      return new OpenAICompatProvider({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
        apiKey,
      });
    }
    default:
      throw new Error(`Unknown AI_CHAT_PROVIDER: ${kind}`);
  }
}
