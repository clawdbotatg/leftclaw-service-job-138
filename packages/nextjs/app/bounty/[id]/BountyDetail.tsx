"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { formatUnits, maxUint256, parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount } from "wagmi";
import { ClientOnly } from "~~/components/ClientOnly";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const RESOLUTION_LABELS = ["TrustedJudge", "PledgerVote", "Optimistic"];
const CLAIM_LABELS = ["FCFS", "OpenFirstValid", "OpenJudgePicks"];
const REFUND_LABELS = ["Refundable", "Sticky", "Burn"];
const STATUS_LABELS = ["Open", "Claimed", "Resolved", "Cancelled", "Expired"];

const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07" as const;
const CONTRACT_ADDRESS = "0xDC03A2B68b56dF719aE1f51930bb790e33aDe595" as const;

const formatClawd = (amount: bigint) => {
  const whole = formatUnits(amount, 18);
  const num = Number(whole);
  if (Number.isNaN(num)) return whole;
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const relativeTime = (ts: bigint) => {
  if (!ts) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(ts) - now;
  const abs = Math.abs(diff);
  const past = diff < 0;
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
  ];
  let val = abs;
  let unit = "second";
  for (const [div, name] of units) {
    if (val < div) {
      unit = name;
      break;
    }
    val = val / div;
    unit = name;
  }
  const rounded = Math.floor(val);
  const plural = rounded === 1 ? unit : `${unit}s`;
  return past ? `${rounded} ${plural} ago` : `in ${rounded} ${plural}`;
};

const useBountyIdFromPath = () => {
  const [id, setId] = useState<bigint | null>(null);
  const [raw, setRaw] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("bounty");
    const candidate = idx >= 0 ? parts[idx + 1] : "";
    setRaw(candidate || "");
    if (candidate && /^\d+$/.test(candidate)) {
      try {
        setId(BigInt(candidate));
      } catch {
        setId(null);
      }
    }
  }, []);

  return { id, raw };
};

