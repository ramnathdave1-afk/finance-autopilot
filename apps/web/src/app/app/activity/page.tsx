import { Card, CardBody, CardTitle } from "@fa/ui";
import { currentUserId } from "@/lib/current-user";
import { getActivityLog } from "@/lib/data/activity";
import { getTotalRoi } from "@/lib/data/roi";

function fmtAt(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return iso; }
}

export default async function ActivityPage() {
  const userId = await currentUserId();
  const [actions, roi] = await Promise.all([getActivityLog(userId), getTotalRoi(userId)]);

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-h1 mb-1">Agent activity</h1>
        <p className="text-small text-fg-muted">
          {roi > 0
            ? `Pilot has saved you $${roi.toLocaleString()} since you joined. Here's every action.`
            : "Every action your agents have ever taken."}
        </p>
      </div>
      {actions.length === 0 ? (
        <Card>
          <CardTitle>No actions yet.</CardTitle>
          <CardBody className="mt-2">
            Once your agents start working, every action shows up here with its ROI and full audit trail.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <Card key={a.id}>
              <div className="flex justify-between">
                <div>
                  <div className="text-small text-fg-muted">{a.agent}</div>
                  <div className="text-body text-fg">{a.title}</div>
                </div>
                <div className="text-right">
                  <div className="text-small text-fg-muted">{fmtAt(a.at)}</div>
                  <div className="text-body text-accent">+${a.roi.toLocaleString()}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
