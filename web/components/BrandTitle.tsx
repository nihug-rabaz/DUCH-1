import { BRAND_TITLE_HE } from "@/lib/brand";

/** Heebo wordmark + gradient plus — HOGER-like polish, דו״ח 1+ identity. */
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
