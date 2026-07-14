import type { Metadata } from "next";
import { openDb } from "@signalwork/engine";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { selectedBrandId } from "@/lib/brand";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signalwork — Radar",
  description: "Trend-to-content engine",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = openDb();
  const brands = db.listBrands();
  db.close();
  const selected = await selectedBrandId(brands);
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="masthead">
            <a href="/" className="wordmark">
              signal<b>work</b>
            </a>
            <div className="masthead-right">
              <nav className="masthead-nav">
                <a href="/">Radar</a>
                <a href="/queue">Queue</a>
                <a href="/pulse">Pulse</a>
                <a href="/ingest">Ingest</a>
                <a href="/voices">Voices</a>
                <a href="/brands">Brands</a>
              </nav>
              <BrandSwitcher
                brands={brands.map((b) => ({ id: b.id, name: b.name }))}
                selected={selected}
              />
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
