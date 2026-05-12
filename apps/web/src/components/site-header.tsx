"use client";

import Link from "next/link";
import { MouseEvent } from "react";

const links = [
  { href: "/", label: "Overview" },
  { href: "/signin", label: "Sign in" },
  { href: "/signup", label: "Create account" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/#contact", label: "Get in touch", anchorId: "contact" },
];

export function SiteHeader() {
  function handleAnchorClick(event: MouseEvent<HTMLAnchorElement>, anchorId: string) {
    // Only handle anchor scroll on the home page
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      event.preventDefault();
      const target = document.getElementById(anchorId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  return (
    <header className="header-nav container">
      <Link className="brand-mark" href="/">
        <span className="brand-seal">RA</span>
        <span>Receptionist AI</span>
      </Link>
      <nav className="nav-links">
        {links.map((link) =>
          link.anchorId ? (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleAnchorClick(e, link.anchorId)}
            >
              {link.label}
            </a>
          ) : (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}
