"use client";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { api } from "@/lib/client";
import { initializeH5, h5ScriptFailed, type H5Config } from "@/lib/h5-ads";
import { useSession } from "@/lib/session";

export default function AdSense() {
  return (
    <Suspense fallback={null}>
      <AdSenseScript />
    </Suspense>
  );
}

function AdSenseScript() {
  const pathname = usePathname();
  const mode = useSearchParams().get("mode");
  const localGame =
    pathname === "/play" && (mode === "practice" || mode === "tutorial");
  const { me, loading } = useSession();
  const playerId = me?.id;
  const premium = me?.premium;
  const [config, setConfig] = useState<H5Config | null>(null);
  useEffect(() => {
    if (loading || !playerId || premium || localGame) {
      setConfig(null);
      return;
    }
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
  }, [pathname, loading, playerId, premium, localGame]);
  if (!config || loading || !me || me.premium || localGame) return null;
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
