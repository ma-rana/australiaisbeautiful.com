import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./Providers";
import { SiteHeader } from "./SiteHeader";
import { getSessionUser } from "@/lib/auth";
import { headers } from "next/headers";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Australia Is Beautiful",
  description: "Discover Australia through real experiences.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  // The admin host renders its own chrome — no public header there. The host is
  // the boundary (middleware.ts), so we check it here too.
  const h = await headers();
  const hostname = (h.get("host") ?? "").split(":")[0];
  const isAdminHost =
    hostname === "admin.australiaisbeautiful.com" || hostname === "admin.localhost";

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          {!isAdminHost && <SiteHeader email={user?.email ?? null} />}
          {children}
        </Providers>
      </body>
    </html>
  );
}
