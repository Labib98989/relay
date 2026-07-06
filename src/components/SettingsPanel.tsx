"use client";

import { useState, useTransition } from "react";
import type { DigestResult } from "@/lib/digest";
import { TimeField } from "@/components/ui/TimePicker";
import { postTargets, type RouteKey } from "@/lib/categories";

// The space's Settings section: channel routing (main channel + per-target
// overrides), posting preferences, rename, and delete. Replaces the old
// PostingPanel; each block saves through its own space-scoped Server Action.
export default function SettingsPanel({
  spaceId,
  initial,
  actions,
  deleteAction,
}: {
  spaceId: string;
  initial: {
    name: string;
    channelId: string;
    postTime: string;
    notificationsEnabled: boolean;
    hour12: boolean;
    routes: Record<string, string>; // key -> channelId (only the set ones)
  };
  actions: {
    updateSettings: (data: { discordChannelId?: string; postTime?: string; notificationsEnabled?: boolean; hour12?: boolean }) => Promise<void>;
    setChannelRoute: (key: RouteKey, channelId: string | null) => Promise<void>;
    postNow: () => Promise<DigestResult>;
    rename: (name: string) => Promise<void>;
  };
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const targets = postTargets();

  /* ------------------------------- name ---------------------------------- */
  const [name, setName] = useState(initial.name);
  const [savingName, startName] = useTransition();
  const [nameState, setNameState] = useState<Save>(null);
  function saveName() {
    setNameState(null);
    startName(async () => {
      try {
        await actions.rename(name);
        setNameState("ok");
      } catch {
        setNameState("err");
      }
    });
  }

  /* ------------------------------ channels ------------------------------- */
  const [mainChannel, setMainChannel] = useState(initial.channelId);
  const [routes, setRoutes] = useState<Record<string, string>>(() => {
    const r: Record<string, string> = {};
    for (const t of targets) r[t.key] = initial.routes[t.key] ?? "";
    return r;
  });
  const [savingCh, startCh] = useTransition();
  const [chState, setChState] = useState<Save>(null);
  function saveChannels() {
    setChState(null);
    startCh(async () => {
      try {
        await actions.updateSettings({ discordChannelId: mainChannel });
        for (const t of targets) {
          const cur = routes[t.key] ?? "";
          if (cur !== (initial.routes[t.key] ?? "")) {
            await actions.setChannelRoute(t.key, cur || null);
          }
        }
        setChState("ok");
      } catch {
        setChState("err");
      }
    });
  }

  /* ------------------------------ posting -------------------------------- */
  const [postTime, setPostTime] = useState(initial.postTime);
  const [hour12, setHour12] = useState(initial.hour12);
  const [notify, setNotify] = useState(initial.notificationsEnabled);
  const [savingPost, startPost] = useTransition();
  const [postState, setPostState] = useState<Save>(null);
  const [posting, startNow] = useTransition();
  const [result, setResult] = useState<DigestResult | null>(null);
  function savePosting() {
    setPostState(null);
    startPost(async () => {
      try {
        await actions.updateSettings({ postTime, notificationsEnabled: notify, hour12 });
        setPostState("ok");
      } catch {
        setPostState("err");
      }
    });
  }
  function postNow() {
    setResult(null);
    startNow(async () => {
      try {
        setResult(await actions.postNow());
      } catch {
        setResult({ status: "failed", reason: "request error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* name */}
      <section className="panel p-5">
        <h2 className="font-display text-lg font-bold text-ink">Space name</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="flex-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand"
          />
          <button onClick={saveName} disabled={savingName} className="pressable px-4 py-2.5 text-sm disabled:opacity-60">
            {savingName ? "Saving…" : "Save name"}
          </button>
          <SaveHint state={nameState} />
        </div>
      </section>

      {/* channels */}
      <section className="panel p-5">
        <h2 className="font-display text-lg font-bold text-ink">Channels</h2>
        <p className="mt-0.5 text-sm text-ink-soft">Where each thing gets posted. Blank rows fall back to the main channel.</p>

        <label className="mt-4 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Main channel ID</label>
        <input
          value={mainChannel}
          onChange={(e) => setMainChannel(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 112233445566778899"
          className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
        />
        <p className="mt-1 text-xs text-ink-faint">In Discord: enable Developer Mode, right-click the channel → Copy Channel ID.</p>

        <div className="mt-4 flex flex-col gap-1.5">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">Route specific things (optional)</div>
          {targets.map((t) => (
            <div key={t.key} className="flex items-center gap-2">
              <span className="w-44 shrink-0 truncate text-sm text-ink">
                <span className="mr-1">{t.emoji}</span>
                {t.label}
              </span>
              <input
                value={routes[t.key] ?? ""}
                onChange={(e) => setRoutes((prev) => ({ ...prev, [t.key]: e.target.value }))}
                inputMode="numeric"
                placeholder="uses main channel"
                className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-xs text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveChannels} disabled={savingCh} className="pressable px-4 py-2.5 text-sm disabled:opacity-60">
            {savingCh ? "Saving…" : "Save channels"}
          </button>
          <SaveHint state={chState} />
        </div>
      </section>

      {/* posting */}
      <section className="panel p-5">
        <h2 className="font-display text-lg font-bold text-ink">Posting</h2>
        <p className="mt-0.5 text-sm text-ink-soft">When the nightly digest goes out, and how times read.</p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div>
            <label className="block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Post time</label>
            <TimeField
              value={postTime}
              hour12={hour12}
              onChange={setPostTime}
              ariaLabel="Post time"
              className="mt-1 inline-flex min-w-[7rem] items-center justify-center rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink transition-colors hover:border-brand"
            />
          </div>
          <button type="button" onClick={() => setNotify((v) => !v)} className="mt-5 flex items-center gap-2" aria-pressed={notify}>
            <span className={"relative h-6 w-10 rounded-full transition-colors " + (notify ? "bg-mint" : "bg-line-strong")}>
              <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (notify ? "left-[1.125rem]" : "left-0.5")} />
            </span>
            <span className="text-sm font-medium text-ink">{notify ? "Notifications on" : "Notifications off"}</span>
          </button>
        </div>

        <div className="mt-4">
          <label className="block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Time format</label>
          <div className="mt-1 inline-flex rounded-xl border border-line bg-surface-2 p-1 text-sm font-semibold">
            {([[true, "12-hour", "8:00 AM"], [false, "24-hour", "20:00"]] as const).map(([val, label, eg]) => {
              const active = hour12 === val;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setHour12(val)}
                  title={`e.g. ${eg}`}
                  className={"rounded-lg px-3 py-1.5 transition-colors " + (active ? "bg-brand text-on-brand shadow-sm" : "text-ink-soft hover:text-ink")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={savePosting} disabled={savingPost} className="pressable px-4 py-2.5 text-sm disabled:opacity-60">
            {savingPost ? "Saving…" : "Save posting"}
          </button>
          <SaveHint state={postState} />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center gap-3">
            <button onClick={postNow} disabled={posting} className="pressable pressable-mint px-4 py-2.5 text-sm disabled:opacity-60">
              {posting ? "Sending…" : "Post tomorrow now"}
            </button>
            <span className="font-mono text-[11px] text-ink-faint">tests the digest channel end-to-end</span>
          </div>
          {result && <PostResult result={result} />}
        </div>
      </section>

      {/* danger zone */}
      <section className="panel border-berry/30 p-5">
        <h2 className="font-display text-lg font-bold text-berry">Delete space</h2>
        <p className="mt-0.5 text-sm text-ink-soft">Removes this section&apos;s schedule, events and settings. This can&apos;t be undone.</p>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`Delete “${initial.name}”? This can't be undone.`)) e.preventDefault();
          }}
          className="mt-3"
        >
          <input type="hidden" name="id" value={spaceId} />
          <button type="submit" className="pressable pressable-ghost px-4 py-2.5 text-sm text-berry">
            Delete this space
          </button>
        </form>
      </section>
    </div>
  );
}

type Save = "ok" | "err" | null;

function SaveHint({ state }: { state: Save }) {
  if (state === "ok") return <span className="font-mono text-xs text-mint-deep">saved ✓</span>;
  if (state === "err") return <span className="font-mono text-xs text-berry">couldn&apos;t save</span>;
  return null;
}

function PostResult({ result }: { result: DigestResult }) {
  const map = {
    sent: { cls: "border-mint/40 bg-mint-tint text-mint-deep", text: "Posted to your channel ✓" },
    skipped: { cls: "border-gold/40 bg-gold/10 text-gold-deep", text: `Skipped — ${result.reason ?? "not eligible"}` },
    failed: { cls: "border-berry/40 bg-berry/10 text-berry", text: `Failed — ${result.reason ?? "unknown error"}` },
  }[result.status];
  return <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${map.cls}`}>{map.text}</div>;
}
