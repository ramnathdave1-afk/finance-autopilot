import { Badge } from "@fa/ui";

type Streak = { label: string; days: number };

// Stub data — T3 (Spending Coach + rules) replaces this with live streaks.
const streaks: Streak[] = [
  { label: "Savings", days: 23 },
  { label: "No Uber Eats", days: 9 },
  { label: "Under spend cap", days: 14 }
];

export function StreaksStrip() {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Current streaks">
      {streaks.map((s) => (
        <Badge key={s.label} tone="accent">
          🔥 {s.days}d · {s.label}
        </Badge>
      ))}
    </div>
  );
}
