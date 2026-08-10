import { Logo } from "fourty";

// The two lockups. `full` is the default and belongs on anything with width;
// `compact` is the 40 monogram, for square and narrow surfaces — an icon rail,
// a favicon, an avatar slot.
export const Lockups = () => (
  <div style={{ display: "grid", gap: 20, alignItems: "start" }}>
    <Logo variant="full" height={34} title="Fourty" />
    <Logo variant="compact" height={30} title="Fourty" />
  </div>
);

// Tone follows the ground. The default renders both ink layers and lets CSS
// keep one, so the lockup is correct in the first painted frame; pass an
// explicit tone only where the ground does not follow the theme — as here.
export const OnInk = () => (
  <div style={{ background: "#1d1916", padding: 24, borderRadius: 14 }}>
    <Logo variant="full" tone="inverse" height={30} title="Fourty" />
  </div>
);

// Never place a lockup on the brand orange: the O is that same orange and
// disappears into it, leaving "4 URTY". Ink, white or a neutral only.
export const Sizes = () => (
  <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
    <Logo variant="compact" height={16} title="Fourty" />
    <Logo variant="compact" height={24} title="Fourty" />
    <Logo variant="compact" height={40} title="Fourty" />
  </div>
);
