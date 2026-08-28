import ChallengeClient from "./_components/ChallengeClient";
import { getCommitmentHash } from "@/lib/server/secret";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const commitmentHash = await getCommitmentHash();
  const challengeId = commitmentHash.slice(0, 12).toUpperCase();

  return (
    <ChallengeClient
      commitmentHash={commitmentHash}
      challengeId={challengeId}
    />
  );
}
