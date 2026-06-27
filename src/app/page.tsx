import Link from "next/link";
import type { ReactNode } from "react";
import { auth, signIn } from "@/auth";
import Brand from "@/components/Brand";
import Mascot from "@/components/Mascot";
import Reveal from "@/components/Reveal";

export default async function Home() {
  const session = await auth();

  return (
    <main className="relative flex flex-1 flex-col">
      {/* top bar */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand href={null} />
        <span className="hidden font-mono text-xs text-ink-soft sm:block">
          for class reps · posts to Discord
        </span>
      </div>

      {/* hero */}
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        {/* left: pitch + CTA */}
        <div className="max-w-xl">
          <span
            className="animate-rise inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-ink-soft shadow-sm"
            style={{ animationDelay: "40ms" }}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-mint" />
            never type out the routine again
          </span>

          <h1
            className="animate-rise mt-5 font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-6xl"
            style={{ animationDelay: "100ms" }}
          >
            Tomorrow&apos;s classes,
            <br />
            <span className="text-brand">posted while you sleep.</span>
          </h1>

          <p
            className="animate-rise mt-5 text-lg leading-8 text-ink-soft"
            style={{ animationDelay: "160ms" }}
          >
            Lay out your section&apos;s weekly routine once — like snapping
            stickers onto a board. Cancel a class or move a room for{" "}
            <em className="text-ink">just this week</em> in a tap. Routine Guy
            pings your Discord every night with what&apos;s on tomorrow.
          </p>

          <div
            className="animate-rise mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "220ms" }}
          >
            {session ? (
              <Link href="/dashboard" className="pressable px-6 py-3.5 text-base">
                Open your dashboard →
              </Link>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await signIn("discord", { redirectTo: "/dashboard" });
                }}
              >
                <button
                  type="submit"
                  className="pressable px-6 py-3.5 text-base"
                  style={{ ["--lip" as string]: "#4451c8", background: "#5865F2", color: "#fff" }}
                >
                  <DiscordGlyph />
                  Continue with Discord
                </button>
              </form>
            )}
            <Link
              href="/design"
              className="pressable pressable-ghost px-5 py-3.5 text-base"
            >
              Try the editor
            </Link>
          </div>

          <p
            className="animate-rise mt-4 font-mono text-xs text-ink-faint"
            style={{ animationDelay: "260ms" }}
          >
            free for your section · up to 5 schedule spaces
          </p>
        </div>

        {/* right: the showcase — a peek at "tomorrow's" card */}
        <div
          className="animate-rise relative"
          style={{ animationDelay: "300ms" }}
        >
          <Mascot
            size={72}
            mood="wave"
            className="animate-float absolute -top-9 left-1 z-10 drop-shadow-xl sm:-left-8 sm:-top-10"
          />
          <TomorrowCard />
          {/* loose floating tiles for play */}
          <FloatTile className="-right-3 top-6 rotate-6" color="#e8467c" label="Lab" />
          <FloatTile className="-left-5 bottom-8 -rotate-6" color="#15b886" label="CSE" delay="1.2s" />
        </div>
      </section>

      {/* features */}
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-5 pb-20 sm:px-8 md:grid-cols-3">
        <Reveal delay={0}>
          <FeatureCard
            tone="brand"
            icon={<GridIcon />}
            title="Build it once"
            body="Snap your weekly classes onto the grid. It becomes the source of truth — no calendar-app gymnastics."
          />
        </Reveal>
        <Reveal delay={90}>
          <FeatureCard
            tone="mint"
            icon={<SparkIcon />}
            title="Change just this week"
            body="Class off? Room moved? Tap it for a temporary, this-week-only fix that resets itself automatically."
          />
        </Reveal>
        <Reveal delay={180}>
          <FeatureCard
            tone="gold"
            icon={<MoonIcon />}
            title="It posts itself"
            body="Every night the bot drops tomorrow's schedule into your section's channel. You do nothing."
          />
        </Reveal>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-10 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-sm text-ink-faint sm:flex-row">
          <Brand href={null} size="sm" />
          <span className="font-mono text-xs">made for the class rep who keeps everyone on time.</span>
        </div>
      </footer>
    </main>
  );
}

