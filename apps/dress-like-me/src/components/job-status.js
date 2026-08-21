"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const labels = {
  queued: "Waiting for a worker",
  fetching: "Reading the public post",
  analyzing: "Naming the pieces",
  matching: "Finding live matches",
  complete: "The outfit is ready",
  failed: "This reference could not be processed",
};

const progress = {
  queued: "12%",
  fetching: "34%",
  analyzing: "58%",
  matching: "82%",
  complete: "100%",
  failed: "100%",
};

export default function JobStatus({ jobId }) {
  const [job, setJob] = useState({ id: jobId, status: "queued" });

  useEffect(() => {
    let active = true;

    async function refresh() {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok || !active) return;
      const result = await response.json();
      setJob(result.job);

      if (!["complete", "failed"].includes(result.job.status)) {
        window.setTimeout(refresh, 2000);
      }
    }

    refresh();
    return () => {
      active = false;
    };
  }, [jobId]);

  return (
    <div className="status-panel">
      <p className="kicker">Import / {job.id.slice(0, 8)}</p>
      <h1>{labels[job.status] || "Processing the outfit"}</h1>
      <p>
        This runs in the background. You can leave this page and return with the
        same link.
      </p>
      <div className="status-track" style={{ "--progress": progress[job.status] }}>
        <span />
      </div>
      <span className="status-pill">{job.status}</span>
      {job.errorMessage ? <p className="form-message">{job.errorMessage}</p> : null}
      {job.outfitId ? (
        <p>
          <Link className="primary-button" href={`/outfits/${job.outfitId}`}>
            See the breakdown →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
