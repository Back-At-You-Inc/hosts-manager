import type { ApplyResult, HostsState } from '../shared/types';

interface CloseOptions {
  pending: () => Promise<unknown>[];
  state: () => HostsState;
  apply: (state: HostsState) => Promise<ApplyResult>;
}

export async function prepareHostsClose(options: CloseOptions): Promise<ApplyResult> {
  // Callers block new writes before taking this snapshot of pending operations.
  await Promise.allSettled(options.pending());
  const current = options.state();
  if (!current.active) return { ok: true, message: 'Hosts management is off.' };
  return options.apply({ ...current, active: false });
}
