import { readFile, writeFile } from 'node:fs/promises';
import { instance } from '@viz-js/viz';

// Source DOT is independently renderable. This only adds accessible SVG metadata.
const diagrams = new Map([
  ['aws-runtime', 'Proposed EC2 baseline and optional Fargate analysis'],
  ['runtime', 'Proposed Enpassant runtime architecture'],
  ['data', 'Core Enpassant data relationships'],
  ['jobs', 'Owner-scoped computation, subscribers, retries and cancellation'],
  ['delivery', 'Proposed CI/CD release and infrastructure paths'],
]);
const directory = new URL('../docs/platform/diagrams/', import.meta.url);
const viz = await instance();

for (const [name, title] of diagrams) {
  const dot = await readFile(new URL(`${name}.dot`, directory), 'utf8');
  const result = viz.render(dot, { format: 'svg', engine: 'dot' });
  if (result.status !== 'success' || result.errors.length) {
    throw new Error(`${name}: ${JSON.stringify(result.errors)}`);
  }
  const svg = result.output.replace(
    /<svg\b([^>]*)>/,
    `<svg$1 role="img" aria-labelledby="diagram-title"><title id="diagram-title">${title}</title>`,
  );
  await writeFile(new URL(`${name}.svg`, directory), svg);
  console.log(`${name}.svg`);
}
