import type { HostsApi } from '../shared/types';
declare global { interface Window { hosts: HostsApi } }
