# Linux installer

The installer supports Linux x64 with Python 3.9 or newer and a graphical desktop.
It downloads the official stable tar.gz release, verifies its SHA-256 checksum,
and installs the complete Electron app for the current user. No FUSE installation
is needed because this uses the tar.gz package rather than the AppImage.

After this repository is public and a release containing the installer is published:

```sh
curl -fL --output install-linux.py https://github.com/Back-At-You-Inc/hosts-manager/releases/latest/download/install-linux.py
python3 install-linux.py
```

You can review the downloaded script before running it. Do not run it with sudo.
The repository is currently private, so anonymous downloads are not yet available.
Use an authenticated GitHub download or a local checkout until public launch.

```sh
# From a local checkout:
python3 scripts/install-linux.py

# Install a specific stable release:
python3 install-linux.py --version 0.1.11
```

A local checkout does not authenticate the installer's release downloads. While
releases are private, this installer cannot fetch them anonymously.

## What it sets up

- The app under `${XDG_DATA_HOME:-$HOME/.local/share}/hosts-manager-app/`.
- A `~/.local/bin/hosts-manager` launcher.
- A **Hosts Manager** application-menu entry and the bundled H icon.

Run the launcher by its full path if `~/.local/bin` is not on your PATH. A desktop
may take a moment to refresh its application menu. Launch is deliberately manual:
the installer never edits `/etc/hosts` or requests hosts-file administrator rights.

The desktop needs Electron's normal runtime libraries and a working Chromium
sandbox configuration. Protected hosts changes also require PolicyKit (`pkexec`)
and a desktop authentication agent. The installer reports missing `pkexec`;
install missing system dependencies through your distribution's package manager.
It does not install system packages or disable sandboxing.

## Upgrades and removal

Save text drafts and quit through the tray before upgrading. Rerun the script to
install the latest version. Successful installation switches the launcher to the
new version and retains earlier version folders. Installing the same version again
reports that it is already installed.

```sh
python3 install-linux.py --uninstall
```

Uninstall removes the app, its launcher, and its menu entry. Saved workspace settings
and existing system hosts entries remain in place. If you want managed entries
removed, turn **Hosts management** off in the app before uninstalling.

The release's `SHA256SUMS` also includes the install script. Archive checksum
verification detects corruption or mismatched files; it is not a publisher signature.
