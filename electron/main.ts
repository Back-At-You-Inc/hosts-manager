import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, nativeTheme, shell, net } from 'electron';
import type { HostsState, ApplyResult, UpdateStatus } from '../shared/types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { compose, composeSystem, systemContent } from './hosts';
import { writeHosts } from './permissions';
import { checkRelease, releaseRepository } from './updates';
import { removeMacHelper } from './mac-helper';
app.setName('Hosts Manager');
nativeTheme.themeSource = 'system';
if (process.platform === 'win32') app.setAppUserModelId('com.hostsmanager.desktop');
// Retain the existing workspace data when changing the displayed app name.
app.setPath('userData', path.join(app.getPath('appData'), 'hosts-manager'));
let window: BrowserWindow;
let tray: Tray | undefined;
let state: HostsState;
let statePath: string;
let busy = false;
let quitting = false;
let updateRepository: string | undefined;
let updateStatus: UpdateStatus | undefined;
let updateCheck: Promise<UpdateStatus> | undefined;
function checkUpdates() {
  if (updateCheck) return updateCheck;
  updateCheck = checkRelease(updateRepository, app.getVersion(), process.platform, process.arch, net.fetch as typeof fetch).then(result => {
    updateStatus = result;
    if (result.status === 'available' && !window.isDestroyed()) window.webContents.send('update-available', result);
    return result;
  }).finally(() => { updateCheck = undefined; });
  return updateCheck;
}
const hostsPath = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts';
const initial = (): HostsState => ({ active: false, systemPosition: 0, groups: [
  { id: 'local', name: 'Local development', enabled: true, content: '# Your local projects\n127.0.0.1  app.local\n127.0.0.1  api.local\n' },
  { id: 'staging', name: 'Staging', enabled: false, content: '# Staging environment\n# 192.0.2.10  staging.example.com\n' }
] });
async function save(next: HostsState) {
  if (!next || typeof next.active !== 'boolean' || !Array.isArray(next.groups) || next.groups.length > 500 || next.groups.some(g => typeof g.id !== 'string' || typeof g.name !== 'string' || !g.name.trim() || typeof g.enabled !== 'boolean' || typeof g.content !== 'string' || g.content.length > 1000000)) throw new Error('Invalid group data.');
  if (next.systemPosition !== undefined && (!Number.isInteger(next.systemPosition) || next.systemPosition < 0 || next.systemPosition > next.groups.length)) throw new Error('Invalid system hosts position.');
  await fs.writeFile(statePath + '.tmp', JSON.stringify(next, null, 2));
  await fs.rename(statePath + '.tmp', statePath);
  state = next;
  updateTray();
  return state;
}
async function apply(next: HostsState = state): Promise<ApplyResult> {
  if (busy) throw new Error('An update is already in progress.');
  busy = true;
  try {
    const original = await fs.readFile(hostsPath, 'utf8');
    const updated = compose(original, next);
    await writeHosts(hostsPath, original, updated);
    await save(next);
    return { ok: true, message: next.active ? 'Enabled groups applied to your hosts file.' : 'Managed entries removed. Hosts management is off.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally { busy = false; }
}
function updateTray() {
  if (!tray) return;
  tray.setToolTip(`Hosts Manager · ${state.active ? 'On' : 'Off'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Hosts Manager', click: () => { window.show(); window.focus(); } },
    { label: 'Hosts management enabled', type: 'checkbox', checked: state.active, click: async () => {
      const result = await apply({ ...state, active: !state.active });
      window.webContents.send('state-update', { state, result });
      if (!result.ok) { window.show(); window.focus(); }
    } },
    ...(process.platform === 'darwin' ? [{ label: 'Remove administrator helper…', click: async () => {
      const answer = await dialog.showMessageBox(window, { type: 'question', message: 'Remove the administrator helper?', detail: 'Future hosts updates will ask to install it again. Existing hosts entries will stay in place.', buttons: ['Cancel', 'Remove helper'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1) return;
      try { await removeMacHelper(); window.webContents.send('state-update', { state, result: { ok: true, message: 'Administrator helper removed.' } }); }
      catch (error) { dialog.showErrorBox('Helper removal failed', error instanceof Error ? error.message : String(error)); }
    } }] : []),
    { type: 'separator' }, { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
}
app.whenReady().then(async () => {
  statePath = path.join(app.getPath('userData'), 'groups.json');
  try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = initial(); }
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets/icons/app-icon.png'));
  if (process.platform === 'darwin') app.dock?.setIcon(icon);
  window = new BrowserWindow({ icon, width: 1180, height: 800, minWidth: 850, minHeight: 600, backgroundColor: nativeTheme.shouldUseDarkColors ? '#171a22' : '#f7f8fa', title: 'Hosts Manager', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.loadFile(path.join(__dirname, '../../renderer/index.html'));
  window.on('close', event => { if (!quitting && tray) { event.preventDefault(); window.hide(); } });
  nativeTheme.on('updated', () => { if (!window.isDestroyed()) window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#171a22' : '#f7f8fa'); });
  const trayImage = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets/icons/tray-icon.png'));
  const trayIcon = process.platform === 'darwin' ? trayImage.resize({ width: 20, height: 20 }) : trayImage.resize({ width: 24, height: 24 });
  try { tray = new Tray(trayIcon); tray.on('click', () => { window.show(); window.focus(); }); updateTray(); } catch { /* Some Linux desktops do not provide a tray. */ }
  try { updateRepository = releaseRepository(JSON.parse(await fs.readFile(path.join(app.getAppPath(), 'release-config.json'), 'utf8')).repository); } catch { /* Unconfigured development builds still run. */ }
  ipcMain.handle('check-updates', () => checkUpdates());
  ipcMain.handle('open-update', async () => {
    if (updateStatus?.status === 'available' && updateStatus.url) await shell.openExternal(updateStatus.url);
  });
  if (app.isPackaged && updateRepository) {
    const initialCheck = setTimeout(() => void checkUpdates(), 3000); initialCheck.unref();
    const interval = setInterval(() => void checkUpdates(), 6 * 60 * 60 * 1000); interval.unref();
  }
  ipcMain.handle('load', () => ({ state, hostsPath, platform: process.platform }));
  ipcMain.handle('read-system', async () => systemContent(await fs.readFile(hostsPath, 'utf8')));
  ipcMain.handle('save-system', async (_, content, expected): Promise<ApplyResult> => {
    if (busy) return { ok: false, message: 'An update is already in progress.' };
    busy = true;
    try {
      const original = await fs.readFile(hostsPath, 'utf8');
      const replacement = composeSystem(original, expected, content, state);
      await writeHosts(hostsPath, original, replacement, undefined, true);
      return { ok: true, message: 'System hosts saved.' };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
    finally { busy = false; }
  });
  ipcMain.handle('save', (_, next) => save(next));
  ipcMain.handle('apply', (_, next) => apply(next));
});
app.on('activate', () => window?.show());
app.on('before-quit', () => { quitting = true; });
