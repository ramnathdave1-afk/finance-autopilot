// Stub data — T4/T5 replace with live queries against agent_actions (T2 schema).

export type Dispute = { id: string; merchant: string; amount: number; date: string; reason: string };
export const stubDisputes: Dispute[] = [
  { id: "d1", merchant: "AMZN MKTPLACE", amount: 89.99, date: "May 24", reason: "Duplicate charge" },
  { id: "d2", merchant: "UNKNOWN SAS", amount: 14.0, date: "May 21", reason: "Unrecognized merchant" }
];

export type CardRec = { category: string; recommended: string; reward: string; loss: number };
export const stubCardRecs: CardRec[] = [
  { category: "Dining", recommended: "Amex Gold", reward: "4x points", loss: 18 },
  { category: "Groceries", recommended: "BoA Customized Cash 3%", reward: "3% back", loss: 12 },
  { category: "Travel", recommended: "Chase Sapphire Reserve", reward: "3x points + perks", loss: 22 }
];

export type Found = { id: string; source: string; amount: number; type: string };
export const stubFound: Found[] = [
  { id: "f1", source: "NY State Unclaimed Funds", amount: 247.5, type: "Old utility deposit" },
  { id: "f2", source: "Capital One", amount: 38.12, type: "Closed account residual" }
];

export type RefiOpp = { loan: string; balance: number; currentApr: number; offeredApr: number; lifetimeSavings: number };
export const stubRefi: RefiOpp[] = [
  { loan: "Auto — Honda Civic", balance: 14200, currentApr: 7.9, offeredApr: 5.4, lifetimeSavings: 1380 }
];

export type Quote = { carrier: string; coverage: string; premium: number; vsCurrent: number };
export const stubInsurance: Quote[] = [
  { carrier: "GEICO", coverage: "Auto — same coverage", premium: 142, vsCurrent: -36 },
  { carrier: "Progressive", coverage: "Auto — same coverage", premium: 158, vsCurrent: -20 },
  { carrier: "State Farm", coverage: "Auto — same coverage", premium: 165, vsCurrent: -13 }
];
