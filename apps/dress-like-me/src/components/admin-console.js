"use client";

import { useState } from "react";

export default function AdminConsole() {
  const [token, setToken] = useState("");
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(method = "GET", jobId) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/jobs", {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: jobId ? JSON.stringify({ jobId }) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Admin request failed.");
      setJobs(payload.jobs || jobs);
      setMessage(method === "POST" ? "Retry queued." : "");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-console">
      <div className="search-box search-box-compact">
        <label htmlFor="admin-token">Admin API token</label>
        <div>
          <span aria-hidden="true">#</span>
          <input
            id="admin-token"
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste token"
            type="password"
            value={token}
          />
          <button disabled={!token || busy} onClick={() => request()} type="button">
            Load jobs
          </button>
        </div>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
      <div className="admin-jobs">
        {jobs.map((job) => (
          <article className="garment-card" key={job.id}>
            <header>
              <div>
                <p>{job.status}</p>
                <h2>{job.id.slice(0, 8)}</h2>
                <p>{job.source_url}</p>
              </div>
              {job.status === "failed" ? (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => request("POST", job.id)}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
            </header>
            {job.error_message ? (
              <p className="form-message">{job.error_message}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
