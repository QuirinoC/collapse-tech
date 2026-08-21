import JobStatus from "@/components/job-status";

export const metadata = {
  title: "Processing outfit",
};

export default async function JobPage({ params }) {
  const { id } = await params;

  return (
    <div className="page-shell job-shell">
      <JobStatus jobId={id} />
    </div>
  );
}
