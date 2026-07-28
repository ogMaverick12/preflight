import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preflight",
  description: "Commit analysis before takeoff.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
