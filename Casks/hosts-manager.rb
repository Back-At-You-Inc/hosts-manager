cask "hosts-manager" do
  version "0.1.21"
  sha256 "eb2c10e71670917e32aca80d4923db84b6a5f390184ca2adfff46285fa09dd2f"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
