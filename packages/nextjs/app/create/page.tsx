"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddressInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { ClientOnly } from "~~/components/ClientOnly";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type ResolutionMode = 0 | 1 | 2;
type ClaimMode = 0 | 1 | 2;
type RefundPolicy = 0 | 1 | 2;

type Preset = {
  name: string;
  tagline: string;
  resolutionMode: ResolutionMode;
  claimMode: ClaimMode;
  refundPolicy: RefundPolicy;
  claimantBps: number;
  treasuryBps: number;
  burnBps: number;
};

const PRESETS: Preset[] = [
  {
    name: "Quick Task",
    tagline: "TrustedJudge · FCFS · Refundable · 85/10/5",
    resolutionMode: 0,
    claimMode: 0,
    refundPolicy: 0,
    claimantBps: 8500,
    treasuryBps: 1000,
    burnBps: 500,
  },
  {
    name: "Community Vote",
    tagline: "PledgerVote · OpenJudgePicks · Refundable · 80/10/10",
    resolutionMode: 1,
    claimMode: 2,
    refundPolicy: 0,
    claimantBps: 8000,
    treasuryBps: 1000,
    burnBps: 1000,
  },
  {
    name: "Set & Forget",
    tagline: "Optimistic · OpenFirstValid · Sticky · 90/5/5",
    resolutionMode: 2,
    claimMode: 1,
    refundPolicy: 1,
    claimantBps: 9000,
    treasuryBps: 500,
    burnBps: 500,
  },
];

