import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { BRAND_TITLE } from "@/lib/brand";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: "דו״ח 1+ — דיווח נוכחות מורחב",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className={heebo.className}>{children}</body>
    </html>
  );
}
