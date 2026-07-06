"use client";

// @relay-test-button — temporary manual pipeline pokes; grep this tag to remove.
// Drives /api/dashboard-chat/selftest from the chat page: a provider
// reachability ping and the tool-selection suite (temporary-vs-permanent
// steering). Delete this file + its import in chat/page.tsx + the selftest
// route when test surfaces come out.

import { useState } from "react";

type SuiteResult = {
  prompt: string;
  expected: string | string[];
  decision: string;
  argsValid: boolean | null;
  toolTrail: string[];
  error: string | null;
  pass: boolean;
};

export default function ChatTestControls({ spaceId }: { spaceId: string }) {
  const [busy, setBusy] = useState<"ping" | "suite" | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [suite, setSuite] = useState<{ passed: number; total: number; model: string; results: SuiteResult[] } | null>(null);

  async function run(mode: "ping" | "suite") {
    setBusy(mode);
    if (mode === "ping") setPingResult(null);
    else setSuite(null);
    try {
      const res = await fetch("/api/dashboard-chat/selftest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaceId, mode }),
      });
      const json = await res.json().catch(() => ({}));
      if (mode === "ping") {
        setPingResult(
          res.ok
            ? `provider ✓ — ${json.provider}/${json.model} replied: "${json.reply}"`
            : `provider ✗ — ${json.error ?? `HTTP ${res.status}`}`,
        );
      } else if (res.ok) {
        setSuite(json);
      } else {
        setPingResult(`suite ✗ — ${json.error ?? `HTTP ${res.status}`}`);
      }
    } catch {
      setPingResult("✗ — network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-dashed border-line bg-surface-2/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-ink-faint">test panel:</span>
        <button
          onClick={() => run("ping")}
          disabled={!!busy}
          className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
        >
          {busy === "ping" ? "pinging…" : "test: provider ping"}
        </button>
        <button
          onClick={() => run("suite")}
          disabled={!!busy}
          className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
        >
          {busy === "suite" ? "running suite… (can take a few minutes)" : "test: tool-selection suite"}
        </button>
      </div>
      {pingResult && (
        <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink">{pingResult}</pre>
      )}
      {suite && (
        <div className="mt-2 overflow-x-auto">
          <div className="mb-1 font-mono text-[11px] font-semibold text-ink">
            {suite.passed}/{suite.total} passed · model: {suite.model}
          </div>
          <table className="w-full min-w-[560px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="border-b border-line px-2 py-1">prompt</th>
                <th className="border-b border-line px-2 py-1">expected</th>
                <th className="border-b border-line px-2 py-1">decision</th>
                <th className="border-b border-line px-2 py-1">trail</th>
                <th className="border-b border-line px-2 py-1">ok</th>
              </tr>
            </thead>
            <tbody>
              {suite.results.map((r) => (
                <tr key={r.prompt} className="align-top text-ink-soft">
                  <td className="border-b border-line/60 px-2 py-1">{r.prompt}</td>
                  <td className="border-b border-line/60 px-2 py-1">{Array.isArray(r.expected) ? r.expected.join(" | ") : r.expected}</td>
                  <td className="border-b border-line/60 px-2 py-1">
                    {r.decision}
                    {r.argsValid === false ? " (bad args)" : ""}
                    {r.error ? ` [${r.error.slice(0, 60)}]` : ""}
                  </td>
                  <td className="border-b border-line/60 px-2 py-1">{r.toolTrail.join(" → ") || "—"}</td>
                  <td className={"border-b border-line/60 px-2 py-1 font-bold " + (r.pass ? "text-mint-deep" : "text-berry")}>
                    {r.pass ? "✓" : "✗"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
