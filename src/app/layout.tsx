import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Display: characterful + artistic. Body: friendly + highly legible.
// Mono: times and codes. Deliberately not Inter/Geist/Roboto.
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const sans = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const mono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Routine Guy — your class schedule, handled",
  description:
    "Build your section's weekly routine once. Routine Guy posts tomorrow's classes to your Discord every night — automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      {/* `.grain` paints a fixed film-grain overlay above the page (::after) */}
      <body className="grain flex min-h-full flex-col">{children}</body>
    </html>
  );
}
