import { FeedCard } from "@fa/ui";
import { stubFeed } from "@/lib/feed-stub";

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h1 className="text-h1 mb-1">Today</h1>
        <p className="text-small text-fg-muted">3 things from your agents.</p>
      </div>
      {stubFeed.map((c) => <FeedCard key={c.id} card={c} />)}
    </div>
  );
}
