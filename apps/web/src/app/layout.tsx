import type { Metadata } from "next";
import {
  Noto_Sans,
  Courier_Prime,
  Hanken_Grotesk,
  Inter,
  Instrument_Serif,
} from "next/font/google";
import "./globals.css";
import { SessionLostModal } from "@/components/session-lost-modal";

// Noto Sans is the candidate-facing UI typeface; Courier Prime is used for IDs.
const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
});

/*
 * Inter and Instrument Serif belong to the public marketing site (`/`),
 * which is its own visual world: the product consoles keep Noto Sans and
 * Hanken Grotesk. Loaded here because next/font must be initialised at
 * module scope in a layout, and the root layout is the only one every route
 * passes through.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Display face for the marketing headlines only.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

// Hanken Grotesk is the admin console's typeface (/admin/*).
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Codonmind Nexus",
  description: "NTA-style computer-based test platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${notoSans.variable} ${courierPrime.variable} ${hankenGrotesk.variable} ${inter.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        {/* Mounted once, so a dead session is explained the same way on every
            screen instead of surfacing as an unexplained error wherever a
            request happened to be in flight. */}
        <SessionLostModal />
      </body>
    </html>
  );
}
