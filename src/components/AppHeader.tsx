import type { ReactNode } from "react";

// Sticky frosted top bar shared by the dashboard and space pages. Purely a
// presentational shell — pages supply the left (brand / back) and right (user,
// actions) slots so it stays a server component.
export default function AppHeader({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">{left}</div>
        {right && <div className="flex items-center gap-3">{right}</div>}
      </div>
    </header>
  );
}
