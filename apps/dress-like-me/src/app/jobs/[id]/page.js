import JobStatus from "@/components/job-status";
import { hasSupabaseConfig } from "@/lib/supabase";

export const metadata = {
  title: "Processing outfit",
};

export const dynamic = "force-dynamic";

export default async function JobPage({ params }) {
  const { id } = await params;

  if (!hasSupabaseConfig()) {
    return (
      <div className="page-shell job-shell">
        <div className="status-panel">
          <p className="kicker">Import unavailable</p>
          <h1>Public-post imports are not available yet.</h1>
          <p>Try searching the curated style index instead.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell job-shell">
      <JobStatus jobId={id} />
    </div>
  );
}
