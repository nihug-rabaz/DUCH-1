import type { Metadata } from "next";
import { Assistant, Oswald } from "next/font/google";
import { BRAND_TITLE } from "@/lib/brand";
import "./globals.css";

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-assistant",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-oswald",
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: "דו״ח 1+ — דיווח נוכחות מורחב בסגנון המקורי",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${oswald.variable}`}>
      <body className={assistant.className}>{children}</body>
    </html>
  );
}
