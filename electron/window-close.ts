export function handleWindowClose(options: {
  platform: string;
  hasTray: boolean;
  allowClose: boolean;
  quitting: boolean;
  preventDefault: () => void;
  hide: () => void;
  minimize: () => void;
}): void {
  if (options.allowClose) return;
  options.preventDefault();
  if (options.quitting) return;
  if (options.hasTray || options.platform === 'darwin') options.hide();
  else options.minimize();
}
