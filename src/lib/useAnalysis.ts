import { useEffect, useRef, useState } from 'react';
import { DEEP_MS, Engine, QUICK_MS } from './engine';
import { EvolutionBuilder } from './evolution';
import type { Analysis, EvolutionNode, Game } from '../types/game';

export function useAnalysis(game: Game, replaying = false) {
  const [builder] = useState(() => new EvolutionBuilder(game));
  const [graph, setGraph] = useState(() => builder.snapshot());
  const frozen = useRef(replaying);
  frozen.current = replaying;
  const deferred = useRef<ReturnType<EvolutionBuilder['snapshot']> | null>(null);
  useEffect(() => {
    if (!replaying && deferred.current) {
      setGraph(deferred.current);
      deferred.current = null;
    }
  }, [replaying]);
  const publish = (next: ReturnType<EvolutionBuilder['snapshot']>) => {
    if (frozen.current) deferred.current = next;
    else setGraph(next);
  };
  const saved = useRef(new Map<string, Analysis>());
  const [analysis, setAnalysis] = useState(saved.current);
  const [status, setStatus] = useState<'loading' | 'analyzing' | 'complete' | 'paused' | 'error'>(
    'loading',
  );
  const [error, setError] = useState('');
  const [workingOn, setWorkingOn] = useState('');
  const [run, setRun] = useState(0);
  const jobs = useRef(new Map<string, EvolutionNode>());
  const cancel = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let engine: Engine | undefined;
    cancel.current = () => {
      stopped = true;
      engine?.dispose();
    };
    setStatus('loading');
    setError('');
    async function work() {
      try {
        engine = new Engine();
        while (!stopped) {
          const deep = jobs.current.values().next().value as EvolutionNode | undefined;
          const next =
            deep ?? builder.get(game.positions.find((pos) => !saved.current.has(pos.id))?.id ?? '');
          if (!next) {
            setWorkingOn('Arranging the evolution graph…');
            const layout = await builder.layout();
            if (stopped) break;
            publish(layout);
            setStatus('complete');
            setWorkingOn('');
            break;
          }
          setWorkingOn(
            deep
              ? `Exploring ${next.san || 'start'}`
              : `Position ${next.ply} of ${game.positions.length - 1}`,
          );
          const result = await engine.analyze(
            game.initialFen,
            next.moves,
            deep ? DEEP_MS : QUICK_MS,
          );
          if (stopped) break;
          setStatus('analyzing');
          saved.current.set(next.id, result);
          if (deep) jobs.current.delete(deep.id);
          builder.append(next.id, result, 20);
          if (deep) {
            const layout = await builder.layout();
            if (stopped) break;
            publish(layout);
          }
          setAnalysis(new Map(saved.current));
        }
      } catch (error) {
        if (!stopped) {
          setError(error instanceof Error ? error.message : 'Analysis failed. Try again.');
          setStatus('error');
        }
      } finally {
        engine?.dispose();
      }
    }
    void work();
    return () => {
      stopped = true;
      engine?.dispose();
    };
  }, [builder, game, run]);

  const pause = () => {
    cancel.current();
    setStatus('paused');
    setWorkingOn('');
  };
  const resume = () => setRun((value) => value + 1);
  const expand = (node: EvolutionNode) => {
    jobs.current.set(node.id, node);
    if (status === 'complete' || status === 'paused' || status === 'error') resume();
    else setWorkingOn(`Queued ${node.san || 'start'}`);
  };
  const completed = game.positions.filter((pos) => analysis.has(pos.id)).length;
  return {
    graph,
    analysis,
    status,
    error,
    workingOn,
    completed,
    total: game.positions.length,
    pause,
    resume,
    expand,
  };
}
