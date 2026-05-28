import { FeedCard } from "@fa/ui";
import { stubFeed } from "@/lib/feed-stub";
import { StreaksStrip } from "@/components/streaks-strip";

export default function FeedPage() {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-h1 mb-1">Today</h1>
        <p className="text-small text-fg-muted">3 things from your agents.</p>
      </div>
      <StreaksStrip />
      <div className="space-y-4 pt-2">
        {stubFeed.map((c) => <FeedCard key={c.id} card={c} />)}
      </div>
    </div>
  );
}
