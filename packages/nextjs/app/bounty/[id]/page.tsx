import BountyDetail from "./BountyDetail";

// For static export we can't enumerate all bounty ids ahead of time.
// Generate a single placeholder route; the client component reads the actual
// id from the URL pathname so any /bounty/<id>/ path resolves correctly when
// served from this static HTML.
export function generateStaticParams() {
  return [{ id: "view" }];
}

export const dynamicParams = false;

export default function Page() {
  return <BountyDetail />;
}
