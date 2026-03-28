import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Receptionist AI",
  description: "AI receptionist platform for calls, orders, and scheduling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
