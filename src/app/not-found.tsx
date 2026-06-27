import Link from "next/link";
import Brand from "@/components/Brand";
import Mascot from "@/components/Mascot";

// Catches unknown routes and every notFound() call (e.g. a space id that isn't
// yours). Themed so a 404 still feels like part of the app.
export default function NotFound() {
  return (
    <main className="relative flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-5 sm:px-8">
        <Brand />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
        <Mascot size={104} mood="wave" className="animate-float" />
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">
          error 404
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          Guy looked everywhere…
        </h1>
        <p className="max-w-md text-ink-soft">
          …but that page isn&apos;t on the schedule. It may have moved, or the
          link is a little off.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <Link href="/" className="pressable px-5 py-3">
            Back home
          </Link>
          <Link href="/dashboard" className="pressable pressable-ghost px-5 py-3">
            Your dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
