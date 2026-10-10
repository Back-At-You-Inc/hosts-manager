cask "hosts-manager" do
  version "0.1.15"
  sha256 "1173038d206d0d03f7cbfa863387e26a11824d5cf600da1cec23a0b97859e698"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
