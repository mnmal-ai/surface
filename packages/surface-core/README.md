# @mnmal-ai/surface-core

Registries (`defineModule`, `createApp`), the turn engine and the shell. Apps compose modules at build time:

```ts
const app = createApp({ theme, modules: [ask, schema, status] });
await app.run();
```

Part of [surface](https://github.com/mnmal-ai/surface). Pre-1.0: the module contract may break between minor versions.

Apache-2.0.
