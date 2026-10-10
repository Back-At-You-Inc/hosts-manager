# Security reporting

Do not post credentials, private hosts entries, or exploitable vulnerability details
in a public issue.

After public launch, use the repository's **Security → Advisories → Report a
vulnerability** form for private reports. Maintainers must enable GitHub private
vulnerability reporting before launch. Until that channel is enabled, report
security issues through an existing private contact with Back At You, Inc; no public
security-reporting channel is currently promised.

Include the app version, operating system and architecture, steps to reproduce,
impact, and a minimal example using synthetic hosts entries. The latest stable
release is the supported version; older releases may be asked to update.

Security-sensitive areas include privileged hosts updates, the macOS helper,
stale-file detection, renderer-to-main IPC, and release/update metadata.
