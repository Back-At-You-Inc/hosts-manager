cask "hosts-manager" do
  version "0.1.22"
  sha256 "ca53e3d4757a44645d9055e59fe1c83a3a5cfed60b3f27802da02f41fdea2f81"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
