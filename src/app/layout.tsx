import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Archivo, Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

// Display face for brand and editorial surfaces — never the product UI, where
// weight and tracking carry hierarchy instead. The wdth axis is what earns it a
// place: at normal width Archivo is just another grotesque, and it is the
// expanded width that echoes the wordmark. Use it with font-stretch: 125%.
// preload:false because nothing in the product UI renders this face — the logo
// is artwork, not type, and display is reserved for brand surfaces. Preloading
// would fetch it on every page for nothing; without it the browser downloads it
// only once something actually uses --font-display.
const archivo = Archivo({subsets:['latin'],axes:['wdth'],variable:'--font-display',preload:false});

export const metadata: Metadata = {
  title: { default: "Fourty", template: "%s · Fourty" },
  description: "The open-source CRM that deploys in 30 seconds.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  // sRGB approximations of --bg in each theme; meta theme-color has to be a
  // plain colour, so these are the one place a palette value is repeated.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#131110" },
  ],
};

const themeInit = `
try {
  const t = localStorage.getItem("fourty-theme");
  if (t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
} catch {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable, archivo.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
