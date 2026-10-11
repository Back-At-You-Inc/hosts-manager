cask "hosts-manager" do
  version "0.1.23"
  sha256 "f8c6ea5317de7210832c2ec65c64c6a29da763c23985d0e2691f4b6346d08538"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
