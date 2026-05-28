// stepRecorder: glue between Stagehand-style steps and @fa/db's audit log.
// Every browser interaction inside the subscription killer flows through
// here so we get a per-step record with screenshot URL in the detail
// payload. This is what powers PRD §16 (trust/refund) — the user can scrub
// the cancellation timeline and we can prove what actually happened.

import { logStep } from '@fa/db';
import type { Screenshot } from './session';

export interface StepRecorder {
  /**
   * Append a step to the action's audit_log.
   * `detail` is shallow-merged with any screenshot metadata.
   */
  logStep(
    step: string,
    ok: boolean,
    detail?: Record<string, unknown>,
  ): Promise<void>;
  /** Convenience: log + attach screenshot in one call. */
  attachScreenshot(
    step: string,
    ok: boolean,
    screenshot: Screenshot,
    detail?: Record<string, unknown>,
  ): Promise<void>;
}

export function stepRecorder(actionId: string): StepRecorder {
  return {
    async logStep(step, ok, detail) {
      await logStep(actionId, {
        step,
        ok,
        detail: detail ?? {},
      });
    },
    async attachScreenshot(step, ok, screenshot, detail) {
      await logStep(actionId, {
        step,
        ok,
        detail: {
          ...(detail ?? {}),
          screenshot_url: screenshot.url,
          screenshot_bytes: screenshot.pngBytes,
        },
      });
    },
  };
}
