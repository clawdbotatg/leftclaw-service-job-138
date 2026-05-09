"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { base } from "viem/chains";
import { useAccount } from "wagmi";
import { ClientOnly } from "~~/components/ClientOnly";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

type EventLike<T = any> = { args: T };

const RapSheetContent = () => {
  const { address: connectedAddress } = useAccount();

  const lcAddr = connectedAddress?.toLowerCase();

  const { data: created } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "BountyCreated",
    fromBlock: 0n,
    watch: false,
  });

  const { data: pledged } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "Pledged",
    fromBlock: 0n,
    watch: false,
  });

  const { data: claimed } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "Claimed",
    fromBlock: 0n,
    watch: false,
  });

  const { data: judges } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "JudgeNominated",
    fromBlock: 0n,
    watch: false,
  });

  const { data: finalized } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "Finalized",
    fromBlock: 0n,
    watch: false,
  });

  const stats = useMemo(() => {
    if (!lcAddr) return { posted: 0, pledged: 0, judging: 0, claiming: 0, won: 0 };
    const matchAddr = (a?: string) => !!a && a.toLowerCase() === lcAddr;
    const postedSet = new Set<string>();
    for (const e of (created as unknown as EventLike<{ id?: bigint; creator?: string }>[]) ?? []) {
      if (matchAddr(e.args?.creator) && e.args?.id !== undefined) postedSet.add(e.args.id.toString());
    }
    const pledgedSet = new Set<string>();
    for (const e of (pledged as unknown as EventLike<{ bountyId?: bigint; pledger?: string }>[]) ?? []) {
      if (matchAddr(e.args?.pledger) && e.args?.bountyId !== undefined) pledgedSet.add(e.args.bountyId.toString());
    }
    const claimingSet = new Set<string>();
    for (const e of (claimed as unknown as EventLike<{ bountyId?: bigint; claimant?: string }>[]) ?? []) {
      if (matchAddr(e.args?.claimant) && e.args?.bountyId !== undefined) claimingSet.add(e.args.bountyId.toString());
    }
    const judgingSet = new Set<string>();
    for (const e of (judges as unknown as EventLike<{ bountyId?: bigint; judge?: string }>[]) ?? []) {
      if (matchAddr(e.args?.judge) && e.args?.bountyId !== undefined) judgingSet.add(e.args.bountyId.toString());
    }
    const wonSet = new Set<string>();
    for (const e of (finalized as unknown as EventLike<{ bountyId?: bigint; winner?: string }>[]) ?? []) {
      if (matchAddr(e.args?.winner) && e.args?.bountyId !== undefined) wonSet.add(e.args.bountyId.toString());
    }
    return {
      posted: postedSet.size,
      pledged: pledgedSet.size,
      judging: judgingSet.size,
      claiming: claimingSet.size,
      won: wonSet.size,
    };
  }, [lcAddr, created, pledged, claimed, judges, finalized]);

  const empty =
    stats.posted === 0 && stats.pledged === 0 && stats.judging === 0 && stats.claiming === 0 && stats.won === 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="font-display font-black text-4xl md:text-6xl tracking-tight mb-2">My Rap Sheet</h1>
        <p className="font-numeric uppercase tracking-[0.3em] opacity-70 text-sm">
          everything the chain remembers about you.
        </p>
      </div>

      {!connectedAddress ? (
        <div className="parchment p-8 text-center">
          <p className="font-display text-2xl mb-3">no wallet, no record.</p>
          <RainbowKitCustomConnectButton />
        </div>
      ) : (
        <>
          <div className="parchment p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <Address address={connectedAddress} chain={base} size="lg" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <StatPill label="posted" value={stats.posted} />
              <StatPill label="pledged" value={stats.pledged} />
              <StatPill label="judging" value={stats.judging} />
              <StatPill label="claiming" value={stats.claiming} />
              <StatPill label="won" value={stats.won} />
            </div>
          </div>

          {empty ? (
            <div className="parchment p-12 text-center">
              <p className="font-display text-2xl mb-3">no record found.</p>
              <p className="opacity-70 mb-4">you&apos;re either clean or new.</p>
              <Link href="/create" className="link font-numeric uppercase tracking-widest">
                put a contract out →
              </Link>
            </div>
          ) : (
            <div className="parchment p-6">
              <h2 className="font-display text-2xl mb-3">Reputation</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th className="font-numeric uppercase tracking-widest text-xs">metric</th>
                    <th className="font-numeric uppercase tracking-widest text-xs">value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Bounties posted</td>
                    <td className="font-numeric font-bold">{stats.posted}</td>
                  </tr>
                  <tr>
                    <td>Bounties pledged to</td>
                    <td className="font-numeric font-bold">{stats.pledged}</td>
                  </tr>
                  <tr>
                    <td>Bounties claiming</td>
                    <td className="font-numeric font-bold">{stats.claiming}</td>
                  </tr>
                  <tr>
                    <td>Bounties judging</td>
                    <td className="font-numeric font-bold">{stats.judging}</td>
                  </tr>
                  <tr>
                    <td>Bounties won</td>
                    <td className="font-numeric font-bold">{stats.won}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const StatPill = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-base-200 text-base-content rounded-md p-3 text-center" style={{ borderRadius: "0.5rem" }}>
    <div className="font-numeric text-2xl font-bold">{value}</div>
    <div className="font-numeric uppercase tracking-widest text-[0.65rem] opacity-70">{label}</div>
  </div>
);

const RapSheetPage: NextPage = () => (
  <ClientOnly
    fallback={
      <div className="max-w-3xl mx-auto px-4 py-16 text-center opacity-70">
        <span className="loading loading-spinner loading-lg" />
      </div>
    }
  >
    <RapSheetContent />
  </ClientOnly>
);

export default RapSheetPage;
