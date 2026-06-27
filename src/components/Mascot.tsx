// "Guy" — the Routine Guy mascot. A friendly clipboard-creature, drawn in
// pure SVG and themed from CSS variables so it sits right in light and dark.
// No client JS; safe to render anywhere. Add `animate-float` for a gentle bob.

type MascotProps = {
  size?: number;
  className?: string;
  /** Eyes follow a touch toward "up" when waving — used in celebratory spots. */
  mood?: "happy" | "wave";
  title?: string;
};

export default function Mascot({
  size = 96,
  className,
  mood = "happy",
  title = "Routine Guy",
}: MascotProps) {
  const pupilY = mood === "wave" ? 49 : 52;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      className={className}
      style={{ overflow: "visible" }}
    >
      <title>{title}</title>

      {/* antenna + gold spark — the playful bit */}
      <line x1="60" y1="22" x2="60" y2="10" stroke="var(--brand-press)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="60" cy="7" r="5" fill="var(--gold)" stroke="var(--gold-deep)" strokeWidth="1.5" />

      {/* depth edge behind the body */}
      <rect x="18" y="26" width="84" height="82" rx="26" fill="var(--brand-press)" />
      {/* body */}
      <rect x="18" y="22" width="84" height="82" rx="26" fill="var(--brand)" />

      {/* eyes */}
      <circle cx="45" cy="52" r="10" fill="#fff" />
      <circle cx="75" cy="52" r="10" fill="#fff" />
      <circle cx="46" cy={pupilY} r="4.4" fill="#241f2e" />
      <circle cx="76" cy={pupilY} r="4.4" fill="#241f2e" />
      {/* eye sparkle */}
      <circle cx="48" cy={pupilY - 2} r="1.4" fill="#fff" />
      <circle cx="78" cy={pupilY - 2} r="1.4" fill="#fff" />

      {/* cheeks */}
      <circle cx="33" cy="66" r="5.5" fill="var(--gold)" opacity="0.55" />
      <circle cx="87" cy="66" r="5.5" fill="var(--gold)" opacity="0.55" />

      {/* smile */}
      <path d="M49 68 Q60 79 71 68" fill="none" stroke="#241f2e" strokeWidth="3.5" strokeLinecap="round" />

      {/* little schedule card the Guy holds — three colored slot ticks */}
      <rect x="40" y="84" width="40" height="14" rx="4" fill="var(--surface)" stroke="var(--brand-press)" strokeWidth="1.5" />
      <rect x="44" y="88" width="9" height="6" rx="2" fill="var(--mint)" />
      <rect x="55.5" y="88" width="9" height="6" rx="2" fill="var(--gold)" />
      <rect x="67" y="88" width="9" height="6" rx="2" fill="var(--sky)" />
    </svg>
  );
}
