// Imports the ESM build through the `exports` map of package.json.
import * as sdk from "snapsbrew";
import { check } from "./check.mjs";

const runtime =
	typeof globalThis.Bun !== "undefined"
		? `Bun ${globalThis.Bun.version}`
		: typeof globalThis.Deno !== "undefined"
			? `Deno ${globalThis.Deno.version.deno}`
			: `Node ${globalThis.process.version} (ESM)`;

await check(sdk, runtime);
