import type { Metadata } from "next";
import { Rubik, Secular_One } from "next/font/google";
import { BRAND_TITLE } from "@/lib/brand";
import "./globals.css";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-rubik",
  display: "swap",
});

const secularOne = Secular_One({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-secular",
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: "דו״ח 1+ — דיווח נוכחות מורחב",
  icons: {
    icon: "/img/logo-duch1-plus.jpg",
    apple: "/img/logo-duch1-plus.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} ${secularOne.variable}`}>
      <body className={rubik.className}>{children}</body>
    </html>
  );
}
