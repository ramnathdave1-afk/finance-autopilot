import { cn } from "@fa/ui";

export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-8 flex gap-1.5" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors duration-300 ease-soft",
            i < step ? "bg-accent" : "bg-border-strong"
          )}
        />
      ))}
    </div>
  );
}
