# Contributing to Hosts Manager

The repository is being prepared for public collaboration. Before submitting
code, check [LICENSE](LICENSE): the current proprietary terms remain in effect
until the maintainers select and publish the launch license. Please do not submit
code contributions while that decision is pending.

## Development

Use Node.js 22 or later and npm. macOS development also requires Xcode command-line
tools for the native helper.

```sh
npm ci
npm run check
npm test
npm start
```

Automated tests use temporary files and mocks. Running the desktop app and saving
active entries can change your real hosts file. Use sample hostnames and preserve
your existing entries when checking OS permission behavior.

## Pull requests

Once code contributions are open, branch from `master` and keep each pull request
focused on one change. Describe the behavior before and after the change and the
checks you ran. Add regression coverage for hosts-writing, permissions, and update
behavior when those areas change. Include screenshots for interface changes.

Pull requests run the test workflow without release publishing or organization
secrets. Maintainer branch pushes also run platform packaging and release creation.
The workflows use GitHub's official actions and repository-local scripts; no private
workflow dependencies or external build notifications are required.

Never include real hosts files, credentials, customer domains, or personal workspace
state in reports, screenshots, or fixtures. Use `.example`, `.test`, or `.local`
sample names.

## Reporting problems

Use the bug report template for ordinary problems and the feature request template
for proposals. For security issues, follow [SECURITY.md](SECURITY.md).
