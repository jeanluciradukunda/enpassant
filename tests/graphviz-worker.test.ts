import { afterEach, expect, it, vi } from 'vitest';
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    instances.push(this);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
  instances.length = 0;
});
it('times out a stuck layout and creates a fresh worker for retry', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubEnv('SSR', false);
  const { renderGraph } = await import('../src/lib/graphviz');
  const first = expect(renderGraph('digraph{}')).rejects.toThrow('took too long');
  await vi.advanceTimersByTimeAsync(30_000);
  await first;
  expect(instances[0].terminate).toHaveBeenCalledOnce();
  const next = renderGraph('digraph{}');
  expect(instances).toHaveLength(2);
  const id = instances[1].postMessage.mock.calls[0][0].id;
  instances[1].onmessage!({ data: { id, result: { bb: '0,0,10,10', objects: [], edges: [] } } });
  await expect(next).resolves.toHaveProperty('bb', '0,0,10,10');
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects pending jobs on a worker error instead of leaving analysis hanging', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubEnv('SSR', false);
  const { renderGraph } = await import('../src/lib/graphviz');
  const first = expect(renderGraph('digraph{}')).rejects.toThrow('could not start');
  const second = expect(renderGraph('digraph{}')).rejects.toThrow('could not start');
  instances[0].onerror!();
  await Promise.all([first, second]);
  expect(vi.getTimerCount()).toBe(0);
});
