import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fourty CRM",
    short_name: "Fourty",
    description: "The open-source CRM that deploys in 30 seconds.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0f1a",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
