"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { api } from "@/lib/client";
import { initializeH5, h5ScriptFailed, type H5Config } from "@/lib/h5-ads";

export default function AdSense() {
  const pathname = usePathname();
  const [config, setConfig] = useState<H5Config | null>(null);
  useEffect(() => {
    if (pathname !== "/play" && pathname !== "/settings") return;
    let disposed = false;
    api<H5Config>("/api/ad/config")
      .then((c) => {
        if (!disposed && initializeH5(c)) setConfig(c);
      })
      .catch(() => {
        /* SDK failure falls back to the pregame wait. */
      });
    return () => {
      disposed = true;
    };
  }, [pathname]);
  if (!config) return null;
  return (
    <Script
      id="adsense-h5"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.clientId}`}
      crossOrigin="anonymous"
      data-ad-client={config.clientId}
      data-adbreak-test={config.testMode ? "on" : undefined}
      onError={h5ScriptFailed}
    />
  );
}
