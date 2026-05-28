import { FeedCardWired } from "@/components/feed-card-wired";
import { StreaksStrip } from "@/components/streaks-strip";
import { currentUserId } from "@/lib/current-user";
import { getFeedCards } from "@/lib/data/feed";

export default async function FeedPage() {
  const userId = await currentUserId();
  const cards = await getFeedCards(userId);
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-h1 mb-1">Today</h1>
        <p className="text-small text-fg-muted">{cards.length} things from your agents.</p>
      </div>
      <StreaksStrip />
      <div className="space-y-4 pt-2">
        {cards.length === 0 ? (
          <p className="text-small text-fg-muted">No agent activity yet. Run your first scan to see updates here.</p>
        ) : (
          cards.map((c) => <FeedCardWired key={c.id} card={c} />)
        )}
      </div>
    </div>
  );
}
