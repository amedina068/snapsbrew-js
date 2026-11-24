import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
	type Snap,
	Snapsbrew,
	type TemplateListItem,
	type Variant,
} from "../src/index";
import { callOf, client, json, mockFetch } from "./helpers";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("constructor", () => {
	it("accepts a client with no token", () => {
		expect(() => new Snapsbrew({ baseUrl: "https://x.test" })).not.toThrow();
		expect(
			() => new Snapsbrew({ baseUrl: "https://x.test", token: "  " }),
		).not.toThrow();
	});

	it("fails an API call with no token before the send", async () => {
		for (const token of [undefined, "", "  "]) {
			const fetch = mockFetch(json(200, { data: {} }));
			const sb = new Snapsbrew({ baseUrl: "https://x.test", token, fetch });

			await expect(sb.account.get()).rejects.toThrow(
				/The client has no API token/,
			);
			expect(fetch).not.toHaveBeenCalled();
		}
	});

	it("rejects a base URL that is not absolute", () => {
		expect(
			() => new Snapsbrew({ baseUrl: "app.snapsbrew.com", token: "t" }),
		).toThrow(/absolute/);
		expect(
			() => new Snapsbrew({ baseUrl: "ftp://x.test", token: "t" }),
		).toThrow(/http/);
	});

	it("rejects a bad timeout or retry count", () => {
		expect(
			() =>
				new Snapsbrew({ baseUrl: "https://x.test", token: "t", timeout: 0 }),
		).toThrow(/timeout/);
		expect(
			() =>
				new Snapsbrew({
					baseUrl: "https://x.test",
					token: "t",
					maxRetries: -1,
				}),
		).toThrow(/maxRetries/);
	});

	it("uses the global fetch when no fetch is given", async () => {
		const fetch = mockFetch(
			json(200, { data: { email: "a@b.c", name: "A", company: null } }),
		);
		vi.stubGlobal("fetch", fetch);

		await new Snapsbrew({
			baseUrl: "https://x.test",
			token: "t",
		}).account.get();

		expect(fetch).toHaveBeenCalledOnce();
	});
});

