// `resume.integration.test.ts` imports real eddy-core, which transitively
// imports `.md` / `.yaml` prompt sources as raw strings (resolved by the
// shared `raw-text-plugin`). This ambient declaration lets `tsc` type-check
// the migration package without pulling in eddy-core's own `.d.ts`.

declare module '*.md' {
  const content: string;
  export default content;
}

declare module '*.yaml' {
  const content: string;
  export default content;
}
