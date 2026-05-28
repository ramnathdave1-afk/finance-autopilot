import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  publishAgentActionUpdate,
  setRealtimePublisher,
  _resetRealtimePublisher,
  type RealtimePublisher,
  type RealtimeUpdate,
} from '../src/realtime';

const captured: RealtimeUpdate[] = [];
const publisher: RealtimePublisher = {
  publish: vi.fn(async (u) => {
    captured.push(u);
  }),
};

beforeEach(() => {
  captured.length = 0;
  (publisher.publish as ReturnType<typeof vi.fn>).mockClear();
  (publisher.publish as ReturnType<typeof vi.fn>).mockImplementation(async (u: RealtimeUpdate) => {
    captured.push(u);
  });
  setRealtimePublisher(publisher);
});

describe('publishAgentActionUpdate', () => {
  it('forwards updates to the configured publisher', async () => {
    await publishAgentActionUpdate({
      type: 'agent_action.updated',
      actionId: 'act-1',
      userId: 'u1',
      status: 'succeeded',
      agentType: 'subscription_killer',
      actionType: 'cancel',
      roi: 180,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.status).toBe('succeeded');
    expect(captured[0]?.roi).toBe(180);
  });

  it('swallows publisher errors — realtime is best-effort', async () => {
    (publisher.publish as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('socket down'));
    await expect(
      publishAgentActionUpdate({
        type: 'agent_action.updated',
        actionId: 'act-2',
        userId: 'u1',
        status: 'failed',
        agentType: 'auto_saver',
        actionType: 'allocation_proposal',
      }),
    ).resolves.toBeUndefined();
  });

  it('passes voiceRecordingUrl for daily_brief voice variant', async () => {
    await publishAgentActionUpdate({
      type: 'agent_action.updated',
      actionId: 'act-3',
      userId: 'u1',
      status: 'succeeded',
      agentType: 'daily_brief',
      actionType: 'send_brief_voice',
      voiceRecordingUrl: 'https://signed/u1/act-3.mp3',
    });
    expect(captured[0]?.voiceRecordingUrl).toBe('https://signed/u1/act-3.mp3');
  });

  afterAll();
});

function afterAll() {
  _resetRealtimePublisher();
}
