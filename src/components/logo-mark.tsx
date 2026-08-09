/**
 * The Fourty "40" monogram, inlined so it takes the surrounding text colour.
 *
 * Geometry matches `public/logo-mark.svg`: the 4 is Inter Display ExtraBold (OFL),
 * the 0 is a true circle that overshoots the cap band the way a drawn round glyph
 * would, set to just touch the 4's crossbar.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80.48 64"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <g transform="translate(-1.8 0)">
        <path d="M1.80 44.99V36.90L20.49 10.00H33.52V36.99H38.86V44.99H33.52V54.00H23.54V44.99ZM23.54 36.99V19.77H23.51L11.66 36.93V36.99Z" />
        <path d="M59.57 9.29a22.71 22.71 0 1 1-.01 0ZM59.57 20.29a11.71 11.71 0 1 0 .01 0Z" />
      </g>
    </svg>
  );
}
