import type { ChatFunctionDef, ChatMessage, ChatProvider, ChatTurn, ToolCall } from "./types";

// One implementation covers every backend that speaks the OpenAI
// chat-completions dialect with function calling — which is both of ours:
//   • Ollama (local dev):  http://localhost:11434/v1
//   • Gemini (hosted):     https://generativelanguage.googleapis.com/v1beta/openai
// Plain fetch, no SDK: the request/response subset used here is small and
// stable, and it keeps the provider swap a pure config change.

type WireMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

export class OpenAICompatProvider implements ChatProvider {
  constructor(
    private readonly cfg: { baseUrl: string; model: string; apiKey?: string },
  ) {}

  async chat(messages: ChatMessage[], tools: ChatFunctionDef[]): Promise<ChatTurn> {
    const wire: WireMessage[] = messages.map((m) => {
      if (m.role === "assistant") {
        return {
          role: "assistant",
          content: m.content,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
                })),
              }
            : {}),
        };
      }
      if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
      return { role: m.role, content: m.content };
    });

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: wire,
        // An empty tools array is rejected by some backends — omit instead.
        ...(tools.length ? { tools, tool_choice: "auto" } : {}),
        // Tool selection wants determinism, not creativity — especially on the
        // small local models this loop is validated against.
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Chat backend error ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
      }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error("Chat backend returned no choices.");

    if (msg.tool_calls?.length) {
      const calls: ToolCall[] = msg.tool_calls.map((c, i) => {
        let args: unknown = {};
        try {
          args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
        } catch {
          // Malformed JSON from a weak model → let schema validation produce a
          // readable error the model can react to, instead of crashing the turn.
          args = {};
        }
        return { id: c.id ?? `call_${i}`, name: c.function?.name ?? "", arguments: args };
      });
      return { type: "tool_calls", calls };
    }

    return { type: "message", content: msg.content ?? "" };
  }
}
