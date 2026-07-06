"use client";

import { useEffect, useRef, useState } from "react";

// The in-app assistant UI. The server owns the tool-calling loop; this
// component just holds the transcript (opaque — tool messages included, so
// context like slotIds survives across turns) and renders the human-visible
// subset: user messages and assistant replies with text content.

type TranscriptMessage = {
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; arguments: unknown }[];
};

const SUGGESTIONS = [
  "What's on the schedule this week?",
  "Cancel tomorrow's first class",
  "Move Thursday's class to 3pm",
  "Add a quiz next Wednesday",
];

export default function ChatPanel({ spaceId }: { spaceId: string }) {
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = transcript.filter(
    (m): m is TranscriptMessage & { content: string } =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length > 0,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visible.length, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    const next = [...transcript, { role: "user" as const, content: trimmed }];
    setTranscript(next);
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaceId, messages: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Something went wrong — try again.");
        return;
      }
      if (Array.isArray(json.messages)) setTranscript(json.messages);
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      {/* messages */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-10 text-center">
            <p className="max-w-md text-sm text-ink-soft">
              Ask in plain language — I can read the schedule, make one-week changes,
              edit the permanent timetable (when you say so), and manage events.
            </p>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={busy}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-1 py-4">
            {visible.map((m, i) => (
              <div key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm " +
                    (m.role === "user"
                      ? "bg-brand text-on-brand"
                      : "border border-line bg-surface text-ink")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-line bg-surface px-3.5 py-2.5 font-mono text-xs text-ink-faint">
                  working…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-xl border border-berry/40 bg-berry/10 px-3.5 py-2.5 text-sm text-berry">
          {error}
        </div>
      )}

      {/* composer */}
      <div className="flex gap-2 border-t border-line pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(input); }}
          disabled={busy}
          placeholder='e.g. "cancel tomorrow&apos;s physics class"'
          className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand disabled:opacity-60"
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="pressable px-5 py-3 disabled:opacity-60">
          Send
        </button>
      </div>
      <p className="mt-2 font-mono text-[11px] text-ink-faint">
        Changes apply immediately — the assistant defaults to this-week-only changes unless you say “permanently”.
      </p>
    </div>
  );
}
