export type CancelAction = 'navigate' | 'click' | 'type' | 'wait' | 'verify';

export interface CancelStep {
  action: CancelAction;
  /** Selector, URL, or natural-language target. */
  target?: string;
  /** Value to type (for action='type'); ignored otherwise. */
  value?: string;
}

export interface MerchantCancelSpec {
  merchantKey: string;
  displayName: string;
  cancelMethod: 'web' | 'voice';
  loginUrl: string;
  billingUrl: string;
  steps: CancelStep[];
  /** CSS selector or text fragment that must appear after a successful cancel. */
  successSelector: string;
  /** Used to compute roi = monthlyAmountEstimate * 12 when no live amount supplied. */
  monthlyAmountEstimate?: number;
}
