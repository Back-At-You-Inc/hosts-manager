export interface HostGroup { id: string; name: string; enabled: boolean; content: string }
export interface HostsState { active: boolean; groups: HostGroup[]; systemPosition?: number }
export interface ApplyResult { ok: boolean; message: string }
export interface StateUpdate { state: HostsState; result: ApplyResult }
export interface HostsApi {
  load(): Promise<{ state: HostsState; hostsPath: string; platform: string }>;
  readSystem(): Promise<string>;
  saveSystem(content: string, expected: string): Promise<ApplyResult>;
  save(state: HostsState): Promise<HostsState>;
  apply(state: HostsState): Promise<ApplyResult>;
  checkUpdates(): Promise<UpdateStatus>;
  openUpdate(): Promise<void>;
  onUpdateAvailable(callback: (update: UpdateStatus) => void): () => void;
  onUpdate(callback: (update: StateUpdate) => void): () => void;
}

export interface UpdateStatus { status: 'unconfigured' | 'current' | 'available' | 'error'; currentVersion: string; version?: string; url?: string; message: string }
