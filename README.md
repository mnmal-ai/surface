# surface

A pluggable terminal UI base (Ink 8 + React 19). Apps compose modules at build time:

    const app = createApp({ theme: marathon, modules: [ask, schema, status] });
    await app.run();

| Package | What |
|---|---|
| `@mnmal-ai/surface-theme` | semantic tokens and themes; the only place colours are written |
| `@mnmal-ai/surface-kit` | stateless view primitives |
| `@mnmal-ai/surface-core` | registries (`defineModule`, `createApp`), the turn engine, the shell |

`substrate-tui` in [substrate](https://github.com/mnmal-ai/substrate) is the reference consumer.

## Development

    pnpm install
    pnpm build && pnpm check-types && pnpm lint && pnpm guards && pnpm test

`pnpm guards` enforces the split: no package imports a domain package (substrate, cortext,
synoptic), no raw hex outside `surface-theme`, and the pure packages import no Ink or React.

Pre-1.0, the module contract may break between minor versions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for pull requests and labels, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[Apache-2.0](LICENSE)
