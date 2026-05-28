import Link from "next/link";
import { Badge, Button, Card, CardBody, CardFooter, CardTitle } from "@fa/ui";

type Tier = "Autopilot" | "Pro" | "Premium";

export interface UpgradePromptProps {
  requiredTier: Tier;
  featureName: string;
  benefit: string;
}

const price: Record<Tier, string> = { Autopilot: "$19.99", Pro: "$29.99", Premium: "$49.99" };

export function UpgradePrompt({ requiredTier, featureName, benefit }: UpgradePromptProps) {
  return (
    <Card className="shadow-glow border-accent/40">
      <Badge tone="accent" className="mb-3">{requiredTier} feature</Badge>
      <CardTitle>{featureName}</CardTitle>
      <CardBody className="mt-2">{benefit}</CardBody>
      <CardFooter className="justify-between">
        <span className="text-small text-fg-muted">{price[requiredTier]}/mo · 7-day trial</span>
        <Link href={`/upgrade?to=${requiredTier.toLowerCase()}`}><Button>Unlock {requiredTier}</Button></Link>
      </CardFooter>
    </Card>
  );
}