const CreateForm = () => {
  const router = useRouter();
  const { address: connectedAddress, chain: accountChain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "MostClawdWanted" });

  const [descriptionCID, setDescriptionCID] = useState("");
  const [deadlineStr, setDeadlineStr] = useState("");
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>(0);
  const [judge, setJudge] = useState<string>("");
  const [judgeVetoWindowDays, setJudgeVetoWindowDays] = useState<number>(2);
  const [claimMode, setClaimMode] = useState<ClaimMode>(0);
  const [claimWindowHours, setClaimWindowHours] = useState<number>(24);
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicy>(0);
  const [claimantBps, setClaimantBps] = useState<number>(8500);
  const [treasuryBps, setTreasuryBps] = useState<number>(1000);
  const [burnBps, setBurnBps] = useState<number>(500);
  const [pledgerOverrideBps, setPledgerOverrideBps] = useState<number>(2500);
  const [challengeWindowDays, setChallengeWindowDays] = useState<number>(3);

  const totalBps = claimantBps + treasuryBps + burnBps;
  const splitsValid = totalBps === 10000;

  const applyPreset = (p: Preset) => {
    setResolutionMode(p.resolutionMode);
    setClaimMode(p.claimMode);
    setRefundPolicy(p.refundPolicy);
    setClaimantBps(p.claimantBps);
    setTreasuryBps(p.treasuryBps);
    setBurnBps(p.burnBps);
  };

  const deadlineUnix = useMemo(() => {
    if (!deadlineStr) return 0n;
    const t = new Date(deadlineStr).getTime();
    if (Number.isNaN(t)) return 0n;
    return BigInt(Math.floor(t / 1000));
  }, [deadlineStr]);

  const wrongNetwork = !!connectedAddress && accountChain?.id !== targetNetwork.id;

  const validate = (): string | null => {
    if (!descriptionCID.trim()) return "Description CID is required.";
    if (deadlineUnix === 0n) return "Deadline is required.";
    if (deadlineUnix <= BigInt(Math.floor(Date.now() / 1000))) return "Deadline must be in the future.";
    if (!splitsValid) return "Splits must add up to 100%.";
    if (resolutionMode === 0 && (!judge || !isAddress(judge))) return "Trusted judge requires a valid judge address.";
    if (pledgerOverrideBps < 0 || pledgerOverrideBps > 10000) return "Pledger override BPS out of range.";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      notification.error(err);
      return;
    }
    const judgeArg = resolutionMode === 0 ? (judge as `0x${string}`) : (ZERO_ADDRESS as `0x${string}`);
    const judgeVetoWindow = BigInt(judgeVetoWindowDays * 86400);
    const claimWindow = BigInt(claimWindowHours * 3600);
    const refundUnlockTime = 0n;
    const challengeWindow = BigInt(challengeWindowDays * 86400);
    try {
      await writeContractAsync({
        functionName: "createBounty",
        args: [
          descriptionCID.trim(),
          deadlineUnix,
          resolutionMode,
          judgeArg,
          judgeVetoWindow,
          claimMode,
          claimWindow,
          refundPolicy,
          refundUnlockTime,
          claimantBps,
          treasuryBps,
          burnBps,
          pledgerOverrideBps,
          challengeWindow,
        ],
      });
      notification.success("Contract submitted. The streets will know shortly.");
      router.push("/");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="parchment px-6 py-6 mb-8">
        <h2 className="font-display text-xl mb-3">Presets</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PRESETS.map(p => (
            <button
              key={p.name}
              className="btn btn-outline btn-sm h-auto py-3 normal-case text-left"
              onClick={() => applyPreset(p)}
            >
              <div className="flex flex-col items-start">
                <span className="font-display font-bold">{p.name}</span>
                <span className="font-numeric text-[0.65rem] uppercase tracking-widest opacity-70">{p.tagline}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="parchment px-6 py-6 space-y-5">
        <Field label="description CID" hint="Paste an IPFS CID describing the bounty.">
          <input
            className="input input-bordered w-full font-numeric"
            placeholder="Qm... or bafy..."
            value={descriptionCID}
            onChange={e => setDescriptionCID(e.target.value)}
          />
        </Field>

        <Field label="deadline" hint="When the bounty expires if unfilled.">
          <input
            className="input input-bordered w-full font-numeric"
            type="datetime-local"
            value={deadlineStr}
            onChange={e => setDeadlineStr(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="resolution mode">
            <select
              className="select select-bordered w-full"
              value={resolutionMode}
              onChange={e => setResolutionMode(Number(e.target.value) as ResolutionMode)}
            >
              <option value={0}>TrustedJudge</option>
              <option value={1}>PledgerVote</option>
              <option value={2}>Optimistic</option>
            </select>
          </Field>
          <Field label="claim mode">
            <select
              className="select select-bordered w-full"
              value={claimMode}
              onChange={e => setClaimMode(Number(e.target.value) as ClaimMode)}
            >
              <option value={0}>FCFS</option>
              <option value={1}>OpenFirstValid</option>
              <option value={2}>OpenJudgePicks</option>
            </select>
          </Field>
          <Field label="refund policy">
            <select
              className="select select-bordered w-full"
              value={refundPolicy}
              onChange={e => setRefundPolicy(Number(e.target.value) as RefundPolicy)}
            >
              <option value={0}>Refundable</option>
              <option value={1}>Sticky</option>
              <option value={2}>Burn</option>
            </select>
          </Field>
        </div>

        {resolutionMode === 0 && (
          <Field label="judge" hint="Trusted judge address.">
            <AddressInput
              value={judge}
              onChange={(value: string) => setJudge(value)}
              placeholder="0x... or vitalik.eth"
            />
          </Field>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="claimant %" hint="Goes to the claimant on success.">
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="input input-bordered w-full font-numeric"
              value={(claimantBps / 100).toString()}
              onChange={e => setClaimantBps(Math.round(Number(e.target.value || "0") * 100))}
            />
          </Field>
          <Field label="treasury %">
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="input input-bordered w-full font-numeric"
              value={(treasuryBps / 100).toString()}
              onChange={e => setTreasuryBps(Math.round(Number(e.target.value || "0") * 100))}
            />
          </Field>
          <Field label="burn %">
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="input input-bordered w-full font-numeric"
              value={(burnBps / 100).toString()}
              onChange={e => setBurnBps(Math.round(Number(e.target.value || "0") * 100))}
            />
          </Field>
        </div>
        <div className={`text-xs font-numeric uppercase tracking-widest ${splitsValid ? "opacity-60" : "text-error"}`}>
          total: {(totalBps / 100).toFixed(2)}% {splitsValid ? "(ok)" : "(must equal 100%)"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="challenge window">
            <select
              className="select select-bordered w-full"
              value={challengeWindowDays}
              onChange={e => setChallengeWindowDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
            </select>
          </Field>
          <Field label="pledger override %" hint="Threshold to override judge.">
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="input input-bordered w-full font-numeric"
              value={(pledgerOverrideBps / 100).toString()}
              onChange={e => setPledgerOverrideBps(Math.round(Number(e.target.value || "0") * 100))}
            />
          </Field>
          <Field label="claim window (hours)">
            <input
              type="number"
              min={1}
              step={1}
              className="input input-bordered w-full font-numeric"
              value={claimWindowHours.toString()}
              onChange={e => setClaimWindowHours(Number(e.target.value || "0"))}
            />
          </Field>
        </div>

        {resolutionMode === 0 && (
          <Field label="judge veto window (days)">
            <input
              type="number"
              min={0}
              step={1}
              className="input input-bordered w-full font-numeric"
              value={judgeVetoWindowDays.toString()}
              onChange={e => setJudgeVetoWindowDays(Number(e.target.value || "0"))}
            />
          </Field>
        )}

        <div className="pt-2">
          {!connectedAddress ? (
            <RainbowKitCustomConnectButton />
          ) : wrongNetwork ? (
            <button className="btn btn-secondary w-full" disabled>
              <span className="font-numeric uppercase tracking-widest">switch to base</span>
            </button>
          ) : (
            <button className="btn btn-primary w-full" disabled={isMining || !splitsValid} onClick={handleSubmit}>
              {isMining && <span className="loading loading-spinner loading-sm" />}
              <span className="font-numeric uppercase tracking-widest">put a contract out</span>
            </button>
          )}
        </div>

        <div className="text-xs opacity-60 text-center">
          <Link href="/code" className="link">
            read the code first →
          </Link>
        </div>
      </div>
    </>
  );
};

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="font-numeric uppercase tracking-widest text-xs opacity-70 mb-1 block">{label}</label>
    {children}
    {hint && <p className="text-xs opacity-60 mt-1">{hint}</p>}
  </div>
);

const CreatePage: NextPage = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="font-display font-black text-4xl md:text-6xl tracking-tight mb-2">Put a Contract Out</h1>
        <p className="font-numeric uppercase tracking-[0.3em] opacity-70 text-sm">
          name the target. set the rules. fund the reward.
        </p>
      </div>
      <ClientOnly
        fallback={
          <div className="parchment p-12 text-center opacity-70">
            <span className="loading loading-spinner loading-lg" />
          </div>
        }
      >
        <CreateForm />
      </ClientOnly>
    </div>
  );
};

export default CreatePage;
