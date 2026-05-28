// Round-up investment strategies (PRD §8.2 Agent 3).
//
// Phase 1: read-only registry. We propose a transfer to the user's chosen
// strategy account — we don't move money. Phase 2 wires Schwab / Robinhood /
// Coinbase / Fidelity transfers (TODO(integrate-brokerage)).

export type StrategyId = 'sp500' | 'btc' | 'custom';

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  description: string;
  /** Broker we'd route this through. */
  broker: 'schwab' | 'robinhood' | 'coinbase' | 'fidelity' | 'user_choice';
}

export const STRATEGY_REGISTRY: Record<StrategyId, StrategyDefinition> = {
  sp500: {
    id: 'sp500',
    name: 'S&P 500 ETF',
    description: 'Sweep into a broad-market index ETF (VOO / SPY).',
    broker: 'schwab',
  },
  btc: {
    id: 'btc',
    name: 'Bitcoin',
    description: 'Sweep into BTC at the current spot price.',
    broker: 'coinbase',
  },
  custom: {
    id: 'custom',
    name: 'Custom basket',
    description: 'User-defined allocation across multiple tickers.',
    broker: 'user_choice',
  },
};

export function getStrategy(id: StrategyId): StrategyDefinition {
  return STRATEGY_REGISTRY[id];
}
