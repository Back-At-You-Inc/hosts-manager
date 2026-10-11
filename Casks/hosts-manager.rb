cask "hosts-manager" do
  version "0.1.18"
  sha256 "a278b4e1da293952bc7b00833e9370a4b41bc4e622f1164561caa75815d85f79"

  url "https://github.com/Back-At-You-Inc/hosts-manager/releases/download/v#{version}/Hosts-Manager-#{version}-mac-arm64.dmg"
  name "Hosts Manager"
  desc "Manage hosts files with switchable groups"
  homepage "https://github.com/Back-At-You-Inc/hosts-manager"

  depends_on arch: :arm64
  app "Hosts Manager.app"
end
