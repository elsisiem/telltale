/** Two offset frames whose overlap is marked: the moment data crosses from you to someone else. */
export function Logo({ size = 22, inverse }: { size?: number; inverse?: boolean }) {
  const stroke = inverse ? "#ffffff" : "#111318";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.75" y="2.75" width="11.5" height="11.5" stroke={stroke} strokeWidth="1.5" />
      <rect x="9.75" y="9.75" width="11.5" height="11.5" stroke={stroke} strokeWidth="1.5" />
      <rect x="10.5" y="10.5" width="3" height="3" fill="#FF4F00" />
    </svg>
  );
}
