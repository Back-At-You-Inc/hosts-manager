import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installer', Path(__file__).resolve().parents[1] / 'scripts/install-linux.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def archive(self, root, version='1.0.0', malicious=None):
        path = root / ('Hosts-Manager-' + version + '-linux-x64.tar.gz')
        with tarfile.open(path, 'w:gz') as archive:
            for name, body in [('bundle/hosts-manager', b'#!/bin/sh\nexit 0\n'), ('bundle/resources/app-icon.png', b'icon')]:
                entry = tarfile.TarInfo(name)
                entry.size = len(body)
                entry.mode = 0o755 if name.endswith('hosts-manager') else 0o644
                archive.addfile(entry, io.BytesIO(body))
            if malicious:
                archive.addfile(malicious)
        sums = hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name
        return path, sums

    def test_install_and_upgrade_preserve_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data, binary = root / 'data with spaces', root / 'bin'
            settings = data / 'hosts-manager/settings.json'
            settings.parent.mkdir(parents=True)
            settings.write_text('groups')
            path, sums = self.archive(root)
            launcher = installer.install(path, sums, '1.0.0', data, binary)
            self.assertTrue(launcher.is_symlink())
            desktop = (data / 'applications/com.hostsmanager.desktop.desktop').read_text()
            self.assertIn('Exec="', desktop)
            self.assertIn('Icon=', desktop)
            self.assertEqual((data / 'hosts-manager-app/icon.png').read_bytes(), b'icon')
            path, sums = self.archive(root, '1.0.1')
            installer.install(path, sums, '1.0.1', data, binary)
            self.assertEqual((data / 'hosts-manager-app/current').resolve().name, 'v1.0.1')
            self.assertEqual(settings.read_text(), 'groups')
            installer.uninstall(data, binary)
            self.assertFalse(launcher.is_symlink())
            self.assertFalse((data / 'hosts-manager-app').exists())
            self.assertEqual(settings.read_text(), 'groups')

    def test_bad_checksum_does_not_install(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, sums = self.archive(root)
            with self.assertRaises(ValueError):
                installer.install(path, '0' * 64 + '  ' + path.name, '1.0.0', root / 'data', root / 'bin')
            self.assertFalse((root / 'data').exists())

    def test_escaping_paths_and_links_are_rejected(self):
        for name, link in [('../escape', None), ('/absolute', None), ('bundle/link', '../../outside')]:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                entry = tarfile.TarInfo(name)
                if link:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = link
                path, sums = self.archive(root, malicious=entry)
                with self.assertRaises(ValueError):
                    installer.install(path, sums, '1.0.0', root / 'data', root / 'bin')
                self.assertFalse((root / 'escape').exists())

    def test_unrelated_launcher_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'bin').mkdir()
            (root / 'bin/hosts-manager').write_text('unrelated')
            path, sums = self.archive(root)
            with self.assertRaises(ValueError):
                installer.install(path, sums, '1.0.0', root / 'data', root / 'bin')
            self.assertEqual((root / 'bin/hosts-manager').read_text(), 'unrelated')
            self.assertFalse((root / 'data').exists())

    def test_desktop_quoting(self):
        quoted = installer.desktop_quote('/tmp/space $ % " \\ /hosts-manager')
        self.assertTrue(quoted.startswith('"') and quoted.endswith('"'))
        self.assertIn('%%', quoted)
        self.assertIn('\\\\$', quoted)
        with self.assertRaises(ValueError):
            installer.desktop_quote('/tmp/new\nline')


if __name__ == '__main__':
    unittest.main()
