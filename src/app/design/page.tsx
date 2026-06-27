import Link from "next/link";
import Brand from "@/components/Brand";
import ScheduleEditor from "@/components/ScheduleEditor";

// Public sandbox for the schedule editor — same component the real space page
// uses, seeded with sample data so anyone can feel the interaction loop without
// signing in. Linked from the landing page's "Try the editor".
export default function DesignSandbox() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <Link
          href="/"
          className="rounded-lg px-2 py-1 font-mono text-xs text-ink-soft transition-colors hover:text-brand"
        >
          ← back home
        </Link>
      </div>
      <ScheduleEditor spaceName="CSE-A" meta="sandbox · Section 2 · sample data" />
    </div>
  );
}
