/** Crisp SVG mark for דו״ח 1+ — credential blue badge with 1+. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`brand-mark-svg ${className}`.trim()}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="11" fill="#1F4E8C" />
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="Rubik, Arial, sans-serif"
        fontWeight="800"
        fontSize="15"
        letterSpacing="-0.4"
        style={{ direction: "ltr", unicodeBidi: "isolate" }}
      >
        {"1+"}
      </text>
    </svg>
  );
}
