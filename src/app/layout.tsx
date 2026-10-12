import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

// One typeface. The display role in globals.css points here too: the lockup is
// drawn artwork whose own typeface is unrelated to the product's, so there is
// nothing for a second family to echo.
const inter = Inter({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="en" suppressHydrationWarning className={cn("font-sans", inter.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
