/**
 * Smart host ordering (P2-C4): pick the next WS base by connection-failure
 * score instead of blind round-robin. Pure — feed.ts feeds failure counts and
 * asks for the next index.
 */

/** Next host index: the least-failed host; on ties, round-robin past current. */
export function nextHostIndex(failures: number[], current: number): number {
  const n = failures.length;
  if (n === 0) return 0;
  const score = (i: number) => failures[i] ?? 0;
  // Round-robin baseline: the host after current.
  let best = (current + 1) % n;
  for (let i = 0; i < n; i++) {
    if (i === current) continue; // don't immediately retry the dead host
    if (score(i) < score(best)) best = i;
  }
  return best;
}

/** Mark a host healthy after a successful open. */
export function markHostHealthy(failures: number[], host: number): number[] {
  const next = [...failures];
  next[host] = 0;
  return next;
}

/** Record one failed connection for a host. */
export function markHostFailed(failures: number[], host: number): number[] {
  const next = [...failures];
  next[host] = (next[host] ?? 0) + 1;
  return next;
}
