import Link from "next/link";
import Mascot from "./Mascot";

// The wordmark: tiny Guy + "Routine Guy" set in the display face. Links home by
// default; pass `href={null}` for a non-interactive mark (e.g. inside a button).
export default function Brand({
  href = "/",
  size = "md",
}: {
  href?: string | null;
  size?: "sm" | "md";
}) {
  const mascot = size === "sm" ? 26 : 34;
  const text = size === "sm" ? "text-base" : "text-xl";

  const inner = (
    <span className="inline-flex items-center gap-2">
      <Mascot size={mascot} />
      <span className={`font-display font-extrabold tracking-tight ${text}`}>
        <span className="text-ink">Routine</span>{" "}
        <span className="text-brand">Guy</span>
      </span>
    </span>
  );

  if (href === null) return inner;
  return (
    <Link href={href} className="inline-flex shrink-0 rounded-xl transition-transform hover:-translate-y-0.5">
      {inner}
    </Link>
  );
}
