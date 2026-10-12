import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fourty CRM",
    short_name: "Fourty",
    description: "The open-source CRM that deploys in 30 seconds.",
    start_url: "/dashboard",
    display: "standalone",
    // sRGB approximations of the palette: --bg in dark, and the brand mark's
    // own orange. A manifest cannot read custom properties, so these are the
    // one place outside globals.css that repeats a palette value.
    background_color: "#131110",
    theme_color: "#fb631a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
