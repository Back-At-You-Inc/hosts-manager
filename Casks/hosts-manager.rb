cask "hosts-manager" do
  version "0.1.26"
  sha256 "431aae3ef38b47a5bb0479499233a90a773d72dddeca45269b1cdb7b1e87c4e4"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
