cask "hosts-manager" do
  version "0.1.19"
  sha256 "f8da2790c6d629dc2be62f295c890a040df86f3f183242ac6f6aff866970f937"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
