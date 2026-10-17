"use client";

import Link from "next/link";
import { LanguageSelect } from "./LanguageSelect";

export function SiteHeader() {
  return (
    <header className="siteHeader">
      <div className="siteHeaderInner">
        <Link href="/" className="siteBrand" aria-label="Fuel by NorbApp">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
          <img src="/icons/icon.svg" alt="" width={36} height={36} />
          <span>
            <strong>Fuel</strong>
            <small>by NorbApp</small>
          </span>
        </Link>
        <LanguageSelect />
      </div>
    </header>
  );
}
