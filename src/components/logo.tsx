import { Fragment } from "react";
import { ART, BRAND_ORANGE, INK, INK_INVERSE, type LogoVariant } from "@/lib/brand-artwork";

export type { LogoVariant };
export type LogoTone = "auto" | "default" | "inverse";

/**
 * The Fourty logo, in its two lockups.
 *
 *   variant="full"      the whole lockup — the default, for anything with width
 *   variant="compact"   the 40 monogram — square and narrow surfaces: the icon
 *                       rail, favicons, avatars
 *
 * The geometry comes from brand/logo-master.svg via a generated module, so this
 * component never holds a second copy of the drawing. There is no lettered
 * substitute: never set "Fourty" in a font where the lockup belongs.
 *
 * TONE FOLLOWS THE GROUND. The letterforms are ink and vanish on a dark surface
 * while the orange stays, which reads as a broken image. `tone="auto"` (the
 * default) draws both ink layers and lets CSS keep one, so the logo is already
 * correct in the first painted frame — no theme flash, no JavaScript. Pass an
 * explicit tone only when the ground does not follow the theme.
 *
 * NEVER place either lockup on the brand orange: the O is that same orange and
 * disappears into it. Ink, white or a neutral only — which is why this component
 * takes no background of its own.
 */
export function Logo({
  variant = "full",
  tone = "auto",
  height,
  title,
  className,
}: {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Rendered height in px. Clamped up to the lockup's legible minimum. */
  height?: number;
  /** Accessible name. Omit where the surrounding control is already labelled. */
  title?: string;
  className?: string;
}) {
  const art = ART[variant];
  const h = Math.max(height ?? (variant === "full" ? 28 : 26), art.minHeight);
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
      {art.shapes.map((shape, i) => {
        // The orange never flips — only the letterforms answer to the ground.
        if (shape.orange) return <path key={i} d={shape.d} fill={BRAND_ORANGE} />;
        if (tone !== "auto") {
          return <path key={i} d={shape.d} fill={tone === "inverse" ? INK_INVERSE : INK} />;
        }
        return (
          <Fragment key={i}>
            <path d={shape.d} fill={INK} className="dark:hidden" />
            <path d={shape.d} fill={INK_INVERSE} className="hidden dark:block" />
          </Fragment>
        );
      })}
    </svg>
  );
}
