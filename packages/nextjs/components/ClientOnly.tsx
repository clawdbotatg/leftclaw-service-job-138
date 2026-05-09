"use client";

import { useEffect, useState } from "react";

/**
 * Wrap children that depend on browser-only context (wagmi, RainbowKit, window)
 * so they only render after the client mounts. Prevents SSR/static export from
 * trying to evaluate hooks that require providers not present during prerender.
 */
export const ClientOnly = ({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
};
