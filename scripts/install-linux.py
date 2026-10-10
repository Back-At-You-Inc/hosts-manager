#!/usr/bin/env python3
"""Install the official Hosts Manager Linux x64 app for the current user."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

REPOSITORY = 'Back-At-You-Inc/hosts-manager'
API = 'https://api.github.com/repos/' + REPOSITORY + '/releases/'


def download(url, destination):
    request = urllib.request.Request(url, headers={'User-Agent': 'Hosts-Manager-Installer'})
    with urllib.request.urlopen(request, timeout=60) as response, destination.open('wb') as output:
        shutil.copyfileobj(response, output)


def verify(archive, sums, name):
    entries = [line.split() for line in sums.splitlines()]
    hashes = [entry[0] for entry in entries if len(entry) == 2 and entry[1] == name]
    if len(hashes) != 1 or not re.fullmatch(r'[a-f0-9]{64}', hashes[0]):
        raise ValueError('Missing or invalid archive checksum.')
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != hashes[0]:
        raise ValueError('Archive checksum does not match. Existing installation was not changed.')


def extract(archive, destination):
    # Electron archives need ordinary symlinks; reject escaping paths and devices.
    root = destination.resolve()
    with tarfile.open(archive, 'r:gz') as bundle:
        for member in bundle:
            path = (root / member.name).resolve()
            if Path(member.name).is_absolute() or not path.is_relative_to(root):
                raise ValueError('Unsafe archive path.')
            if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
                raise ValueError('Unsupported archive entry.')
            if member.issym() or member.islnk():
                target = (path.parent / member.linkname if member.issym() else root / member.linkname).resolve()
                if not target.is_relative_to(root):
                    raise ValueError('Unsafe archive link.')
            # Use a validated entry; remove setuid/setgid permission bits.
            member.mode &= 0o777
            bundle.extract(member, root)


def desktop_quote(value):
    if '\n' in value or '\r' in value:
        raise ValueError('Installation path cannot contain line breaks.')
    # Desktop Exec has both string escaping and command argument escaping.
    escaped = value.replace('\\', '\\\\\\\\').replace('"', '\\\\"').replace('`', '\\\\`').replace('$', '\\\\$').replace('%', '%%')
    return '"' + escaped + '"'


def install(archive, sums, version, data_home, bin_home):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('A stable version is required.')
    verify(archive, sums, 'Hosts-Manager-' + version + '-linux-x64.tar.gz')
    base = data_home / 'hosts-manager-app'
    desktop_quote(str(base / 'current' / 'hosts-manager'))
    launcher = bin_home / 'hosts-manager'
    if launcher.is_symlink():
        if launcher.readlink() != base / 'current' / 'hosts-manager':
            raise ValueError('Refusing to replace an unrelated hosts-manager symlink.')
    elif launcher.exists():
        raise ValueError('Refusing to replace an unrelated hosts-manager command.')
    base.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.install-', dir=base) as directory:
        staging = Path(directory) / 'app'
        staging.mkdir()
        extract(archive, staging)
        candidates = [p for p in staging.rglob('hosts-manager') if p.is_file() and not p.is_symlink()]
        if len(candidates) != 1:
            raise ValueError('Archive must contain exactly one hosts-manager executable.')
        binary = candidates[0]
        binary.chmod(binary.stat().st_mode | 0o100)
        # Keep the complete Electron distribution together.
        app_root = binary.parent
        target = base / ('v' + version)
        if target.exists():
            raise ValueError('This version is already installed; uninstall before reinstalling it.')
        shutil.move(str(app_root), target)
    current = base / 'current'
    pending = base / '.current-new'
    if pending.is_symlink():
        pending.unlink()
    pending.symlink_to(target, target_is_directory=True)
    pending.replace(current)
    bin_home.mkdir(parents=True, exist_ok=True)
    launcher = bin_home / 'hosts-manager'
    if launcher.exists() and not launcher.is_symlink():
        raise ValueError('Refusing to replace an unrelated hosts-manager command.')
    if launcher.is_symlink():
        if launcher.readlink() != current / 'hosts-manager':
            raise ValueError('Refusing to replace an unrelated hosts-manager symlink.')
        launcher.unlink()
    launcher.symlink_to(current / 'hosts-manager')
    icons = list((current / 'resources').rglob('app-icon.png')) if (current / 'resources').exists() else []
    # The app icon may be inside app.asar; use a bundled installer icon instead.
    icon = base / 'icon.png'
    icon_line = 'Icon=hosts-manager\n'
    if icons:
        shutil.copyfile(icons[0], icon)
        icon_line = 'Icon=' + str(icon).replace('\\', '\\\\') + '\n'
    applications = data_home / 'applications'
    applications.mkdir(parents=True, exist_ok=True)
    desktop = applications / 'com.hostsmanager.desktop.desktop'
    desktop.write_text('[Desktop Entry]\nType=Application\nName=Hosts Manager\nComment=Manage hosts files with switchable groups\nExec=' + desktop_quote(str(current / 'hosts-manager')) + '\n' + icon_line + 'Terminal=false\nCategories=Utility;\n', encoding='utf-8')
    if shutil.which('update-desktop-database'):
        subprocess.run(['update-desktop-database', str(applications)], check=False)
    return launcher


def uninstall(data_home, bin_home):
    base = data_home / 'hosts-manager-app'
    launcher = bin_home / 'hosts-manager'
    if launcher.is_symlink() and launcher.readlink() == base / 'current' / 'hosts-manager':
        launcher.unlink()
    desktop = data_home / 'applications' / 'com.hostsmanager.desktop.desktop'
    if desktop.exists():
        desktop.unlink()
    if base.exists():
        shutil.rmtree(base)
    print('Hosts Manager removed. Saved groups and the system hosts file were preserved.')


def main():
    if sys.version_info < (3, 9):
        raise RuntimeError('Python 3.9 or newer is required.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', help='Install a specific stable release, such as 0.1.11')
    parser.add_argument('--uninstall', action='store_true', help='Remove the app while preserving saved groups and hosts entries')
    args = parser.parse_args()
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'amd64'):
        parser.error('This installer supports Linux x64 only.')
    if hasattr(os, 'geteuid') and os.geteuid() == 0:
        parser.error('Run this installer as your desktop user, without sudo.')
    data_home = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share').expanduser().absolute()
    bin_home = Path.home() / '.local/bin'
    if args.uninstall:
        uninstall(data_home, bin_home)
        return
    if args.version and not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
        parser.error('--version must be a stable version, such as 0.1.11.')
    print('Close Hosts Manager and save drafts before installing or upgrading.')
    with tempfile.TemporaryDirectory(prefix='hosts-manager-download-') as directory:
        temp = Path(directory)
        download(API + ('tags/v' + args.version if args.version else 'latest'), temp / 'release.json')
        release = json.loads((temp / 'release.json').read_text())
        version = release.get('tag_name', '').removeprefix('v')
        if release.get('draft') or release.get('prerelease') or not re.fullmatch(r'\d+\.\d+\.\d+', version):
            raise ValueError('Only stable published releases can be installed.')
        name = 'Hosts-Manager-' + version + '-linux-x64.tar.gz'
        prefix = 'https://github.com/' + REPOSITORY + '/releases/download/v' + version + '/'
        available = {asset['name'] for asset in release.get('assets', [])}
        if name not in available or 'SHA256SUMS' not in available:
            raise ValueError('Release is missing its Linux archive or checksums.')
        download(prefix + name, temp / name)
        download(prefix + 'SHA256SUMS', temp / 'SHA256SUMS')
        launcher = install(temp / name, (temp / 'SHA256SUMS').read_text(), version, data_home, bin_home)
    print('Installed Hosts Manager. Open it from your application menu or run ' + str(launcher))
    if not shutil.which('pkexec'):
        print('Hosts file updates require PolicyKit (pkexec) and a desktop authentication agent. Install them using your distribution package manager.')
    print('An existing desktop session and Electron runtime libraries are required. This installer does not change the hosts file or disable Chromium sandboxing.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Installation failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
