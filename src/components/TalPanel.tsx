import { useEffect, useRef, useState } from 'react';
import { moveLabel } from '../lib/games';
import { talNarration } from '../lib/narration';
import { askTal, type TalEvent } from '../lib/talAgent';
import { hasEngineData, nearestAnalysed, type TalContext } from '../lib/talTools';
import type { Analysis, EvolutionGraph, EvolutionNode, Game } from '../types/game';

const KEY_STORAGE = 'enpassant-tal-key';

type Step =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; nodeId?: string; isError?: boolean; depth?: number };

const describeTool = (name: string, input: Record<string, unknown>) => {
  const target = input.nodeId ? String(input.nodeId) : undefined;
  switch (name) {
    case 'getPosition':
      return { verb: 'Looked at the board', target };
    case 'getAnalysis':
      return { verb: 'Read the engine', target };
    case 'getPath':
      return { verb: 'Traced the moves', target };
    default:
      return { verb: 'Checked the game', target };
  }
};
const depthOf = (result: unknown) => {
  const r = result as {
    decision?: { engine?: { depth?: number } };
    repliesFromHere?: { depth?: number };
  } | null;
  return r?.decision?.engine?.depth ?? r?.repliesFromHere?.depth;
};

export function TalPanel({
  game,
  graph,
  analysis,
  selected,
}: {
  game: Game;
  graph: EvolutionGraph;
  analysis: Map<string, Analysis>;
  selected: EvolutionNode;
}) {
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem(KEY_STORAGE) ?? '';
    } catch {
      return '';
    }
  });
  const [question, setQuestion] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const live = useRef({ game, graph, analysis });
  live.current = { game, graph, analysis };

  useEffect(() => () => controller.current?.abort(), []);

  const saveKey = (value: string) => {
    setKey(value);
    try {
      if (value) sessionStorage.setItem(KEY_STORAGE, value);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      /* The key then lives only in this component. */
    }
  };

  const taster = talNarration(game.id, selected.id);
  const ctx: TalContext = {
    game,
    node: (id) => graph.byId.get(id),
    analysis,
  };
  const searched = hasEngineData(ctx, selected.id);
  const nearest = searched ? undefined : nearestAnalysed(ctx, selected.id);

  async function ask() {
    const text = question.trim();
    if (!text || !key || busy) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setSteps([]);
    setError('');
    setBusy(true);
    const snapshot = live.current;
    const liveCtx: TalContext = {
      game: snapshot.game,
      node: (id) => snapshot.graph.byId.get(id),
      analysis: snapshot.analysis,
    };
    const prompt = `The user has selected node ${selected.id} (${moveLabel(selected)}) in ${game.headers.White || 'White'} vs ${game.headers.Black || 'Black'}. Question: ${text}`;
    try {
      for await (const event of askTal(liveCtx, prompt, { key, signal: abort.signal }))
        setSteps((prev) => apply(prev, event));
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'Tal could not answer.');
    } finally {
      if (controller.current === abort) setBusy(false);
    }
  }

  const depth = steps.find(
    (s): s is Extract<Step, { kind: 'tool' }> => s.kind === 'tool' && s.depth !== undefined,
  )?.depth;

  return (
    <section className="quiet-sequence tal-panel" aria-label="Ask Tal" data-testid="tal-panel">
      <div className="sequence-heading">
        <span className="eyebrow">
          TAL / {moveLabel(selected)}
          {depth !== undefined ? ` / DEPTH ${depth}` : ''}
        </span>
        {busy && (
          <button aria-label="Stop Tal" onClick={() => controller.current?.abort()}>
            ×
          </button>
        )}
      </div>
      {!key && taster && (
        <>
          <p className="tal-text">{taster.text}</p>
          <p className="branch-help">
            Recorded ahead of time from the engine’s shortlist at depth {taster.depth}. Bring your
            own key and Tal reads the live game instead.
          </p>
        </>
      )}
      {steps.length > 0 && (
        <div className="tal-transcript" data-testid="tal-transcript" aria-live="polite">
          {steps.map((step, i) =>
            step.kind === 'text' ? (
              <p key={i} className="tal-text">
                {step.text}
              </p>
            ) : (
              <p key={i} className="tal-step" data-testid="tal-step">
                {describeTool(step.name, step.nodeId ? { nodeId: step.nodeId } : {}).verb}
                {step.nodeId ? ` at ${labelFor(graph, step.nodeId)}` : ''}
                {step.isError ? ' · nothing there' : ''}
              </p>
            ),
          )}
        </div>
      )}
      {error && (
        <p className="engine-error" role="alert">
          {error}
        </p>
      )}
      <label className="tal-key">
        Anthropic API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-… stays in this tab"
          value={key}
          onChange={(event) => saveKey(event.target.value.trim())}
        />
      </label>
      <form
        className="tal-ask"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <textarea
          aria-label="Ask Tal about this position"
          rows={2}
          placeholder={
            key
              ? searched
                ? 'Ask Tal about this position…'
                : `The engine has not searched here${nearest ? `; try ${labelFor(graph, nearest)}` : ''}`
              : 'Add a key to ask Tal about your own games'
          }
          value={question}
          disabled={!key || !searched}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
        />
        <button type="submit" disabled={!key || !searched || !question.trim() || busy}>
          {busy ? 'Tal is looking…' : 'Ask Tal'}
        </button>
      </form>
    </section>
  );
}

function labelFor(graph: EvolutionGraph, nodeId: string) {
  const node = graph.byId.get(nodeId);
  return node ? moveLabel(node) : nodeId;
}

function apply(steps: Step[], event: TalEvent): Step[] {
  switch (event.type) {
    case 'text': {
      const last = steps.at(-1);
      if (last?.kind === 'text')
        return [...steps.slice(0, -1), { kind: 'text', text: last.text + event.text }];
      return [...steps, { kind: 'text', text: event.text }];
    }
    case 'tool_call':
      return [
        ...steps,
        {
          kind: 'tool',
          name: event.name,
          nodeId: event.input.nodeId ? String(event.input.nodeId) : undefined,
        },
      ];
    case 'tool_result': {
      const index = steps.findLastIndex(
        (s) =>
          s.kind === 'tool' &&
          s.name === event.name &&
          !('isError' in s && s.isError !== undefined),
      );
      if (index < 0) return steps;
      const step = steps[index] as Extract<Step, { kind: 'tool' }>;
      return steps.with(index, { ...step, isError: event.isError, depth: depthOf(event.result) });
    }
    default:
      return steps;
  }
}