describe("abort", () => {
	it("throws the reason of the signal when it aborts during a request", async () => {
		const fetch = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);
		const controller = new AbortController();
		const promise = client(fetch).account.get({ signal: controller.signal });
		controller.abort(new Error("user stop"));

		await expect(promise).rejects.toThrow("user stop");
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("does not send a request when the signal is already aborted", async () => {
		const fetch = mockFetch();
		const signal = AbortSignal.abort(new Error("early"));

		await expect(client(fetch).account.get({ signal })).rejects.toThrow(
			"early",
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("pagination", () => {
	const template = (uuid: string): TemplateListItem => ({
		uuid,
		title: uuid,
		width: 1,
		height: 1,
		layers: [],
		created_at: "x",
	});
	const page = (uuids: string[], next: string | null) =>
		json(200, {
			data: uuids.map(template),
			meta: { previous_cursor: null, next_cursor: next },
		});

	it("iterates over each item of each page", async () => {
		const fetch = mockFetch(
			page(["a", "b"], "c2"),
			page(["c"], "c3"),
			page([], null),
		);
		const uuids: string[] = [];

		for await (const item of client(fetch).templates.list()) {
			uuids.push(item.uuid);
		}

		expect(uuids).toEqual(["a", "b", "c"]);
		expect(callOf(fetch, 1).url.searchParams.get("cursor")).toBe("c2");
		expect(callOf(fetch, 2).url.searchParams.get("cursor")).toBe("c3");
	});

	it("loads the next page only when the loop needs it", async () => {
		const fetch = mockFetch(page(["a", "b"], "c2"), page(["c"], null));

		for await (const item of client(fetch).templates.list()) {
			expect(item.uuid).toBe("a");
			break;
		}

		expect(fetch).toHaveBeenCalledOnce();
	});

	it("yields pages and collects items", async () => {
		const sb = client(
			mockFetch(
				page(["a"], "c2"),
				page(["b"], null),
				page(["a"], "c2"),
				page(["b"], null),
			),
		);
		const pages: string[][] = [];

		for await (const each of sb.templates.list().pages()) {
			pages.push(each.data.map((item) => item.uuid));
		}

		expect(pages).toEqual([["a"], ["b"]]);
		expect(
			(await sb.templates.list().toArray()).map((item) => item.uuid),
		).toEqual(["a", "b"]);
	});

	it("reuses the first page after an await", async () => {
		const fetch = mockFetch(page(["a"], null));
		const list = client(fetch).templates.list();

		expect((await list).data).toHaveLength(1);
		expect(await list.toArray()).toHaveLength(1);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("walks the page numbers of the media library", async () => {
		const media = (id: number) => ({ id, src: `https://x.test/${id}.jpg` });
		const fetch = mockFetch(
			json(200, {
				data: [media(1)],
				current_page: 1,
				last_page: 2,
				next_page_url: "https://x.test/api/v1/media?page=2",
			}),
			json(200, {
				data: [media(2)],
				current_page: 2,
				last_page: 2,
				next_page_url: null,
			}),
		);

		const ids = (await client(fetch).media.list().toArray()).map(
			(item) => item.id,
		);

		expect(ids).toEqual([1, 2]);
		expect(callOf(fetch, 0).url.search).toBe("");
		expect(callOf(fetch, 1).url.search).toBe("?page=2");
	});
});

describe("portability", () => {
	const sourceDir = join(import.meta.dirname, "..", "src");
	const files = readdirSync(sourceDir, {
		recursive: true,
		encoding: "utf8",
	}).filter((file) => file.endsWith(".ts"));
	const nodeModules = new Set(builtinModules);

	it.each(files)(
		"%s imports no Node module and reads no Node global",
		(file) => {
			const source = readFileSync(join(sourceDir, file), "utf8");
			const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
				(match) => match[1] ?? "",
			);

			for (const specifier of specifiers) {
				expect(
					specifier.startsWith("node:") || nodeModules.has(specifier),
					specifier,
				).toBe(false);
				expect(
					specifier.startsWith("."),
					`${specifier} is a runtime dependency`,
				).toBe(true);
			}

			const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
			expect(code).not.toMatch(/\b(process|Buffer|require|__dirname)\b/);
		},
	);
});

describe("types", () => {
	it("makes a variant set exactly one property", () => {
		const ok: Variant[] = [
			{ layer: "a", text: "x" },
			{ layer: "b", image_url: "https://x.test/a.png" },
			{ layer: "c", background_color: "#fff" },
			{ layer: "d", qr_content: "x" },
			{ layer: "e", barcode_content: "123" },
			{ layer: "f", hidden: true },
		];
		expect(ok).toHaveLength(6);

		// @ts-expect-error A variant sets one property, not two.
		const twoProperties: Variant = { layer: "a", text: "x", hidden: true };
		// @ts-expect-error A variant needs a property.
		const noProperty: Variant = { layer: "a" };
		// @ts-expect-error `hidden` is a boolean.
		const badValue: Variant = { layer: "a", hidden: "yes" };
		expect([twoProperties, noProperty, badValue]).toHaveLength(3);
	});

	it("gives snaps.create() a return type that matches the input", () => {
		const sb = client(mockFetch(json(201, {}), json(201, [])));

		expectTypeOf(sb.snaps.create({ templateId: "t" })).toEqualTypeOf<
			Promise<Snap>
		>();
		expectTypeOf(sb.snaps.create({ collectionId: "c" })).toEqualTypeOf<
			Promise<Snap[]>
		>();
	});

	it("rejects bad combinations of snap options", () => {
		const sb = client(
			mockFetch(json(201, {}), json(201, {}), json(201, {}), json(201, {})),
		);
		const asyncNoHook = { templateId: "t", async: true } as const;
		const jpegAlpha = {
			templateId: "t",
			format: "jpeg",
			transparent: true,
		} as const;
		const both = { templateId: "t", collectionId: "c" } as const;
		const keyedCollection = { collectionId: "c", idempotencyKey: "k" } as const;

		// @ts-expect-error An async render needs a webhook URL.
		const a = sb.snaps.create(asyncNoHook);
		// @ts-expect-error JPEG has no transparency.
		const b = sb.snaps.create(jpegAlpha);
		// @ts-expect-error Send a template or a collection, not both.
		const c = sb.snaps.create(both);
		// @ts-expect-error A collection takes no idempotency key.
		const d = sb.snaps.create(keyedCollection);
		expect([a, b, c, d]).toHaveLength(4);
	});

	it("rejects a template canvas with a preset and a width", () => {
		const sb = client(mockFetch(json(200, { data: {} })));
		const canvas = { title: "t", size: "open_graph", width: 1 } as const;
		// @ts-expect-error Send a preset or a width and a height, not both.
		const call = sb.templates.create(canvas);
		expect(call).toBeInstanceOf(Promise);
	});
});
