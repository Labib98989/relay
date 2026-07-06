import type { ChatFunctionDef } from "@/lib/ai/registry";

// The narrow surface the chat loop needs from any LLM backend. One turn in,
// either a final message or a batch of tool calls out — the loop in
// /api/dashboard-chat owns iteration, limits, and tool execution.

export type ToolCall = { id: string; name: string; arguments: unknown };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type ChatTurn =
  | { type: "message"; content: string }
  | { type: "tool_calls"; calls: ToolCall[] };

export interface ChatProvider {
  chat(messages: ChatMessage[], tools: ChatFunctionDef[]): Promise<ChatTurn>;
}

export type { ChatFunctionDef };
