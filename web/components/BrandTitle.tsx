import { BrandMark } from "@/components/BrandMark";
import { BRAND_TITLE_HE } from "@/lib/brand";

/** Brand mark + Hebrew wordmark for דו״ח 1+. */
export function BrandTitle({
  className = "",
  mark = true,
}: {
  className?: string;
  /** Show the 1+ badge mark beside the wordmark. */
  mark?: boolean;
}) {
  return (
    <span className={`brand-title ${className}`.trim()} aria-label={BRAND_TITLE_HE}>
      {mark ? (
        <span className="brand-mark" aria-hidden="true">
          <BrandMark />
        </span>
      ) : null}
      <span className="brand-wordmark">
        <span className="brand-he">דו״ח</span>
        <span className="brand-plus">1+</span>
      </span>
    </span>
  );
}
