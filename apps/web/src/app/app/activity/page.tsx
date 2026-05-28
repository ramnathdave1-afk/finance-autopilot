import { Card, CardBody, CardTitle } from "@fa/ui";

// Activity log — populated by agent_actions table (Terminal 2 schema, all agents write)
export default function ActivityPage() {
  const actions: Array<{ id: string; agent: string; title: string; status: string; roi: number; at: string }> = [];

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-h1 mb-1">Agent activity</h1>
        <p className="text-small text-fg-muted">Every action your agents have ever taken.</p>
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
                  <div className="text-small text-fg-muted">{a.at}</div>
                  <div className="text-body text-accent">+${a.roi}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
