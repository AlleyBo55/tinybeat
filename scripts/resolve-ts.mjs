// Node loader hook: lets the check scripts import the app's source, which uses
// extensionless relative imports (resolved by the bundler in the app itself).
// Usage: node --experimental-strip-types --import ./scripts/resolve-ts.mjs script.mts
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";
      export async function resolve(specifier, context, next) {
        if (specifier.startsWith(".") && !/\\.[a-z]+$/i.test(specifier) && context.parentURL) {
          const base = new URL(specifier, context.parentURL);
          for (const ext of [".ts", ".mts", ".tsx"]) {
            const candidate = fileURLToPath(base) + ext;
            if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
          }
        }
        return next(specifier, context);
      }
    `),
);
