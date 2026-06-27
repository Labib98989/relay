"use client";

import { useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import TomorrowPreview from "@/components/TomorrowPreview";
import PostingPanel from "@/components/PostingPanel";
import ScheduleEditor, { type EditorData, type EditorActions } from "@/components/ScheduleEditor";
import type { ResolvedDay } from "@/lib/resolve";
import type { DigestResult } from "@/lib/digest";
import { formatTime } from "@/lib/time";

// The whole space view, as ONE client tree, so the two settings that several
// panels also display — postTime and hour12 — have a single source of truth.
// Editing either in Settings updates the header badge, the preview, the editor
// and every "posts at …" label instantly; "Save settings" then persists it.
// (Before this, each panel read its own saved copy, so changes only showed up
// after a save + reload — hence the stale "default" times.)
export default function SpaceWorkspace({
  spaceName,
  connected,
  resolved,
  dateLabel,
  initial,
  data,
  postingActions,
  editorActions,
}: {
  spaceName: string;
  connected: boolean;
  resolved: ResolvedDay;
  dateLabel: string;
  initial: { postTime: string; hour12: boolean; channelId: string; notificationsEnabled: boolean };
  data: EditorData;
  postingActions: {
    updateSettings: (data: { discordChannelId?: string; postTime?: string; notificationsEnabled?: boolean; hour12?: boolean }) => Promise<void>;
    postNow: () => Promise<DigestResult>;
  };
  editorActions: EditorActions;
}) {
  const [postTime, setPostTime] = useState(initial.postTime);
  const [hour12, setHour12] = useState(initial.hour12);

  const meta = connected
    ? `posts to Discord nightly at ${formatTime(postTime, hour12)}`
    : "channel not connected yet";

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        left={
          <>
            <Link
              href="/dashboard"
              className="rounded-lg px-2 py-1 font-mono text-xs text-ink-soft transition-colors hover:text-brand"
            >
              ← all spaces
            </Link>
            <span className="h-4 w-px bg-line" />
            <span className="truncate font-display font-bold text-ink">{spaceName}</span>
          </>
        }
        right={
          <span className="hidden rounded-full bg-surface-2 px-3 py-1 font-mono text-[11px] text-ink-soft sm:block">
            posts {formatTime(postTime, hour12)}
          </span>
        }
      />

      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-8 sm:px-6 md:grid-cols-2">
        <TomorrowPreview
          resolved={resolved}
          dateLabel={dateLabel}
          postTime={postTime}
          connected={connected}
          hour12={hour12}
        />
        <PostingPanel
          initial={{ channelId: initial.channelId, notificationsEnabled: initial.notificationsEnabled }}
          postTime={postTime}
          onPostTimeChange={setPostTime}
          hour12={hour12}
          onHour12Change={setHour12}
          actions={postingActions}
        />
      </div>

      <ScheduleEditor
        spaceName={spaceName}
        meta={meta}
        hour12={hour12}
        data={data}
        actions={editorActions}
      />
    </div>
  );
}
