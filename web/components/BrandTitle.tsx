import { BRAND_TITLE_HE } from "@/lib/brand";

/**
 * Hebrew in Assistant (like original Narkis/Assistant fallback),
 * digits/plus in Oswald — Oswald has no Hebrew glyphs.
 */
export function BrandTitle({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-title ${className}`.trim()} aria-label={BRAND_TITLE_HE}>
      <span className="brand-wordmark">
        <span className="brand-he">דו״ח</span>
        <span className="brand-en">
          1<span className="brand-plus-inline">+</span>
        </span>
      </span>
    </span>
  );
}
