// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { parseGame } from '../src/lib/games';
import { EvolutionBuilder } from '../src/lib/evolution';
import { useAnalysis } from '../src/lib/useAnalysis';
import type { EvolutionGraph } from '../src/types/game';
const search = vi.hoisted(() => vi.fn(async () => ({ lines: [], depth: 0, milliseconds: 400 })));
vi.mock('../src/lib/engine', () => ({
  QUICK_MS: 400,
  DEEP_MS: 1800,
  Engine: class {
    analyze = search;
    dispose() {}
  },
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  search.mockClear();
});
it('services an exploration queued while the initial graph is being arranged', async () => {
  let finish!: (graph: EvolutionGraph) => void;
  const pending = new Promise<EvolutionGraph>((resolve) => {
    finish = resolve;
  });
  const layout = vi
    .spyOn(EvolutionBuilder.prototype, 'layout')
    .mockImplementationOnce(() => pending)
    .mockImplementation(async function (this: EvolutionBuilder) {
      return this.snapshot();
    });
  const game = parseGame('1. e4 e5 *');
  const { result } = renderHook(() => useAnalysis(game));
  await waitFor(() => expect(layout).toHaveBeenCalledOnce());
  await act(async () => {
    result.current.expand(result.current.graph.byId.get('p1')!);
    finish(result.current.graph);
  });
  await waitFor(() => expect(search).toHaveBeenCalledWith(expect.any(String), ['e2e4'], 1800));
});
