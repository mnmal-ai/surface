# surface

A pluggable terminal UI base on Ink 7 and React 19. The README maps the packages, and CONTRIBUTING.md covers PRs and labels.

## Layout

- `packages/surface-theme`: semantic tokens and themes. This is the only place colours are written.
- `packages/surface-kit`: stateless view primitives.
- `packages/surface-core`: the registries (`defineModule`, `createApp`), the turn engine and the shell.

## Checks

```bash
pnpm install
pnpm build && pnpm check-types && pnpm lint && pnpm guards && pnpm test
npx substrate-toolchain-check --strict
```

## Rules

- `pnpm guards` enforces three things:
  - no package imports a domain package (substrate, cortext, synoptic);
  - no raw hex outside `surface-theme`;
  - no Ink or React in the pure packages.
- Before 1.0, the module contract may break between minor versions. A contract change is reviewed with its consumers; `substrate-tui` is the reference one.
- Shared dependency versions live in the `catalog:` of `pnpm-workspace.yaml`.
- Toolchain versions follow `@mnmal-ai/substrate-config`. Run `substrate-toolchain-check --fix` after bumping it, and don't edit the versions by hand.

## Releases

Bump all three packages on a `release/vX.Y.Z` branch. Merging it to `main` publishes through `publish.yml` behind the protected `release` environment, then tags. Never tag or publish by hand.