/* ------------------------------- sub-pieces ------------------------------- */

function TomorrowCard() {
  return (
    <div className="panel mat overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-ink-faint">
            tonight&apos;s post · #cse-a
          </div>
          <div className="font-display text-lg font-bold text-ink">
            Tomorrow — Sunday
          </div>
        </div>
        <span className="rounded-full bg-mint-tint px-2.5 py-1 font-mono text-[11px] font-semibold text-mint-deep">
          ready ✓
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <ShowTile time="08:00" name="CSE 2101" room="Room 301" color="#f4632e" />
        <ShowTile time="09:40" name="MATH 1101" room="Room 214 → 502" color="#2f93e6" badge="changed" />
        <ShowTile time="11:40" name="PHY 1102" room="Cancelled today" color="#8b8b95" badge="off" muted />
        <ShowTile time="02:00" name="CSE Lab" room="Lab A" color="#15b886" />
      </div>
    </div>
  );
}

function ShowTile({
  time,
  name,
  room,
  color,
  badge,
  muted,
}: {
  time: string;
  name: string;
  room: string;
  color: string;
  badge?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-faint">
        {time}
      </span>
      <div
        className={`tile flex flex-1 items-center justify-between px-3 py-2 ${muted ? "opacity-60 saturate-50" : ""}`}
        style={{ background: color }}
      >
        <span className={`text-sm font-bold ${badge === "off" ? "line-through" : ""}`}>
          {name}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-white/85">{room}</span>
          {badge && (
            <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold">
              {badge}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function FloatTile({
  className,
  color,
  label,
  delay = "0s",
}: {
  className?: string;
  color: string;
  label: string;
  delay?: string;
}) {
  return (
    <div
      className={`tile animate-float absolute hidden px-3 py-2 text-sm font-bold sm:block ${className ?? ""}`}
      style={{ background: color, animationDelay: delay }}
    >
      {label}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  tone: "brand" | "mint" | "gold";
}) {
  const badge =
    tone === "brand"
      ? "bg-brand-tint text-brand"
      : tone === "mint"
        ? "bg-mint-tint text-mint-deep"
        : "bg-gold/20 text-gold-deep";
  return (
    <div className="panel group p-5 transition-transform hover:-translate-y-1">
      <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl ${badge}`}>
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">{body}</p>
    </div>
  );
}

/* ---- tiny inline glyphs (no icon dependency) ---- */
function DiscordGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.27 5.33A16.5 16.5 0 0 0 15.2 4l-.2.4a13 13 0 0 1 3.46 1.5 11.6 11.6 0 0 0-10-.45c-.3.13-.6.27-.86.4A13 13 0 0 1 9 4l-.2-.4a16.5 16.5 0 0 0-4.07 1.33C2.5 8.06 1.9 10.72 2.1 13.35a16.7 16.7 0 0 0 5 2.5l.62-.85c-.85-.32-1.65-.72-2.4-1.2.2-.14.4-.3.58-.45a11.9 11.9 0 0 0 10.2 0c.2.16.38.31.58.45-.75.48-1.55.88-2.4 1.2l.62.85a16.6 16.6 0 0 0 5-2.5c.27-3.04-.46-5.68-1.94-8.02ZM8.9 12.6c-.97 0-1.77-.88-1.77-1.97s.78-1.98 1.77-1.98 1.79.9 1.77 1.98c0 1.09-.78 1.97-1.77 1.97Zm6.5 0c-.97 0-1.77-.88-1.77-1.97s.78-1.98 1.77-1.98 1.79.9 1.77 1.98c0 1.09-.78 1.97-1.77 1.97Z" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5l1.7 4.8L18.5 9l-4.8 1.7L12 15.5l-1.7-4.8L5.5 9l4.8-1.7L12 2.5Z" />
      <path d="M18.5 14l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z" opacity=".6" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z" />
    </svg>
  );
}
