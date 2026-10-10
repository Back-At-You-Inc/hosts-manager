cask "hosts-manager" do
  version "0.1.11"
  sha256 "9c5035e6d2eedac1abe0cce6c91fdc22ecde12b1412ef582e83bd400a9aa2122"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
