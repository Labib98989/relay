"use client";

import Link from "next/link";
import Brand from "@/components/Brand";
import Mascot from "@/components/Mascot";

// Route-segment error boundary. Must be a Client Component; `reset` retries the
// failed render. Kept friendly + professional — own up to the snag, offer a way out.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="relative flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-5 sm:px-8">
        <Brand />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
        <Mascot size={104} className="animate-float" />
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">
          something tripped up
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          That didn&apos;t load right
        </h1>
        <p className="max-w-md text-ink-soft">
          Guy hit a snag rendering this page. Give it another go — if it keeps
          happening, the problem is on our end, not yours.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="pressable px-5 py-3">
            Try again
          </button>
          <Link href="/" className="pressable pressable-ghost px-5 py-3">
            Back home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-ink-faint">ref: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
