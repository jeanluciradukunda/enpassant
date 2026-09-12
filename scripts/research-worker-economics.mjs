import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Sensitivity model only: no engine execution, AWS calls, or account access.
// All times and traffic below are scenario inputs, not measured throughput.
const rates = {
  region: 'us-east-1',
  checkedOn: '2026-09-09',
  platform: 'Linux x86 on-demand',
  vcpuSecond: 0.04048 / 3600,
  gbSecond: 0.004445 / 3600,
  publicIpv4Hour: 0.005,
  minimumTaskSeconds: 60,
  rateBasis:
    'AWS hourly price-feed meters; the public per-second prose example rounds differently.',
  sources: [
    'https://aws.amazon.com/fargate/pricing/',
    'https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ecs/USD/current/ecs.json',
    'https://aws.amazon.com/vpc/pricing/',
  ],
};

export function model({ roots, hitRate, batchSize, secondsPerRoot, startupSeconds, attempts = 1 }) {
  assert(Number.isInteger(roots) && roots >= 0);
  assert(hitRate >= 0 && hitRate <= 1);
  assert(Number.isInteger(batchSize) && batchSize > 0);
  assert(Number.isInteger(attempts) && attempts > 0);
  assert(secondsPerRoot >= 0 && startupSeconds >= 0);
  const misses = Math.ceil(roots * (1 - hitRate) - Number.EPSILON * roots);
  let taskSeconds = 0;
  let billedSeconds = 0;
  let tasks = 0;
  for (let remaining = misses; remaining > 0; remaining -= batchSize) {
    const batch = Math.min(remaining, batchSize);
    const elapsed = startupSeconds + batch * secondsPerRoot;
    taskSeconds += elapsed * attempts;
    billedSeconds += Math.max(rates.minimumTaskSeconds, Math.ceil(elapsed)) * attempts;
    tasks += attempts;
  }
  const engineSeconds = misses * secondsPerRoot * attempts;
  const computeUsd = billedSeconds * (rates.vcpuSecond + 2 * rates.gbSecond);
  // Conservative planning proxy: reserve the IP for the billed task window.
  // AWS IPv4 allocation timing must be reconciled against actual task events.
  const ipv4AllowanceUsd = (billedSeconds / 3600) * rates.publicIpv4Hour;
  return {
    roots,
    hitRate,
    batchSize,
    secondsPerRoot,
    startupSeconds,
    attempts,
    misses,
    tasks,
    engineHours: engineSeconds / 3600,
    taskHours: taskSeconds / 3600,
    billedTaskHours: billedSeconds / 3600,
    computeUsd,
    ipv4AllowanceUsd,
    computeAndIpv4AllowanceUsd: computeUsd + ipv4AllowanceUsd,
    billedToProductiveRatio: engineSeconds ? billedSeconds / engineSeconds : null,
    exceedsTwentyBilledHours: billedSeconds > 20 * 3600,
  };
}

const cases = [];
for (const secondsPerRoot of [0.4, 5, 60, 120]) {
  for (const hitRate of [0, 0.5, 0.9, 0.99, 1]) {
    for (const batchSize of [1, 4, 16, 80]) {
      cases.push(model({ roots: 80_000, hitRate, batchSize, secondsPerRoot, startupSeconds: 20 }));
    }
  }
}

// Invariants challenge the billing boundary, tail batches, reuse and retries.
const empty = model({
  roots: 80_000,
  hitRate: 1,
  batchSize: 4,
  secondsPerRoot: 60,
  startupSeconds: 20,
});
assert.equal(empty.tasks, 0);
assert.equal(empty.computeAndIpv4AllowanceUsd, 0);
const one = model({ roots: 1, hitRate: 0, batchSize: 1, secondsPerRoot: 0.4, startupSeconds: 20 });
assert.equal(one.billedTaskHours, 1 / 60);
assert.equal(one.billedToProductiveRatio, 150);
const fractional = model({
  roots: 1,
  hitRate: 0,
  batchSize: 1,
  secondsPerRoot: 60.1,
  startupSeconds: 0,
});
assert.equal(fractional.billedTaskHours, 61 / 3600);
const tail = model({ roots: 5, hitRate: 0, batchSize: 4, secondsPerRoot: 60, startupSeconds: 20 });
assert.equal(tail.tasks, 2);
assert.equal(tail.billedTaskHours, 340 / 3600);
const retry = model({
  roots: 5,
  hitRate: 0,
  batchSize: 4,
  secondsPerRoot: 60,
  startupSeconds: 20,
  attempts: 2,
});
assert.equal(retry.billedTaskHours, tail.billedTaskHours * 2);
for (const row of cases) {
  assert(row.billedTaskHours >= row.taskHours);
  assert(row.taskHours >= row.engineHours);
}

const assumptions = {
  requestedRoots: '80,000 root requests, illustratively 1,000 visits requesting 80 roots each',
  workload: 'Synthetic demand, not a user-count forecast or a default product allowance',
  reuse:
    'Hit rate applies only to compatible, authorized immutable engine results; no assumed FEN-only sharing',
  secondsPerRoot:
    '0.4, 5, 60 and 120 wall-seconds at one engine thread; quality/depth is not modeled',
  fallback:
    '120-second row includes two 60-second searches; other rows do not implicitly include fallback',
  taskShape: 'One allocated vCPU, 2 GB RAM; roots run serially in each bounded batch',
  startup: '20 seconds is an unmeasured sensitivity input, not a Fargate cold-start claim',
  batching:
    'Batch size affects fairness/cancellation/latency; 80-root batches exceed the draft four-root free-request limit',
  retries:
    'Main table assumes one successful attempt. Retry invariant models two full attempts, not a measured failure rate',
  ipv4: 'Public-IP charge is reserved for the billable task window as a conservative approximation',
  exclusions:
    'Logs, transfer, registry, result storage, orphan-reaper costs, tax and any additional charges',
  scope:
    'Pure deterministic calculator; does not prove worker implementation, admission safety or cloud throughput',
};
await writeFile(
  new URL('../docs/platform/research/evidence/worker-economics.json', import.meta.url),
  `${JSON.stringify({ rates, assumptions, cases }, null, 2)}\n`,
);
console.log(`Verified billing invariants; wrote ${cases.length} labeled sensitivity scenarios.`);
