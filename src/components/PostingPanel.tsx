"use client";

import { useState, useTransition } from "react";
import type { DigestResult } from "@/lib/digest";
import { TimeField } from "@/components/ui/TimePicker";

// Space "posting" settings: which Discord channel, when, on/off — plus a
// "Post tomorrow now" button to test the wiring end to end. Saves through
// space-scoped server actions passed in as props.
// `postTime` and `hour12` are CONTROLLED by the parent shell, not owned here —
// the preview, editor and header show them too, so they live in one place and
// every view updates the instant you change them (saving just persists them).
export default function PostingPanel({
  initial,
  postTime,
  onPostTimeChange,
  hour12,
  onHour12Change,
  actions,
}: {
  initial: { channelId: string; notificationsEnabled: boolean };
  postTime: string;
  onPostTimeChange: (v: string) => void;
  hour12: boolean;
  onHour12Change: (v: boolean) => void;
  actions: {
    updateSettings: (data: { discordChannelId?: string; postTime?: string; notificationsEnabled?: boolean; hour12?: boolean }) => Promise<void>;
    postNow: () => Promise<DigestResult>;
  };
}) {
  const [channelId, setChannelId] = useState(initial.channelId);
  const [notify, setNotify] = useState(initial.notificationsEnabled);
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState<"ok" | "err" | null>(null);
  const [posting, startPost] = useTransition();
  const [result, setResult] = useState<DigestResult | null>(null);

  function save() {
    setSaved(null);
    startSave(async () => {
      try {
        await actions.updateSettings({ discordChannelId: channelId, postTime, notificationsEnabled: notify, hour12 });
        setSaved("ok");
      } catch {
        setSaved("err");
      }
    });
  }

  function postNow() {
    setResult(null);
    startPost(async () => {
      try {
        setResult(await actions.postNow());
      } catch {
        setResult({ status: "failed", reason: "request error" });
      }
    });
  }

  return (
    <section className="panel flex flex-col p-5">
      <h2 className="font-display text-lg font-bold text-ink">Posting</h2>
      <p className="mt-0.5 text-sm text-ink-soft">Where and when tomorrow&apos;s schedule goes out.</p>

      <label className="mt-4 block font-mono text-[11px] uppercase tracking-wider text-ink-faint">
        Discord channel ID
      </label>
      <input
        value={channelId}
        onChange={(e) => setChannelId(e.target.value)}
        inputMode="numeric"
        placeholder="e.g. 112233445566778899"
        className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
      />
      <p className="mt-1 text-xs text-ink-faint">
        In Discord: enable Developer Mode, right-click the channel → Copy Channel ID.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div>
          <label className="block font-mono text-[11px] uppercase tracking-wider text-ink-faint">Post time</label>
          {/* Same wheel picker as the editor, so it shows in the chosen format
              and stays in lockstep with the toggle below — no native, OS-locale
              time box that ignores the setting. */}
          <TimeField
            value={postTime}
            hour12={hour12}
            onChange={onPostTimeChange}
            ariaLabel="Post time"
            className="mt-1 inline-flex min-w-[7rem] items-center justify-center rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink transition-colors hover:border-brand"
          />
        </div>
        <button
          type="button"
          onClick={() => setNotify((v) => !v)}
          className="mt-5 flex items-center gap-2"
          aria-pressed={notify}
        >
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
                onClick={() => onHour12Change(val)}
                title={`e.g. ${eg}`}
                className={"rounded-lg px-3 py-1.5 transition-colors " + (active ? "bg-brand text-on-brand shadow-sm" : "text-ink-soft hover:text-ink")}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-ink-faint">How every time shows — editor, preview, post time &amp; the Discord post. (Stored the same either way.)</p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="pressable px-4 py-2.5 text-sm disabled:opacity-60">
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved === "ok" && <span className="font-mono text-xs text-mint-deep">saved ✓</span>}
        {saved === "err" && <span className="font-mono text-xs text-berry">couldn&apos;t save</span>}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-center gap-3">
          <button onClick={postNow} disabled={posting} className="pressable pressable-mint px-4 py-2.5 text-sm disabled:opacity-60">
            {posting ? "Sending…" : "Post tomorrow now"}
          </button>
          <span className="font-mono text-[11px] text-ink-faint">tests the channel end-to-end</span>
        </div>
        {result && <PostResult result={result} />}
      </div>
    </section>
  );
}

function PostResult({ result }: { result: DigestResult }) {
  const map = {
    sent: { cls: "border-mint/40 bg-mint-tint text-mint-deep", text: "Posted to your channel ✓" },
    skipped: { cls: "border-gold/40 bg-gold/10 text-gold-deep", text: `Skipped — ${result.reason ?? "not eligible"}` },
    failed: { cls: "border-berry/40 bg-berry/10 text-berry", text: `Failed — ${result.reason ?? "unknown error"}` },
  }[result.status];
  return <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${map.cls}`}>{map.text}</div>;
}
