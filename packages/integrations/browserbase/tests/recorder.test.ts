import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @fa/db before importing the recorder so logStep is captured.
const logStepMock = vi.fn(async () => {});
vi.mock('@fa/db', () => ({
  logStep: (...args: unknown[]) => logStepMock(...args),
}));

import { stepRecorder } from '../src/recorder';

describe('stepRecorder', () => {
  beforeEach(() => logStepMock.mockClear());

  it('logs a plain step with detail', async () => {
    const rec = stepRecorder('action-123');
    await rec.logStep('navigate', true, { url: 'https://x' });
    expect(logStepMock).toHaveBeenCalledWith('action-123', {
      step: 'navigate',
      ok: true,
      detail: { url: 'https://x' },
    });
  });

  it('attachScreenshot folds url + bytes into detail', async () => {
    const rec = stepRecorder('action-456');
    await rec.attachScreenshot(
      'cancel-clicked',
      true,
      { url: 'https://shots/1.png', pngBytes: 9000 },
      { merchant: 'netflix' },
    );
    expect(logStepMock).toHaveBeenCalledWith('action-456', {
      step: 'cancel-clicked',
      ok: true,
      detail: {
        merchant: 'netflix',
        screenshot_url: 'https://shots/1.png',
        screenshot_bytes: 9000,
      },
    });
  });

  it('preserves ok=false for failures', async () => {
    const rec = stepRecorder('action-789');
    await rec.attachScreenshot('confirm', false, { url: 'https://x.png', pngBytes: 100 });
    expect(logStepMock.mock.calls[0]?.[1].ok).toBe(false);
  });
});
