cask "hosts-manager" do
  version "0.1.25"
  sha256 "5605328ceec59fc417210a565cbd2a687f1eb3ce2a56929752c9876e6707b693"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
