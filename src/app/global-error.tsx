"use client";

// Last-resort boundary: catches errors thrown by the root layout itself, so it
// must render its own <html>/<body>. The root layout's fonts aren't available
// here, so we lean on system fonts but keep the warm palette via globals.css.
import "./globals.css";
import Mascot from "@/components/Mascot";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        className="grain flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <Mascot size={92} />
        <h1 className="text-2xl font-extrabold text-ink">The app hit a wall</h1>
        <p className="max-w-sm text-ink-soft">
          Something broke before the page could load. Reloading usually clears it.
        </p>
        <button onClick={reset} className="pressable px-5 py-3">
          Reload
        </button>
      </body>
    </html>
  );
}
