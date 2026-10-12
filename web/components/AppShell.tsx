"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandTitle } from "@/components/BrandTitle";
import { clearSession } from "@/lib/session";

const MENU = [
  { href: "/home", label: "דיווח נוכחות", icon: "/img/basis.png" },
  { href: "/calendar", label: "דיווחים עתידיים", icon: "/img/illus-calendar.jpg" },
  { href: "/stats", label: "ירוק בעיניים", icon: "/img/emergencyPractice.png" },
];

export function AppShell({
  showBack = false,
  showNav = true,
  /** Hide sticky header chrome (login hero carries the brand). */
  hideHeader = false,
  children,
}: {
  showBack?: boolean;
  showNav?: boolean;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className={`app-root${hideHeader ? " app-root--chromeless" : ""}`}>
      {hideHeader ? null : (
        <div className="header-section">
          <header className="header">
            {showBack ? (
              <button
                type="button"
                className="header-back"
                aria-label="חזרה"
                onClick={() => router.back()}
              />
            ) : null}
            <Link href="/home" className="brand-title-link">
              <BrandTitle />
            </Link>
            {showNav && !showBack ? (
              <button
                type="button"
                className="menu-btn"
                aria-label="תפריט"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(true)}
              >
                <Image src="/img/menuBtn.png" alt="" width={25} height={15} unoptimized />
              </button>
            ) : null}
            {showBack ? (
              <button
                type="button"
                className="header-close"
                aria-label="סגור"
                onClick={() => router.push("/home")}
              />
            ) : null}
          </header>
        </div>
      )}

      <div className="app-main">{children}</div>

      {showNav && menuOpen ? (
        <>
          <div className="backdrop-overlay active" onClick={() => setMenuOpen(false)} />
          <div className="main-menu" role="dialog" aria-modal="true" aria-label="תפריט ראשי">
            <button
              type="button"
              className="main-menu-close"
              aria-label="סגור"
              onClick={() => setMenuOpen(false)}
            />
            <ul className="main-menu-list">
              {MENU.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={pathname === item.href ? "active" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Image src={item.icon} alt="" width={22} height={22} unoptimized />
                    <span className="text">{item.label}</span>
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="menu-logout"
                  onClick={() => {
                    clearSession();
                    setMenuOpen(false);
                    router.push("/login");
                  }}
                >
                  <span className="text">התנתקות</span>
                </button>
              </li>
            </ul>
            <div className="main-menu-curve" aria-hidden />
          </div>
        </>
      ) : null}
    </div>
  );
}
