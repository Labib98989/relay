import Brand from "@/components/Brand";

// Skeleton for the space editor while the space loads. Echoes the editor shell:
// header, hint strip, palette, and the dotted mat with placeholder rows.
export default function SpaceLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <div className="h-6 w-20 animate-pulse rounded-full bg-surface-2" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-9 w-44 animate-pulse rounded-2xl bg-surface-2" />
        </div>
        <div className="hint mb-3 h-10 animate-pulse opacity-60" />
        <div className="panel mb-4 h-20 animate-pulse" />
        <div className="panel mat space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-surface/60" />
          ))}
        </div>
      </main>
    </div>
  );
}
