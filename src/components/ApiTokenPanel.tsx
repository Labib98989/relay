"use client";

import { useState, useTransition } from "react";
import type { ApiTokenSummary } from "@/app/dashboard/account/actions";

// Personal-access-token management (GitHub-PAT-style UX): list, generate with
// a one-time plaintext reveal, revoke. The plaintext exists only in this
// component's state right after creation — reloading loses it by design.

export default function ApiTokenPanel({
  initialTokens,
  actions,
}: {
  initialTokens: ApiTokenSummary[];
  actions: {
    create: (name: string) => Promise<{ token: ApiTokenSummary; plaintext: string }>;
    revoke: (tokenId: string) => Promise<void>;
  };
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<{ name: string; plaintext: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // @relay-test-button — temporary manual pipeline pokes; grep this tag to remove.
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // @relay-test-button — hits the Stage-2 GPT dispatcher with the new token.
  async function testGptApi(plaintext: string) {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/gpt/list_spaces", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${plaintext}` },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      setTestResult(
        res.ok
          ? `GPT API ✓ — ${json.summary ?? "ok"}`
          : `GPT API ✗ — HTTP ${res.status}${json.error ? `: ${json.error}` : ""}`,
      );
    } catch {
      setTestResult("GPT API ✗ — network error");
    } finally {
      setTesting(false);
    }
  }

  // @relay-test-button — runs the Stage-1 MCP initialize handshake with the token.
  async function testMcp(plaintext: string) {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${plaintext}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "relay-test-button", version: "1.0.0" },
          },
        }),
      });
      const text = await res.text();
      setTestResult(
        res.ok && text.includes("serverInfo")
          ? "MCP ✓ — handshake ok (Relay MCP server responded)"
          : `MCP ✗ — HTTP ${res.status}: ${text.slice(0, 160)}`,
      );
    } catch {
      setTestResult("MCP ✗ — network error");
    } finally {
      setTesting(false);
    }
  }

  function create() {
    if (pending) return;
    setError(null);
    start(async () => {
      try {
        const { token, plaintext } = await actions.create(name);
        setTokens((prev) => [token, ...prev]);
        setRevealed({ name: token.name, plaintext });
        setCopied(false);
        setName("");
      } catch {
        setError("Couldn't create the token — try again.");
      }
    });
  }

  function revoke(tokenId: string) {
    setError(null);
    start(async () => {
      try {
        await actions.revoke(tokenId);
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      } catch {
        setError("Couldn't revoke the token — try again.");
      }
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable (permissions/http) — the token is still
      // visible for manual selection, so no error state needed.
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      {revealed && (
        <div className="animate-pop-in rounded-2xl border border-gold/50 bg-gold/10 p-4">
          <div className="mb-1 font-display text-sm font-bold text-ink">
            “{revealed.name}” created — copy the token now
          </div>
          <p className="mb-2 text-xs text-ink-soft">
            This is the only time it&apos;s shown. Store it somewhere safe; if you lose it,
            revoke it and generate a new one.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs text-ink">
              {revealed.plaintext}
            </code>
            <button onClick={() => copy(revealed.plaintext)} className="pressable shrink-0 px-3 py-2 text-xs">
              {copied ? "copied ✓" : "copy"}
            </button>
          </div>
          {/* @relay-test-button — temporary manual pipeline pokes; grep this tag to remove. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gold/30 pt-3">
            <span className="font-mono text-[11px] text-ink-faint">poke the pipeline:</span>
            <button
              onClick={() => testGptApi(revealed.plaintext)}
              disabled={testing}
              className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
            >
              test: GPT API (list_spaces)
            </button>
            <button
              onClick={() => testMcp(revealed.plaintext)}
              disabled={testing}
              className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
            >
              test: MCP handshake
            </button>
            {testing && <span className="font-mono text-[11px] text-ink-faint">testing…</span>}
          </div>
          {testResult && (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink">
              {testResult}
            </pre>
          )}
          <button
            onClick={() => setRevealed(null)}
            className="mt-2 font-mono text-[11px] text-ink-faint hover:text-ink"
          >
            I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-berry/40 bg-berry/10 px-3.5 py-2.5 text-sm text-berry">{error}</div>
      )}

      {/* create */}
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          maxLength={60}
          placeholder="Token name — e.g. Claude Desktop"
          className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
        />
        <button onClick={create} disabled={pending} className="pressable px-5 py-3 disabled:opacity-60">
          {pending ? "working…" : "+ Generate token"}
        </button>
      </div>

      {/* list */}
      {tokens.length === 0 ? (
        <p className="px-1 text-sm text-ink-soft">
          No tokens yet. Generate one to connect Claude (or another AI client) to your schedule.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tokens.map((t) => (
            <li key={t.id} className="panel flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{t.name}</div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-faint">
                  {t.prefix}…{" · "}created {fmt(t.createdAt)}
                  {" · "}
                  {t.lastUsedAt ? `last used ${fmt(t.lastUsedAt)}` : "never used"}
                </div>
              </div>
              <button
                onClick={() => revoke(t.id)}
                disabled={pending}
                className="shrink-0 rounded-lg px-2.5 py-1.5 font-mono text-xs text-ink-faint transition-colors hover:bg-berry/10 hover:text-berry disabled:opacity-60"
              >
                revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