const BountyDetailInner = () => {
  const { id: bountyId, raw } = useBountyIdFromPath();
  const { address: connectedAddress, chain: accountChain } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  const { data: bounty } = useScaffoldReadContract({
    contractName: "MostClawdWanted",
    functionName: "bounties",
    args: [bountyId ?? undefined],
  });

  const { data: events } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "BountyCreated",
    fromBlock: 0n,
    filters: bountyId !== null ? { id: bountyId } : undefined,
    watch: false,
  });

  const { data: pledgedEvents } = useScaffoldEventHistory({
    contractName: "MostClawdWanted",
    eventName: "Pledged",
    fromBlock: 0n,
    filters: bountyId !== null ? { bountyId } : undefined,
    watch: true,
  });

  // CLAWD allowance
  const { data: clawdAllowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [connectedAddress, CONTRACT_ADDRESS],
  });

  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [connectedAddress],
  });

  const { writeContractAsync: writeClawd } = useScaffoldWriteContract({ contractName: "CLAWD" });
  const { writeContractAsync: writeBounty, isMining } = useScaffoldWriteContract({
    contractName: "MostClawdWanted",
  });

  const [pledgeAmount, setPledgeAmount] = useState<string>("");
  const [proofCID, setProofCID] = useState<string>("");

  // Two-state approval protection
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalCooldown, setApprovalCooldown] = useState(false);

  const creator = bounty ? (bounty[1] as `0x${string}`) : undefined;
  const descriptionCID = bounty ? (bounty[2] as string) : "";
  const createdAt = bounty ? (bounty[3] as bigint) : 0n;
  const deadline = bounty ? (bounty[4] as bigint) : 0n;
  const totalPledged = bounty ? (bounty[5] as bigint) : 0n;
  const status = bounty ? Number(bounty[6] as number) : 0;
  const resolutionMode = bounty ? Number(bounty[7] as number) : 0;
  const judge = bounty ? (bounty[8] as `0x${string}` | undefined) : undefined;
  const claimMode = bounty ? Number(bounty[11] as number) : 0;
  const currentClaimant = bounty ? (bounty[12] as `0x${string}` | undefined) : undefined;
  const refundPolicy = bounty ? Number(bounty[14] as number) : 0;
  const claimantBps = bounty ? Number(bounty[16] as number) : 0;
  const treasuryBps = bounty ? Number(bounty[17] as number) : 0;
  const burnBps = bounty ? Number(bounty[18] as number) : 0;
  const challengeWindow = bounty ? (bounty[20] as bigint) : 0n;

  const pledgerCount = useMemo(() => {
    if (!pledgedEvents) return 0;
    const set = new Set<string>();
    for (const ev of pledgedEvents as unknown as { args: { pledger?: string } }[]) {
      if (ev.args?.pledger) set.add(ev.args.pledger.toLowerCase());
    }
    return set.size;
  }, [pledgedEvents]);

  const pledgeAmountWei = useMemo(() => {
    if (!pledgeAmount) return 0n;
    try {
      return parseUnits(pledgeAmount, 18);
    } catch {
      return 0n;
    }
  }, [pledgeAmount]);

  const needsApproval = useMemo(() => {
    if (!clawdAllowance || pledgeAmountWei === 0n) return pledgeAmountWei > 0n;
    return (clawdAllowance as bigint) < pledgeAmountWei;
  }, [clawdAllowance, pledgeAmountWei]);

  const handleApprove = async () => {
    if (approvalSubmitting || approvalCooldown) return;
    try {
      setApprovalSubmitting(true);
      await writeClawd({
        functionName: "approve",
        args: [CONTRACT_ADDRESS, maxUint256],
      });
      setApprovalCooldown(true);
      setTimeout(() => setApprovalCooldown(false), 4000);
      await refetchAllowance();
    } catch (e) {
      notification.error("Approval failed");
      console.error(e);
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handlePledge = async () => {
    if (!bountyId || pledgeAmountWei === 0n) return;
    try {
      await writeBounty({
        functionName: "pledge",
        args: [bountyId, pledgeAmountWei],
      });
      setPledgeAmount("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleClaim = async () => {
    if (!bountyId) return;
    try {
      await writeBounty({ functionName: "claim", args: [bountyId] });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitProof = async () => {
    if (!bountyId || !proofCID.trim()) return;
    try {
      await writeBounty({ functionName: "submitProof", args: [bountyId, proofCID.trim()] });
      setProofCID("");
    } catch (e) {
      console.error(e);
    }
  };

  const eventDescriptionCID = useMemo(() => {
    if (!events || events.length === 0) return "";
    const first = (events as unknown as { args: { descriptionCID?: string } }[])[0];
    return first?.args?.descriptionCID ?? "";
  }, [events]);

  const displayDescription = descriptionCID || eventDescriptionCID;

  if (raw && bountyId === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-3xl mb-2">case file not found.</h1>
        <p className="opacity-70 mb-6">that path doesn&apos;t look like a valid file number.</p>
        <Link href="/" className="link font-numeric uppercase tracking-widest">
          ← back to the wanted list
        </Link>
      </div>
    );
  }

  if (bountyId === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center opacity-70">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const wrongNetwork = !!connectedAddress && accountChain?.id !== targetNetwork.id;
  const settingsSummary = `Resolution: ${RESOLUTION_LABELS[resolutionMode] ?? "?"} · Claim: ${
    CLAIM_LABELS[claimMode] ?? "?"
  } · Refund: ${REFUND_LABELS[refundPolicy] ?? "?"} · Split: ${claimantBps / 100}/${treasuryBps / 100}/${
    burnBps / 100
  }`;

  const canClaim =
    status === 0 &&
    (claimMode === 0 || claimMode === 1 || claimMode === 2) &&
    !!connectedAddress &&
    deadline > 0n &&
    BigInt(Math.floor(Date.now() / 1000)) < deadline;

  const isClaimedByMe =
    status === 1 &&
    currentClaimant &&
    connectedAddress &&
    currentClaimant.toLowerCase() === connectedAddress.toLowerCase();

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <Link href="/" className="link font-numeric uppercase tracking-widest text-xs opacity-70">
          ← the wanted list
        </Link>
      </div>

      <div className="parchment relative px-8 py-10 mb-8 overflow-hidden">
        <div className="text-center mb-6">
          <p className="font-numeric uppercase tracking-[0.4em] text-xs opacity-70">file no. #{bountyId.toString()}</p>
          <h1 className="font-display font-black text-5xl md:text-7xl tracking-tight my-2">WANTED</h1>
          <span className="stamp stamp-red text-sm">{STATUS_LABELS[status] ?? "Unknown"}</span>
        </div>

        <h2 className="font-display text-xl md:text-2xl text-center mb-6">
          {displayDescription || "(no description)"}
        </h2>

        <div className="text-center mb-6">
          <div className="font-numeric uppercase tracking-widest text-xs opacity-70">Reward</div>
          <div className="amount-blood text-5xl md:text-6xl">{formatClawd(totalPledged)}</div>
          <div className="font-numeric text-sm opacity-70">CLAWD</div>
        </div>

        <div
          className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-numeric uppercase tracking-widest border-t border-b py-4 my-4"
          style={{ borderColor: "#3D2B1F" }}
        >
          <div>
            <div className="opacity-60 mb-1">pledgers</div>
            <div className="text-base font-bold">{pledgerCount}</div>
          </div>
          <div>
            <div className="opacity-60 mb-1">posted</div>
            <div className="text-base font-bold">{createdAt > 0n ? relativeTime(createdAt) : "—"}</div>
          </div>
          <div>
            <div className="opacity-60 mb-1">deadline</div>
            <div className="text-base font-bold">{deadline > 0n ? relativeTime(deadline) : "—"}</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="opacity-60 font-numeric uppercase tracking-widest text-xs mb-1">posted by</div>
          {creator && <Address address={creator} chain={base} size="sm" />}
        </div>

        <div className="text-sm opacity-80 mb-2">{settingsSummary}</div>
        {challengeWindow > 0n && (
          <div className="text-xs opacity-70">Challenge window: {Number(challengeWindow) / 86400} days</div>
        )}
      </div>

      <div className="parchment px-6 py-6 mb-6">
        <h3 className="font-display text-2xl mb-4">Pledge to this contract</h3>

        {!connectedAddress ? (
          <div>
            <p className="opacity-80 mb-3">Connect your wallet to pledge CLAWD.</p>
            <RainbowKitCustomConnectButton />
          </div>
        ) : wrongNetwork ? (
          <div>
            <p className="opacity-80 mb-3">Wrong network. Switch to Base.</p>
            <RainbowKitCustomConnectButton />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <input
                className="input input-bordered w-full font-numeric"
                type="number"
                step="0.000001"
                min="0"
                placeholder="amount in CLAWD"
                value={pledgeAmount}
                onChange={e => setPledgeAmount(e.target.value)}
              />
              <span className="font-numeric uppercase tracking-widest text-xs opacity-70">CLAWD</span>
            </div>
            <div className="text-xs opacity-60">
              your balance: {clawdBalance ? formatClawd(clawdBalance as bigint) : "0"} CLAWD
            </div>
            <div className="flex gap-2">
              {needsApproval ? (
                <button
                  className="btn btn-secondary flex-1"
                  disabled={approvalSubmitting || approvalCooldown || pledgeAmountWei === 0n}
                  onClick={handleApprove}
                >
                  {(approvalSubmitting || approvalCooldown) && <span className="loading loading-spinner loading-sm" />}
                  <span className="font-numeric uppercase tracking-widest">
                    {approvalSubmitting ? "approving" : approvalCooldown ? "confirming" : "approve clawd"}
                  </span>
                </button>
              ) : (
                <button
                  className="btn btn-primary flex-1"
                  disabled={isMining || pledgeAmountWei === 0n || status !== 0}
                  onClick={handlePledge}
                >
                  {isMining && <span className="loading loading-spinner loading-sm" />}
                  <span className="font-numeric uppercase tracking-widest">pledge</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {status === 0 && canClaim && (
        <div className="parchment px-6 py-6 mb-6">
          <h3 className="font-display text-2xl mb-3">Stake a claim</h3>
          <p className="opacity-80 mb-4 text-sm">
            Claim mode: <strong>{CLAIM_LABELS[claimMode]}</strong>. Claiming locks the bounty to you (or adds you to the
            queue depending on mode) so you can submit proof.
          </p>
          <button
            className="btn btn-secondary"
            disabled={isMining || !connectedAddress || wrongNetwork}
            onClick={handleClaim}
          >
            {isMining && <span className="loading loading-spinner loading-sm" />}
            <span className="font-numeric uppercase tracking-widest">claim it</span>
          </button>
        </div>
      )}

      {(status === 1 || isClaimedByMe) && (
        <div className="parchment px-6 py-6 mb-6">
          <h3 className="font-display text-2xl mb-3">Submit proof</h3>
          <p className="opacity-80 mb-3 text-sm">Paste the IPFS CID of your proof. The judge / pledgers will review.</p>
          <div className="flex flex-col gap-3">
            <input
              className="input input-bordered w-full font-numeric"
              placeholder="Qm... or bafy..."
              value={proofCID}
              onChange={e => setProofCID(e.target.value)}
            />
            <button
              className="btn btn-primary"
              disabled={isMining || !connectedAddress || wrongNetwork || !proofCID.trim()}
              onClick={handleSubmitProof}
            >
              {isMining && <span className="loading loading-spinner loading-sm" />}
              <span className="font-numeric uppercase tracking-widest">submit proof</span>
            </button>
          </div>
        </div>
      )}

      {judge && judge !== "0x0000000000000000000000000000000000000000" && (
        <div className="parchment px-6 py-6 mb-6">
          <h3 className="font-display text-2xl mb-3">Judge</h3>
          <Address address={judge} chain={base} size="sm" />
        </div>
      )}

      <div className="text-xs opacity-50 font-numeric uppercase tracking-widest text-center">
        contract: {CLAWD_ADDRESS.slice(0, 6)}…{CLAWD_ADDRESS.slice(-4)}
      </div>
    </div>
  );
};

const BountyDetail = () => (
  <ClientOnly
    fallback={
      <div className="max-w-3xl mx-auto px-4 py-16 text-center opacity-70">
        <span className="loading loading-spinner loading-lg" />
      </div>
    }
  >
    <BountyDetailInner />
  </ClientOnly>
);

export default BountyDetail;
