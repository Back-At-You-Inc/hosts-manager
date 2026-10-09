import { isIP } from 'node:net';
import type { HostsState } from '../shared/types';
const START = '# >>> Hosts Manager';
const END = '# <<< Hosts Manager';
export function validate(content: string) {
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [ip, ...hosts] = line.split(/\s+/);
    if (!isIP(ip) || !hosts.length || hosts.some(host => !/^[a-zA-Z0-9_.-]+$/.test(host))) {
      throw new Error(`Line ${index + 1}: enter an IPv4 or IPv6 address followed by one or more hostnames.`);
    }
  }
}
// Strip both the legacy section and the sections surrounding the system entries.
export function systemContent(original: string): string {
  let inside: string | undefined;
  const kept: string[] = [];
  for (const line of original.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const text = line.replace(/\r?\n$/, '');
    const start = /^# >>> Hosts Manager( \(before system\)| \(after system\))?$/.exec(text);
    const end = /^# <<< Hosts Manager( \(before system\)| \(after system\))?$/.exec(text);
    if (start) {
      if (inside !== undefined) throw new Error('The managed hosts section is malformed. Repair its markers before applying.');
      inside = start[1] || '';
    } else if (end) {
      if (inside === undefined || inside !== (end[1] || '')) throw new Error('The managed hosts section is malformed. Repair its markers before applying.');
      inside = undefined;
    } else if (inside === undefined) kept.push(line);
  }
  if (inside !== undefined) throw new Error('The managed hosts section is malformed. Repair its markers before applying.');
  return kept.join('');
}

export function compose(original: string, state: HostsState) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const base = systemContent(original);
  if (!state.active) return base;
  // Existing workspaces keep their original groups-after-system ordering.
  const position = state.systemPosition ?? 0;
  function section(groups: HostsState['groups'], side: string) {
    const enabled = groups.filter(group => group.enabled);
    if (!enabled.length) return '';
    const lines = [`${START} (${side} system)`];
    for (const group of enabled) {
      try { validate(group.content); } catch (error) { throw new Error(`${group.name}: ${error instanceof Error ? error.message : String(error)}`); }
      lines.push(`# ${group.name.replace(/[\r\n]/g, ' ')}`, ...group.content.trim().split(/\r?\n/), '');
    }
    lines.push(`${END} (${side} system)`);
    return lines.join(newline) + newline;
  }
  const before = section(state.groups.slice(0, position), 'before');
  const after = section(state.groups.slice(position), 'after');
  return before + base + (after && base && !base.endsWith('\n') ? newline : '') + after;
}

export function composeSystem(original: string, expected: string, content: string, state: HostsState) {
  if (typeof content !== 'string' || typeof expected !== 'string' || Buffer.byteLength(content) > 1000000) throw new Error('Invalid system hosts content.');
  if (systemContent(original) !== expected) throw new Error('The system hosts file changed since editing began. Copy your edits, reload System, and try again.');
  if (/^# (>>>|<<<) Hosts Manager/m.test(content)) throw new Error('Managed section markers cannot be added to System.');
  validate(content);
  return compose(content, state);
}
