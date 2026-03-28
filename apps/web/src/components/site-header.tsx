import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/signin", label: "Sign in" },
  { href: "/signup", label: "Create account" },
  { href: "/onboarding", label: "Onboarding" },
];

export function SiteHeader() {
  return (
    <header className="header-nav container">
      <Link className="brand-mark" href="/">
        <span className="brand-seal">RA</span>
        <span>Receptionist AI</span>
      </Link>
      <nav className="nav-links">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
