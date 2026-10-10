cask "hosts-manager" do
  version "0.1.14"
  sha256 "5336b0b26e5a4d70c673503bcbcf8f861fbf26381d0384fd6eef3995815927e0"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
