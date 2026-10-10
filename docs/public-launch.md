# Public launch preparation

The repository remains private. This checklist prepares a future visibility change;
it does not authorize or perform that change.

## Decisions and launch blockers

- Select the license. The current proprietary license permits app use but restricts
  modification and redistribution. It is source-available if published, not open
  source. Replace it with the selected open-source license and update package
  metadata, the README badge, and contribution instructions before advertising
  open-source status. Preserve third-party licenses in either case.
- CI is self-contained: repository workflows use official GitHub actions and local
  scripts, without private reusable workflows, inherited organization secrets,
  or external build notifications. Verify fork PR checks before launch.

## Repository review

- Scan the complete Git history and tracked files for credentials and sensitive
  data, including screenshots, preview fixtures, logs, and old commits. A scan of
  the latest working tree alone is insufficient. Rotate any exposed credential
  before rewriting history or publishing.
- Review prior Actions logs and artifacts: they become public with the repository.
- Enable secret scanning and push protection when available. Verify organization
  secret access is restricted to what public maintainer workflows need. Current
  CI uses only the repository-scoped built-in GitHub token.
- Enable private vulnerability reporting before advertising the reporting channel
  in SECURITY.md.
- Configure protection for `master` and require the three platform test checks for
  pull requests. Ensure the bot's release-badge commit can still update its file
  using an approved policy; do not grant external contributors bypass permission.
- Confirm GitHub's approval policy for workflows submitted by outside contributors.
  Keep PR tests on `pull_request`, with read-only permissions and no publishing
  secrets. Do not switch them to `pull_request_target` to run submitted code.

## Downloads, updates, and Homebrew

- Keep source and releases in this repository once public; a separate public
  download repository is unnecessary for an open-source launch.
- The configured update repository already matches this repository. Verify a
  logged-out request can fetch the latest stable release and each platform asset.
  Current in-app updates notify and open the download page; installation is manual.
- Publish a new tested release under the final license. Previous packages retain
  their embedded license; changing LICENSE does not update existing installers.
- GitHub's automatic source archives remain visible on releases. The explicit app
  download links distinguish installers and portable apps.
- Publish a Homebrew tap with the current ARM64 DMG version and checksum. The
  example in docs/homebrew.md is not a live tap. Automating cask updates needs a
  narrowly scoped cross-repository credential. Validate installation and upgrades
  from a clean Mac before advertising the command.
- Check installed app behavior on macOS ARM64, Windows x64, and Linux x64. Builds
  are unsigned; signing and notarization remain separate distribution decisions.

## Final launch

After these items are complete, obtain authorization to change repository
visibility, make it public, and verify README images/badges, issue forms, fork PR
checks, release downloads, update detection, and Homebrew from outside the org.

References:
- https://docs.github.com/en/actions/how-tos/reuse-automations/share-with-your-enterprise
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
