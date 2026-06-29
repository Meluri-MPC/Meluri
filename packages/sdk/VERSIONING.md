# Versioning Strategy

## Semantic Versioning

This SDK follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`).

| Bump     | When                                                                 |
|----------|----------------------------------------------------------------------|
| **MAJOR** | Breaking API changes, removed features, incompatible protocol changes |
| **MINOR** | New features (backward-compatible), new connectors, new React hooks  |
| **PATCH** | Bug fixes, performance improvements, internal refactors (no API change) |

## Breaking Changes Policy

1. Breaking changes are **only introduced in MAJOR versions**.
2. Every breaking change must include a **migration guide** in the [CHANGELOG](./CHANGELOG.md).
3. Breaking changes are announced in the GitHub release notes with migration steps.

## Deprecation Process

1. **Mark as `@deprecated`** in TypeScript declarations (JSDoc).
2. **Log a console warning** (once per session) in development mode when deprecated API is used.
3. **Remove in the next MAJOR** version. Deprecated APIs survive for at least one MAJOR cycle.

Example:

```ts
/** @deprecated Use `sendSTX` instead. Will be removed in v2.0.0. */
export async function transfer(p: TransferParams): Promise<TxResult> {
  if (typeof window !== 'undefined' && (window as any).__VELUMX_DEV__) {
    console.warn('[VelumX] `transfer()` is deprecated. Use `sendSTX()` instead.');
  }
  return sendSTX(p);
}
```

## API Compatibility

| SDK Version | API Version | Status          |
|-------------|-------------|-----------------|
| 0.x         | 1.x         | Active          |
| 1.x         | 2.x         | Planned         |

- Always use the latest PATCH within your MAJOR version.
- The backend API has its own versioning (starts at v1). SDK follows its own MAJOR.

## Long-Term Support (LTS)

- The **last 2 MAJOR versions** receive critical security patches.
- When a new MAJOR is released, the oldest supported MAJOR enters a 6-month deprecation window.
- After deprecation window, the unsupported MAJOR version's npm tags are marked `deprecated`.

## Release Channels

| Channel  | Tag example         | Purpose                         |
|----------|---------------------|---------------------------------|
| `latest` | `1.2.3`             | Stable, production-ready        |
| `canary` | `0.0.0-canary.abc123`| Per-commit testing on `main`   |
| `next`   | `2.0.0-beta.1`      | Pre-release for upcoming MAJOR  |
| `rc`     | `2.0.0-rc.1`        | Release candidate               |

## Changelog

`CHANGELOG.md` is auto-generated from [Conventional Commits](https://www.conventionalcommits.org/) via Changesets.

Commit message format:

```
feat: add session delegation support
fix: resolve STX decimal precision issue
feat!: remove deprecated transfer() method
docs: add React Native setup guide
```

- `feat:` → MINOR bump
- `fix:` → PATCH bump
- `feat!:` or `fix!:` or `BREAKING CHANGE:` footer → MAJOR bump

## Minimum Supported Versions

| Dependency        | Minimum Version |
|-------------------|-----------------|
| Node.js           | 18.0            |
| React             | 18.0            |
| React Native      | 0.72            |
| TypeScript        | 5.0             |
| pnpm              | 8.0             |
