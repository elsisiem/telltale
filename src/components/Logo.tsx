/** Two offset frames whose overlap is marked: the moment data crosses from you to someone else. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="text-ink">
      <rect x="2.75" y="2.75" width="11.5" height="11.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.75" y="9.75" width="11.5" height="11.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="10.5" width="3" height="3" style={{ fill: "var(--color-accent)" }} />
    </svg>
  );
}
