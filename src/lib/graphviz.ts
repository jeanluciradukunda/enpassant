interface DotGraph {
  bb: string;
  objects: { name: string; pos?: string }[];
  edges: { id?: string; pos?: string; _draw_?: { op: string; points?: number[][] }[] }[];
}
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (value: DotGraph) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function fail(error: Error) {
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  pending.clear();
  worker?.terminate();
  worker = undefined;
}
export async function renderGraph(dot: string): Promise<DotGraph> {
  if (import.meta.env.SSR) {
    const { instance } = await import('@viz-js/viz');
    return (await instance()).renderJSON(dot) as DotGraph;
  }
  if (!worker) {
    worker = new Worker(new URL('./graphviz.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.result);
    };
    worker.onerror = worker.onmessageerror = () =>
      fail(new Error('The graph layout could not start. Resume analysis to retry.'));
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            'The graph layout took too long. Resume analysis to retry, or choose a shorter game.',
          ),
        ),
      30_000,
    );
    pending.set(id, { resolve, reject, timer });
    try {
      worker!.postMessage({ id, dot });
    } catch {
      fail(new Error('The graph layout could not start. Resume analysis to retry.'));
    }
  });
}
