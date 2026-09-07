import { instance } from '@viz-js/viz';
const viz = instance();
self.onmessage = async ({ data }: MessageEvent<{ id: number; dot: string }>) => {
  try {
    self.postMessage({ id: data.id, result: (await viz).renderJSON(data.dot) });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : 'Graph layout failed.',
    });
  }
};
