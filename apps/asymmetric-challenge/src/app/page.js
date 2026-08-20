import ChallengeClient from "./_components/ChallengeClient";
import { getCommitmentHash } from "@/lib/server/secret";

export default function Home() {
  const commitmentHash = getCommitmentHash();
  const challengeId = commitmentHash.slice(0, 12).toUpperCase();

  return (
    <ChallengeClient
      commitmentHash={commitmentHash}
      challengeId={challengeId}
    />
  );
}
