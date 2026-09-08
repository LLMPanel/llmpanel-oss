import { build } from "esbuild"

/**
 * The `@llmpanel/*` workspace packages publish raw TypeScript (`"main": "src/index.ts"`),
 * so Node cannot load them directly — they must be inlined into the bundle.
 * Everything from npm stays external and is resolved from node_modules at runtime,
 * which keeps the bundle small and leaves native addons (e.g. @libsql/client) intact.
 */
const externalizeNpmDeps = {
  name: "externalize-npm-deps",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === "entry-point") return null
      if (args.path.startsWith("@llmpanel/")) return null // bundle workspace source
      if (args.path.startsWith(".") || args.path.startsWith("/")) return null // relative/absolute
      return { path: args.path, external: true } // bare specifier -> npm or node builtin
    })
  },
}

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
  plugins: [externalizeNpmDeps],
})
