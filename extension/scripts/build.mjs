import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const item of ["manifest.json", "src", "public"]) {
  await cp(resolve(root, item), resolve(dist, item), { recursive: true });
}

console.log("TemplateX extension copied to extension/dist");
