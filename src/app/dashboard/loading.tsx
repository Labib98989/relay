import Brand from "@/components/Brand";

// Skeleton shown while the spaces query runs. Mirrors the real dashboard layout
// (frosted header + a grid of cards) so there's no jolt when content arrives.
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <div className="h-7 w-7 animate-pulse rounded-full bg-surface-2" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
            <div className="h-4 w-80 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-2xl bg-surface-2" />
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="panel overflow-hidden p-5 pt-6">
              <span className="absolute inset-x-0 top-0 h-1.5 bg-line" />
              <div className="h-6 w-32 animate-pulse rounded bg-surface-2" />
              <div className="mt-3 flex gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-surface-2" />
                <div className="h-6 w-28 animate-pulse rounded-full bg-surface-2" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
