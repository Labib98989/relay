import Mascot from "@/components/Mascot";

// Default route-load fallback (Suspense). Guy bobs while the next view streams in.
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
      <Mascot size={76} className="animate-float" />
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-200ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand [animation-delay:-100ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand" />
      </div>
      <p className="font-mono text-xs text-ink-faint">loading…</p>
    </main>
  );
}
