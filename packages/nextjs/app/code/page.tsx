"use client";

import type { NextPage } from "next";

const SECTIONS = [
  { id: "how", label: "How This Works" },
  { id: "resolution", label: "Resolution Models" },
  { id: "claim", label: "Claim Flows" },
  { id: "refund", label: "Refund Policies" },
  { id: "splits", label: "Payout Splits" },
];

const CodePage: NextPage = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="font-display font-black text-4xl md:text-6xl tracking-tight mb-2">The Code</h1>
        <p className="font-numeric uppercase tracking-[0.3em] opacity-70 text-sm">
          rules of the street. read before you pledge.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-56 md:sticky md:top-4 self-start">
          <div className="parchment p-4">
            <p className="font-numeric uppercase tracking-widest text-xs opacity-70 mb-3">chapters</p>
            <ul className="space-y-2 text-sm">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="link font-display">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="flex-1 space-y-8">
          <section id="how" className="parchment p-6">
            <h2 className="font-display text-3xl mb-3">How This Works</h2>
            <p>
              Most ClawdWanted is a CLAWD-only crowdfunded bounty platform. Anyone can post a contract — describe the
              target, set the rules, and pledge an initial reward. Other CLAWD holders pile on. When the work is
              completed and verified, the pot pays out to the claimant.
            </p>
            <p>
              Each bounty has three knobs: how it gets resolved, how claimants line up, and what happens to the pot if
              nobody finishes the job. Pick wisely.
            </p>
          </section>

          <section id="resolution" className="parchment p-6">
            <h2 className="font-display text-3xl mb-3">Resolution Models</h2>

            <SubSection title="TrustedJudge">
              <p>
                <strong>What it is:</strong> A single trusted address makes the call on whether the proof is valid.
              </p>
              <p>
                <strong>When to use:</strong> The community trusts a specific reviewer; you want fast, cheap arbitration
                without coordinating votes.
              </p>
              <p>
                <strong>When NOT to use:</strong> No clear trusted party exists; you want decentralized review; bounties
                are too political for one person to call.
              </p>
            </SubSection>

            <SubSection title="PledgerVote">
              <p>
                <strong>What it is:</strong> Pledgers vote on whether to approve a claimant. Vote weight is proportional
                to pledge size.
              </p>
              <p>
                <strong>When to use:</strong> The community itself should decide; the bounty is subjective; you want
                full decentralization.
              </p>
              <p>
                <strong>When NOT to use:</strong> Time-sensitive bounties (voting takes time); low-stakes tasks where
                voting overhead is too high.
              </p>
            </SubSection>

            <SubSection title="Optimistic">
              <p>
                <strong>What it is:</strong> Claims are auto-approved after a challenge window expires unless someone
                disputes them.
              </p>
              <p>
                <strong>When to use:</strong> Claims are easy to verify; disputes are rare; you want the lowest-friction
                resolution.
              </p>
              <p>
                <strong>When NOT to use:</strong> Claims are hard to verify; disputes are likely; the community is
                inattentive.
              </p>
            </SubSection>
          </section>

          <section id="claim" className="parchment p-6">
            <h2 className="font-display text-3xl mb-3">Claim Flows</h2>

            <SubSection title="FCFS (First-Come, First-Served)">
              <p>
                <strong>What it is:</strong> First address to claim the bounty locks it in. They get a claim window to
                submit proof. If they fail, the next claimant can take over.
              </p>
              <p>
                <strong>When to use:</strong> The work is well-defined; you want a single accountable executor; speed
                matters.
              </p>
              <p>
                <strong>When NOT to use:</strong> Multiple parallel attempts would surface the best work; you want
                competition between claimants.
              </p>
            </SubSection>

            <SubSection title="OpenFirstValid">
              <p>
                <strong>What it is:</strong> Anyone can submit proof. The first valid proof wins.
              </p>
              <p>
                <strong>When to use:</strong> The work is hard but verifiable; you want a race; multiple parties might
                already have what you need.
              </p>
              <p>
                <strong>When NOT to use:</strong> Work is expensive and shouldn&apos;t be duplicated; verification is
                slow.
              </p>
            </SubSection>

            <SubSection title="OpenJudgePicks">
              <p>
                <strong>What it is:</strong> Anyone submits; the judge / pledgers pick the best one.
              </p>
              <p>
                <strong>When to use:</strong> Quality matters more than speed; the bounty is subjective (e.g. a design,
                a piece of writing).
              </p>
              <p>
                <strong>When NOT to use:</strong> The work is binary (done or not done); subjectivity invites
                manipulation.
              </p>
            </SubSection>
          </section>

          <section id="refund" className="parchment p-6">
            <h2 className="font-display text-3xl mb-3">Refund Policies</h2>

            <SubSection title="Refundable">
              <p>
                <strong>What it is:</strong> If the bounty expires unfilled, pledgers can withdraw their pledges.
              </p>
              <p>
                <strong>When to use:</strong> You want to lower the barrier to pledging; you trust the deadline is
                meaningful.
              </p>
              <p>
                <strong>When NOT to use:</strong> The bounty needs to be a credible long-term commitment; refunds would
                disincentivize completing the work.
              </p>
            </SubSection>

            <SubSection title="Sticky">
              <p>
                <strong>What it is:</strong> Pledges stay locked even after the deadline; the bounty becomes evergreen
                until finished.
              </p>
              <p>
                <strong>When to use:</strong> The target is important and timeless; pledgers want strong commitment.
              </p>
              <p>
                <strong>When NOT to use:</strong> The work is time-bounded; pledgers need their CLAWD back if the work
                doesn&apos;t happen.
              </p>
            </SubSection>

            <SubSection title="Burn">
              <p>
                <strong>What it is:</strong> Unfilled bounties are burned at expiry. Pledgers lose their CLAWD if no
                claimant finishes the work.
              </p>
              <p>
                <strong>When to use:</strong> You want maximum pressure to actually complete the bounty; a credible
                threat increases the chance of completion.
              </p>
              <p>
                <strong>When NOT to use:</strong> Pledgers are casual or risk-averse; the work is exploratory.
              </p>
            </SubSection>
          </section>

          <section id="splits" className="parchment p-6">
            <h2 className="font-display text-3xl mb-3">Payout Splits</h2>
            <p>When a claim is finalized, the pot splits three ways:</p>
            <ul className="list-disc pl-6 my-3 space-y-1">
              <li>
                <strong>Claimant %:</strong> the bulk of the bounty going to whoever finished the work.
              </li>
              <li>
                <strong>Treasury %:</strong> a slice that funds the platform (capped by the contract).
              </li>
              <li>
                <strong>Burn %:</strong> CLAWD permanently removed from supply (capped by the contract).
              </li>
            </ul>
            <p>
              The three must add up to 100%. The contract enforces minimum claimant share and maximum treasury / burn
              shares. Adjust to taste, but a healthy default is <code>85 / 10 / 5</code>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <h3 className="font-display text-xl mb-1">{title}</h3>
    <div className="text-sm space-y-1">{children}</div>
  </div>
);

export default CodePage;
