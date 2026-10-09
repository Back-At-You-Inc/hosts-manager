import { Fragment, useEffect, useRef, useState } from 'react';
import type { ApplyResult, HostGroup, HostsState, UpdateStatus } from '../shared/types';

const SYSTEM_ID = '__system_hosts__';

function Toggle({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return <button className="switch" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={onChange} />;
}

export function App() {
  const [state, setState] = useState<HostsState>();
  const [selected, setSelected] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [system, setSystem] = useState('');
  const systemBaseline = useRef<string | undefined>(undefined);
  const [systemError, setSystemError] = useState<string>();
  const [hostsPath, setHostsPath] = useState('');
  const [saveStatus, setSaveStatus] = useState('● All changes saved');
  const [notice, setNotice] = useState<ApplyResult>();
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>();
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [dragging, setDragging] = useState<string>();
  const [dropTarget, setDropTarget] = useState<number>();
  const [titleDraft, setTitleDraft] = useState('');
  const cancelTitle = useRef(false);
  const [name, setName] = useState('');
  const live = useRef<HostsState | undefined>(undefined);
  const lines = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const errorNotice = (error: unknown) => setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });

  useEffect(() => {
    let mounted = true;
    window.hosts.load().then(data => {
      if (!mounted) return;
      live.current = data.state; setState(data.state); setSelected(data.state.groups[0]?.id ?? SYSTEM_ID); setHostsPath(data.hostsPath);
    }).catch(error => { if (mounted) errorNotice(error); });
    void window.hosts.readSystem().then(setSystem).catch(error => setSystemError(error instanceof Error ? error.message : String(error)));
    const unsubscribe = window.hosts.onUpdate(data => {
      live.current = data.state; setState(data.state); setSelected(previous => previous === SYSTEM_ID || data.state.groups.some(g => g.id === previous) ? previous : data.state.groups[0]?.id ?? SYSTEM_ID); setNotice(data.result);
    });
    const unsubscribeUpdates = window.hosts.onUpdateAvailable(setUpdate);
    return () => { mounted = false; unsubscribe(); unsubscribeUpdates(); };
  }, []);

  useEffect(() => {
    if (selected !== SYSTEM_ID) return;
    let mounted = true;
    window.hosts.readSystem().then(content => { if (mounted) { setSystem(content); setSystemError(undefined); } }).catch(error => { if (mounted) setSystemError(error instanceof Error ? error.message : String(error)); });
    return () => { mounted = false; };
  }, [selected]);

  useEffect(() => {
    if (!notice?.ok) return;
    const timeout = setTimeout(() => setNotice(undefined), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);

  async function checkUpdates() {
    if (checkingUpdates) return;
    setCheckingUpdates(true);
    try {
      const result = await window.hosts.checkUpdates(); setUpdate(result);
      if (result.status !== 'available') setNotice({ ok: result.status === 'current', message: result.message });
    } catch (error) { errorNotice(error); }
    finally { setCheckingUpdates(false); }
  }
  async function openUpdate() {
    try { await window.hosts.openUpdate(); } catch (error) { errorNotice(error); }
  }
  async function refreshSystem() {
    try { setSystem(await window.hosts.readSystem()); setSystemError(undefined); }
    catch (error) { setSystemError(error instanceof Error ? error.message : String(error)); }
  }
  async function change(next: HostsState): Promise<boolean> {
    if (locked.current || !live.current) return false;
    const previous = live.current;
    locked.current = true; setBusy(true); setSaveStatus('● Updating…');
    try {
      // Settings use saved content; editor drafts are only committed by Save.
      if (next.active || previous.active) {
        const result = await window.hosts.apply(next);
        if (!result.ok) { setNotice(result); setSaveStatus('● Update failed'); return false; }
        await refreshSystem();
      } else await window.hosts.save(next);
      live.current = next; setState(next); setSaveStatus('● All changes saved');
      return true;
    } catch (error) { errorNotice(error); setSaveStatus('● Update failed'); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  function updateGroup(patch: Partial<HostGroup>) {
    if (!live.current) return;
    void change({ ...live.current, groups: live.current.groups.map(g => g.id === selected ? { ...g, ...patch } : g) });
  }
  function editedSnapshot() {
    const snapshot = structuredClone(live.current!);
    if (selected && drafts[selected] !== undefined) snapshot.groups = snapshot.groups.map(g => g.id === selected ? { ...g, content: drafts[selected] } : g);
    return snapshot;
  }
  function clearDraft(id: string | undefined = selected) {
    if (!id) return;
    setDrafts(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  async function save(): Promise<boolean> {
    if (!live.current || locked.current) return false;
    locked.current = true; setBusy(true); setSavingText(true); setSaveStatus('● Saving…');
    try {
      if (selected === SYSTEM_ID) {
        const result = await window.hosts.saveSystem(drafts[SYSTEM_ID] ?? system, systemBaseline.current ?? system);
        setNotice(result);
        if (result.ok) { clearDraft(SYSTEM_ID); systemBaseline.current = undefined; await refreshSystem(); setSaveStatus('● All changes saved'); }
        else setSaveStatus('● Save failed');
        return result.ok;
      }
      const snapshot = editedSnapshot();
      await window.hosts.save(snapshot);
      live.current = snapshot; setState(snapshot); clearDraft();
      setSaveStatus('● All changes saved');
      if (snapshot.active && snapshot.groups.find(g => g.id === selected)?.enabled) {
        const result = await window.hosts.apply(snapshot);
        setNotice(result.ok ? { ok: true, message: 'Group saved.' } : { ok: false, message: `Group saved, but the hosts file could not be updated: ${result.message}` });
        if (result.ok) await refreshSystem();
        return result.ok;
      }
      setNotice({ ok: true, message: 'Group saved.' });
      return true;
    } catch (error) { errorNotice(error); setSaveStatus('● Save failed'); return false; }
    finally { locked.current = false; setBusy(false); setSavingText(false); }
  }
  function navigate(id: string) {
    if (!locked.current) setSelected(id);
  }
  function isDirty(id: string) {
    if (id === SYSTEM_ID) return drafts[id] !== undefined && drafts[id] !== (systemBaseline.current ?? system);
    const saved = state?.groups.find(g => g.id === id);
    return !!saved && drafts[id] !== undefined && drafts[id] !== saved.content;
  }
  function reorder(id: string, to: number) {
    if (!live.current || busy || id === SYSTEM_ID) return;
    const current = live.current;
    const ids = current.groups.map(g => g.id);
    ids.splice(current.systemPosition ?? 0, 0, SYSTEM_ID);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(from, 1); ids.splice(to, 0, id);
    void change({ ...current, systemPosition: ids.indexOf(SYSTEM_ID), groups: ids.filter(key => key !== SYSTEM_ID).map(key => current.groups.find(g => g.id === key)!) });
  }
  function dropAtBoundary(id: string, boundary: number) {
    if (!live.current || !dragging || busy) return;
    const ids = live.current.groups.map(g => g.id);
    ids.splice(live.current.systemPosition ?? 0, 0, SYSTEM_ID);
    const from = ids.indexOf(id);
    if (from < 0 || boundary < 0 || boundary > ids.length) return;
    reorder(id, boundary - (from < boundary ? 1 : 0));
    setDragging(undefined); setDropTarget(undefined);
  }
  function dropSlot(boundary: number) {
    return <div className={`drop-slot${dropTarget === boundary && dragging ? ' active' : ''}`} data-drop-index={boundary}
      onDragOver={event => { if (!dragging || busy) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(boundary); }}
      onDrop={event => { event.preventDefault(); dropAtBoundary(event.dataTransfer.getData('text/plain'), boundary); }}>
      <span aria-hidden="true" className="drop-marker">
        <svg className="drop-chevron" viewBox="0 0 8 12" fill="none"><path d="m2 2 4 4-4 4" /></svg>
        <span className="drop-line" />
        <svg className="drop-chevron" viewBox="0 0 8 12" fill="none"><path d="m6 2-4 4 4 4" /></svg>
      </span>
    </div>;
  }
  function openName() {
    setName(''); dialog.current?.showModal();
  }
  async function saveName() {
    if (!state || !name.trim()) return;
    const next: HostGroup = { id: crypto.randomUUID(), name: name.trim(), enabled: false, content: '# IP address    hostname\n' };
    if (await change({ ...state, groups: [...state.groups, next] })) { dialog.current?.close(); navigate(next.id); }
  }
  function saveTitle() {
    if (cancelTitle.current) { cancelTitle.current = false; return; }
    if (!group) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== group.name) updateGroup({ name: trimmed });
    setTitleDraft(trimmed || group.name);
  }
  async function deleteGroup(id: string) {
    const target = state?.groups.find(g => g.id === id);
    if (!state || !target || busy || !confirm(`Delete “${target.name}”?`)) return;
    const index = state.groups.findIndex(g => g.id === id);
    const position = state.systemPosition ?? 0;
    const groups = state.groups.filter(g => g.id !== id);
    if (!await change({ ...state, groups, systemPosition: position - (index < position ? 1 : 0) })) return;
    clearDraft(id);
    if (selected === id) setSelected(groups[0]?.id ?? SYSTEM_ID);
  }
  const group = state?.groups.find(g => g.id === selected);
  useEffect(() => {
    setTitleDraft(group?.name || ''); cancelTitle.current = false;
  }, [group?.id, group?.name]);
  const isSystem = selected === SYSTEM_ID;
  const content = isSystem ? drafts[SYSTEM_ID] ?? system : group ? drafts[group.id] ?? group.content : '';
  const dirty = !!selected && isDirty(selected);
  const items: HostGroup[] = state ? [...state.groups] : [];
  if (state) items.splice(state.systemPosition ?? 0, 0, { id: SYSTEM_ID, name: 'System', enabled: true, content: system });
  const count = content.split('\n').filter(line => line.split('#')[0].trim()).length;

  return <>
    <aside>
      <div className="brand"><span className="logo">H</span> Hosts Manager</div>
      <div className="workspace">YOUR WORKSPACE</div>
      <div className="list-heading"><span>Host groups</span><button title="Create group" aria-label="Create group" disabled={!state || busy} onClick={openName}>+</button></div>
      <div id="groups" onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(undefined); }}>{items.map((item, index) => <Fragment key={item.id}>{dropSlot(index)}<div
        className={`group-row${item.id === selected ? ' selected' : ''}${item.id === dragging ? ' dragging' : ''}`}
        onClick={() => navigate(item.id)}
        draggable={!busy && item.id !== SYSTEM_ID}
        onDragStart={event => { setDragging(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }}
        onDragEnd={() => { setDragging(undefined); setDropTarget(undefined); }}
        onDragOver={event => {
          if (!dragging || busy) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          setDropTarget(index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0));
        }}
        onDrop={event => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          dropAtBoundary(event.dataTransfer.getData('text/plain'), index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0));
        }}>
        <span className="grip" aria-hidden="true">⠿</span>
        <button className="row-select" aria-pressed={item.id === selected}
          aria-label={item.id === SYSTEM_ID ? `System${isDirty(item.id) ? ', unsaved changes' : ''}` : `${item.name}, ${item.enabled ? 'enabled' : 'disabled'}${isDirty(item.id) ? ', unsaved changes' : ''}. Use Alt and arrow keys to reorder.`}
          onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); reorder(item.id, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}>
          <span className="name">{item.name}</span>
        </button>
        <span className="row-action">
          <span className={`group-dot${item.enabled ? ' enabled' : ''}${isDirty(item.id) ? ' dirty' : ''}`} title={isDirty(item.id) ? 'Unsaved changes' : item.enabled ? 'Enabled' : 'Disabled'} />
          {item.id !== SYSTEM_ID && <button className="row-delete" title={`Delete ${item.name}`} aria-label={`Delete ${item.name}`} disabled={busy} onClick={event => { event.stopPropagation(); deleteGroup(item.id); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
          </button>}
        </span>
      </div></Fragment>)}{dropSlot(items.length)}</div>
      <div className="sidebar-management"><div className="global"><div><strong>Hosts management</strong><span>{state?.active ? 'Enabled' : 'Disabled'}</span></div><Toggle checked={!!state?.active} label="Enable hosts management" disabled={!state || busy} onChange={() => { if (live.current) void change({ ...live.current, active: !live.current.active }); }} /></div><p>Apply enabled groups to your system.</p></div>
      {update?.status === 'available' && <div className="update-card" role="status">
        <strong>Update available · {update.version}</strong>
        <p>Download the new version from GitHub and install it when you're ready.</p>
        <button onClick={() => void openUpdate()}>Download update ↗</button>
      </div>}
      <div className="update-controls"><button disabled={checkingUpdates} onClick={() => void checkUpdates()}>{checkingUpdates ? 'Checking for updates…' : 'Check for updates'}</button>{update && <span>Version {update.currentVersion}</span>}</div>
      <div className="sidebar-bottom"><span className="small-icon">↕</span> Drag groups to set their priority.<br /><span>Groups are applied from top to bottom.</span></div>
    </aside>
    <main>
      <header><div><span className="eyebrow">WORKSPACE / {isSystem ? 'SYSTEM HOSTS' : 'HOST GROUPS'}</span><div className="group-title">{group ? <input className="group-title-input" aria-label="Group title" title="Edit group name" maxLength={80} value={titleDraft} disabled={busy}
          onChange={event => setTitleDraft(event.target.value)} onFocus={event => { cancelTitle.current = false; event.target.select(); }} onBlur={saveTitle}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') { event.preventDefault(); cancelTitle.current = true; setTitleDraft(group.name); event.currentTarget.blur(); }
          }} /> : <h1>{isSystem ? 'System' : 'Your host groups'}</h1>}{dirty && <span className="unsaved-badge" role="status">Unsaved changes</span>}</div></div>
        {!isSystem && <div className="group-enable"><span>Enable group</span><Toggle checked={!!group?.enabled} label="Enable selected group" disabled={!group || busy} onChange={() => updateGroup({ enabled: !group?.enabled })} /></div>}
      </header>
      <section className="editor-card">
        <div className="editor-info"><span><span className="dot" /> {isSystem ? 'System hosts entries' : group?.enabled ? 'Included when hosts management is enabled' : 'This group is disabled'}</span><span>Plain text · UTF-8</span></div>
        <div className="code-editor"><div id="line-numbers" ref={lines} aria-hidden="true">{content.split('\n').map((_, i) => i + 1).join('\n')}</div><textarea spellCheck={false} aria-label={isSystem ? 'System hosts entries' : 'Hosts entries'} disabled={(!group && !isSystem) || busy || (isSystem && !!systemError)} value={content} onChange={event => {
          if (isSystem && systemBaseline.current === undefined) systemBaseline.current = system;
          const id = isSystem ? SYSTEM_ID : group?.id;
          if (id) { setDrafts(previous => ({ ...previous, [id]: event.target.value })); setNotice(undefined); }
        }} onScroll={event => { if (lines.current) lines.current.scrollTop = event.currentTarget.scrollTop; }} placeholder={'# Add your hosts entries here\n127.0.0.1  example.local'} /></div>
        <div className="editor-footer"><span>{count} {count === 1 ? 'entry' : 'entries'}</span><span>IP address <span className="arrow">→</span> hostname</span></div>
      </section>
      <div className="hint"><span className="hint-icon">i</span><div><strong>{isSystem ? 'Your system hosts file.' : 'Set the order of your hosts entries.'}</strong><p>{isSystem ? 'Save changes directly to your system hosts file. Enabled group entries are preserved.' : 'Drag groups above or below System to choose where their entries are applied.'}</p></div></div>
      <footer><div><span className={dirty ? "unsaved" : "saved"}>{dirty ? "● Unsaved changes" : saveStatus}</span><div className="muted">{hostsPath}</div></div>{<button className="primary" disabled={(!group && !isSystem) || busy || (isSystem && !!systemError)} onClick={() => void save()}>{savingText ? 'Saving…' : 'Save'}</button>}</footer>
      {isSystem && systemError && <div className="system-error" role="alert">Unable to read system hosts file: {systemError}</div>}
      {notice && <div className={`toast${notice.ok ? '' : ' error'}`} role={notice.ok ? 'status' : 'alert'}>
        <span className="toast-message">{notice.message}</span>
        <button className="toast-dismiss" aria-label="Dismiss notification" onClick={() => setNotice(undefined)}>×</button>
      </div>}
    </main>
    <dialog ref={dialog}><form onSubmit={event => { event.preventDefault(); saveName(); }}>
      <h2>New host group</h2><label htmlFor="group-name">Group name</label><input id="group-name" maxLength={80} required autoFocus autoComplete="off" value={name} onChange={event => setName(event.target.value)} />
      <div className="dialog-actions"><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className="primary" disabled={!name.trim()}>Create group</button></div>
    </form></dialog>
  </>;
}
