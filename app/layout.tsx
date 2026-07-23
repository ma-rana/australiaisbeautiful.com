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
      <body className="flex h-screen flex-col overflow-hidden">
        <Providers>
          {!isAdminHost && <SiteHeader email={user?.email ?? null} />}
          {/* min-h-0 lets a flex child actually shrink — without it a full-height
              child (the map) pushes the layout past the viewport.

              scrollbar-gutter isn't used and overflow is `auto` rather than
              `scroll`, so no space is reserved when there's nothing to scroll.
              Reserving it narrowed the map's container and left a white strip
              down the right edge. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
