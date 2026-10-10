# Homebrew installation

This repository includes an Apple Silicon macOS cask in [Casks/hosts-manager.rb](../Casks/hosts-manager.rb). Once the repository is public, install it with:

```sh
brew tap Back-At-You-Inc/hosts-manager https://github.com/Back-At-You-Inc/hosts-manager.git
brew install --cask Back-At-You-Inc/hosts-manager/hosts-manager
```

The explicit tap URL is required because this repository does not have Homebrew's usual `homebrew-` name prefix. Users do not need a GitHub token for public downloads.

To upgrade:

```sh
brew update
brew upgrade --cask Back-At-You-Inc/hosts-manager/hosts-manager
```

Save drafts and quit Hosts Manager through the tray before upgrading. To uninstall the app:

```sh
brew uninstall --cask Back-At-You-Inc/hosts-manager/hosts-manager
```

To remove the macOS administrator helper, use **Remove administrator helper…** in the app's tray menu before uninstalling. Homebrew uninstall does not remove the helper or saved workspace settings.

The repository is currently private, so these commands are prepared for public launch and are not yet available to unauthenticated users. This cask supports macOS ARM64 only. The app is unsigned and not notarized; Homebrew does not bypass macOS security approval requirements.

## Release maintenance

After publishing a successful stable release, CI updates the cask version and SHA-256 checksum from the published build's `SHA256SUMS`. The cask uses a versioned DMG URL, preserving checksum verification. Prereleases and older reruns do not update the stable cask. The update is committed to `master` with the repository's built-in GitHub token and does not trigger another build.

No separate tap repository, cross-repository credential, or organization action is required. Branch protection must permit the approved release automation to update the cask; otherwise the published release remains available but the workflow reports a cask-update failure.

For manual maintenance:

```sh
gh release download v<VERSION> --pattern SHA256SUMS --dir release --clobber
node scripts/update-homebrew-cask.mjs <VERSION>
```

Commit the generated cask after reviewing its version, URL, and checksum.

References: [Homebrew taps](https://docs.brew.sh/Taps.html), [Cask cookbook](https://docs.brew.sh/Cask-Cookbook).
