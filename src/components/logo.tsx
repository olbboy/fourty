/**
 * The Fourty logo, in its two authorised lockups.
 *
 *   variant="wordmark"  the full 4OURTY lockup — the default, and what a wide
 *                       surface should show
 *   variant="mark"      the 40 monogram — for square and collapsed contexts:
 *                       the icon rail, favicons, avatars
 *
 * Both are drawn geometry, not traced outlines and not live type. There is no
 * lettered substitute: never set "Fourty" in a font where the lockup belongs.
 *
 * TONE FOLLOWS THE GROUND. The letterforms are ink and vanish on a dark surface
 * while the orange O stays, which reads as a broken image. `tone="auto"` (the
 * default) renders both ink layers and lets CSS pick, so the logo is already
 * correct on first paint — no theme flash, no JavaScript. Pass an explicit tone
 * only when the ground does not follow the theme (an always-dark banner).
 *
 * NEVER place either lockup on the brand orange: the O is that same orange and
 * disappears into it. Ink, white or a neutral only — which is why this component
 * takes no background of its own.
 */

import { ART, BRAND_ORANGE, INK, INK_INVERSE, type LogoVariant } from "@/lib/brand-artwork";

export type { LogoVariant };

export type LogoTone = "auto" | "default" | "inverse";

export function Logo({
  variant = "wordmark",
  tone = "auto",
  height,
  title,
  className,
}: {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Rendered height in px. Clamped up to the lockup's legible minimum. */
  height?: number;
  /** Accessible name. Omit inside a control that is already labelled "Fourty". */
  title?: string;
  className?: string;
}) {
  const art = ART[variant];
  const h = Math.max(height ?? (variant === "wordmark" ? 28 : 26), art.minHeight);
  const w = (h * art.width) / art.height;

  // The size is inline, not a class and not only the width/height attributes:
  // the sidebar's menu button sets `[&_svg]:size-4` on every descendant svg, and
  // a CSS declaration beats a presentation attribute. An inline style is what
  // survives being dropped inside a control that opinionated.
  return (
    <svg
      viewBox={`0 0 ${art.width} ${art.height}`}
      width={w}
      height={h}
      style={{ width: w, height: h }}
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {/* The letterforms. In auto mode both are drawn and CSS keeps exactly one,
          so the correct lockup is present in the very first painted frame. */}
      {tone !== "inverse" && (
        <path d={art.ink} fill={INK} fillRule="evenodd" className={tone === "auto" ? "dark:hidden" : undefined} />
      )}
      {tone !== "default" && (
        <path
          d={art.ink}
          fill={INK_INVERSE}
          fillRule="evenodd"
          className={tone === "auto" ? "hidden dark:block" : undefined}
        />
      )}
      {/* The O is the brand orange in both tones — it never flips. */}
      <path d={art.o} fill={BRAND_ORANGE} fillRule="evenodd" />
    </svg>
  );
}
