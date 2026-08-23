import AdminConsole from "@/components/admin-console";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="page-shell">
      <div className="page-intro">
        <p className="kicker">Internal operations / Restricted</p>
        <h1 className="page-title">Import queue.</h1>
        <p>
          Review processing failures and retry transient provider errors. The
          token stays in this browser tab and is never persisted.
        </p>
      </div>
      <AdminConsole />
    </div>
  );
}
