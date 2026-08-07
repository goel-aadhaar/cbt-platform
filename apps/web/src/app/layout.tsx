import type { Metadata } from "next";
import { Noto_Sans, Courier_Prime, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

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

// Hanken Grotesk is the admin console's typeface (/admin/*).
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DRSK Assessment Portal",
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
      className={`${notoSans.variable} ${courierPrime.variable} ${hankenGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
