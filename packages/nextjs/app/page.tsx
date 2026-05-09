"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { formatUnits } from "viem";
import { ClientOnly } from "~~/components/ClientOnly";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const RESOLUTION_LABELS = ["TrustedJudge", "PledgerVote", "Optimistic"];
const CLAIM_LABELS = ["FCFS", "OpenFirstValid", "OpenJudgePicks"];
const REFUND_LABELS = ["Refundable", "Sticky", "Burn"];
const STATUS_LABELS = ["Open", "Claimed", "Resolved", "Cancelled", "Expired"];

type BountyEvent = {
  args: {
    id?: bigint;
    creator?: string;
    descriptionCID?: string;
    deadline?: bigint;
    resolutionMode?: number;
    claimMode?: number;
    refundPolicy?: number;
    claimantBps?: number;
    treasuryBps?: number;
    burnBps?: number;
    challengeWindow?: bigint;
  };
  blockNumber?: bigint;
};

type BountyRow = {
  id: bigint;
  creator?: string;
  descriptionCID: string;
  resolutionMode: number;
  claimMode: number;
  refundPolicy: number;
  totalPledged: bigint;
  status: number;
};

const formatClawd = (amount: bigint) => {
  const whole = formatUnits(amount, 18);
  const num = Number(whole);
  if (Number.isNaN(num)) return whole;
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const truncateText = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

const BountyCard = ({ row, rank }: { row: BountyRow; rank: number }) => {
  const isTop = rank <= 3;
  const rankPad = String(rank).padStart(2, "0");

  return (
    <Link
      href={`/bounty/${row.id.toString()}`}
      className="block parchment relative overflow-hidden hover:shadow-lg transition-shadow"
      style={{ borderRadius: "0.5rem" }}
    >
      <div className="relative px-6 py-5">
        <span
          aria-hidden
          className="absolute -top-2 right-4 select-none pointer-events-none font-numeric font-black"
          style={{
            fontSize: "8rem",
            lineHeight: "1",
            color: isTop ? "#C9A84C" : "#3D2B1F",
            opacity: isTop ? 0.35 : 0.12,
          }}
        >
          {rankPad}
        </span>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2 text-xs font-numeric uppercase tracking-widest opacity-70">
            <span>file no.</span>
            <span className="font-bold">#{row.id.toString()}</span>
            <span>·</span>
            <span>{STATUS_LABELS[row.status] ?? "Unknown"}</span>
          </div>
          <h3 className="font-display text-xl md:text-2xl font-bold mb-3 max-w-[80%]">
            {truncateText(row.descriptionCID || "(no description)", 80)}
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-2">
              <span className="font-numeric uppercase text-xs tracking-widest opacity-70">Reward</span>
              <span className="amount-blood text-3xl">{formatClawd(row.totalPledged)}</span>
              <span className="font-numeric text-sm opacity-70">CLAWD</span>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <span className="stamp stamp-dark">{RESOLUTION_LABELS[row.resolutionMode] ?? "?"}</span>
              <span className="stamp stamp-dark">{CLAIM_LABELS[row.claimMode] ?? "?"}</span>
              <span className="stamp stamp-red">{REFUND_LABELS[row.refundPolicy] ?? "?"}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

const LiveBountyReader = ({
  id,
  onUpdate,
}: {
  id: bigint;
  onUpdate: (id: string, total: bigint, status: number) => void;
}) => {
  const { data } = useScaffoldReadContract({
    contractName: "MostClawdWanted",
    functionName: "bounties",
    args: [id],
  });

  useEffect(() => {
    if (!data) return;
    const tuple = data as readonly unknown[];
    const totalPledged = tuple[5] as bigint;
    const status = Number(tuple[6] as number);
    onUpdate(id.toString(), totalPledged, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return null;
};

const HomeContent = () => {
  const { data: events, isLoading } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "BountyCreated",
    fromBlock: 0n,
    watch: true,
  });

  const { data: bountyCount } = useScaffoldReadContract({
    contractName: "MostClawdWanted",
    functionName: "bountyCount",
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"reward" | "newest">("reward");
  const [totals, setTotals] = useState<Record<string, { total: bigint; status: number }>>({});

  const baseBounties = useMemo<BountyRow[]>(() => {
    if (!events) return [];
    return (events as unknown as BountyEvent[])
      .filter(e => e?.args?.id !== undefined)
      .map(e => ({
        id: e.args.id as bigint,
        creator: e.args.creator,
        descriptionCID: e.args.descriptionCID ?? "",
        resolutionMode: Number(e.args.resolutionMode ?? 0),
        claimMode: Number(e.args.claimMode ?? 0),
        refundPolicy: Number(e.args.refundPolicy ?? 0),
        totalPledged: 0n,
        status: 0,
      }));
  }, [events]);

  const handleUpdate = (id: string, total: bigint, status: number) => {
    setTotals(prev => {
      const cur = prev[id];
      if (cur && cur.total === total && cur.status === status) return prev;
      return { ...prev, [id]: { total, status } };
    });
  };

  const merged = useMemo(() => {
    return baseBounties.map(r => {
      const live = totals[r.id.toString()];
      return live ? { ...r, totalPledged: live.total, status: live.status } : r;
    });
  }, [baseBounties, totals]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return merged;
    const map: Record<string, number[]> = {
      open: [0],
      claimed: [1],
      resolved: [2],
    };
    const allowed = map[statusFilter];
    if (!allowed) return merged;
    return merged.filter(r => allowed.includes(r.status));
  }, [merged, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === "reward")
      arr.sort((a, b) => (b.totalPledged > a.totalPledged ? 1 : b.totalPledged < a.totalPledged ? -1 : 0));
    else arr.sort((a, b) => Number(b.id - a.id));
    return arr;
  }, [filtered, sortKey]);

  const showEmpty = !isLoading && baseBounties.length === 0 && bountyCount !== undefined && bountyCount === 0n;

  return (
    <div className="flex flex-col items-center w-full px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="font-display font-black text-4xl md:text-6xl tracking-tight mb-2">The Wanted List</h1>
          <p className="font-numeric uppercase tracking-[0.3em] opacity-70 text-sm">
            put a price on it. let the streets sort it out.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-6">
          <div className="flex flex-wrap items-center gap-2 font-numeric uppercase tracking-widest text-xs">
            <span className="opacity-60">filter:</span>
            <select
              className="select select-sm select-bordered"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">all status</option>
              <option value="open">open</option>
              <option value="claimed">claimed</option>
              <option value="resolved">resolved</option>
            </select>
            <span className="opacity-60 ml-2">sort:</span>
            <select
              className="select select-sm select-bordered"
              value={sortKey}
              onChange={e => setSortKey(e.target.value as "reward" | "newest")}
            >
              <option value="reward">highest reward</option>
              <option value="newest">newest</option>
            </select>
          </div>
          <Link href="/create" className="btn btn-secondary btn-sm">
            <span className="font-numeric uppercase tracking-widest">put a contract out</span>
          </Link>
        </div>

        {isLoading && baseBounties.length === 0 && (
          <div className="text-center py-16 opacity-70">
            <span className="loading loading-spinner loading-lg" />
          </div>
        )}

        {showEmpty && (
          <div className="parchment p-12 text-center">
            <p className="font-display text-2xl mb-3">the streets are quiet.</p>
            <Link href="/create" className="font-numeric uppercase tracking-widest text-secondary link">
              put a contract out →
            </Link>
          </div>
        )}

        {baseBounties.length > 0 && (
          <div className="space-y-4">
            {baseBounties.map(r => (
              <LiveBountyReader key={r.id.toString()} id={r.id} onUpdate={handleUpdate} />
            ))}
            {sorted.length === 0 ? (
              <div className="parchment p-8 text-center">
                <p className="font-display text-lg">no files match this filter.</p>
              </div>
            ) : (
              sorted.map((row, idx) => <BountyCard key={row.id.toString()} row={row} rank={idx + 1} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Home: NextPage = () => {
  return (
    <ClientOnly
      fallback={
        <div className="flex justify-center items-center w-full py-16 opacity-70">
          <span className="loading loading-spinner loading-lg" />
        </div>
      }
    >
      <HomeContent />
    </ClientOnly>
  );
};

export default Home;
