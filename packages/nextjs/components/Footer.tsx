"use client";

import React from "react";
import { Address } from "@scaffold-ui/components";
import { base } from "viem/chains";
import { ClientOnly } from "~~/components/ClientOnly";

const CONTRACT_ADDRESS = "0xDC03A2B68b56dF719aE1f51930bb790e33aDe595";

/**
 * Site footer
 */
export const Footer = () => {
  return (
    <div className="px-4 py-6" style={{ borderTop: "1px solid #3D2B1F" }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
        <div className="flex items-center gap-2 font-numeric uppercase tracking-widest opacity-80">
          <span>MOST CLAWD WANTED</span>
          <span>—</span>
          <span>on Base</span>
        </div>
        <div className="flex items-center gap-3">
          <ClientOnly
            fallback={
              <span className="font-numeric text-xs opacity-50">
                {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}
              </span>
            }
          >
            <Address
              address={CONTRACT_ADDRESS as `0x${string}`}
              chain={base}
              blockExplorerAddressLink={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
              size="xs"
            />
          </ClientOnly>
          <span className="opacity-50">·</span>
          <a
            href={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="link font-numeric uppercase tracking-widest text-xs"
          >
            basescan
          </a>
        </div>
      </div>
    </div>
  );
};
