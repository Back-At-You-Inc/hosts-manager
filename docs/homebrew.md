# Homebrew distribution

Windows releases already include an NSIS `.exe` installer with a setup wizard, installation-directory selection, and an uninstaller. No extra installer tooling is needed.

For macOS, distribute the existing ARM64 DMG through a Homebrew **cask** in a tap such as `Back-At-You-Inc/homebrew-tap`, with a `Casks/hosts-manager.rb` file:

```ruby
cask "hosts-manager" do
  version "0.1.3"
  sha256 "d3b0729b3337c54ee460919cf22b3fade18d1798cb9de176a73ebc10594ad9a3"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
```

This is a template for the existing v0.1.3 release, not a published tap. The repository and release downloads are currently private. Before offering installation, either publish the downloads or implement and validate authenticated downloading for your team's private tap. An ordinary browser-download URL does not give Homebrew access to private assets. Never embed credentials in the cask.

With an accessible tap and downloads, users would run:

```sh
brew tap Back-At-You-Inc/tap
brew install --cask Back-At-You-Inc/tap/hosts-manager
brew upgrade --cask hosts-manager
```

Each successful stable release should update the cask version and DMG checksum in the tap. Automating that cross-repository update requires a narrowly scoped GitHub App or token with write access to the tap; the app repository's built-in workflow token cannot write to another repository. Prereleases should not update the stable cask.

The current app is unsigned and not notarized. Homebrew installation does not remove macOS security approval requirements. Only Apple Silicon is built today; Intel support requires an x64 app and matching native helper.

References: [Cask cookbook](https://docs.brew.sh/Cask-Cookbook), [maintaining a tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap).
