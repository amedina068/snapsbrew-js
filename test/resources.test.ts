import { describe, expect, expectTypeOf, it } from "vitest";
import type { Media, Screenshot, ScreenshotListItem } from "../src/index";
import { ServerError } from "../src/index";
import { callOf, client, html, json, mockFetch } from "./helpers";

const TEMPLATE_ID = "141e8454-8aa1-420a-bd0b-18a85ba949a2";
const BATCH_ID = "7c1f2a9e-0b44-4a1e-9f2b-5d3c8e1a7b60";

const LAYERS_WIRE = [
	{
		layer: "review_title",
		available_modifications: { text: "The worst movie" },
	},
	{ layer: "frame", available_modifications: [] },
];
const LAYERS = [
	{
		layer: "review_title",
		available_modifications: { text: "The worst movie" },
	},
	{ layer: "frame", available_modifications: {} },
];

const SNAP = {
	id: "9f1c2d3e",
	media_url: "https://snapsbrew.test/storage/snaps/9f1c2d3e.png",
	width: 1200,
	height: 630,
	type: "image",
	status: "completed",
	is_async: false,
	webhook_url: null,
	completed_at: "2026-05-01T12:00:03.000000Z",
	last_error: null,
	variants: [{ layer: "title", text: "Hello" }],
	template_id: TEMPLATE_ID,
	template_title: "Launch card",
	created_at: "2026-05-01T12:00:00.000000Z",
};

const BATCH = {
	uuid: BATCH_ID,
	title: "October launch",
	status: "processing",
	total_rows: 2,
	processed_rows: 0,
	completed: 0,
	pending: 2,
	failed: 0,
	canceled: 0,
	status_url: `https://snapsbrew.test/api/v1/snaps/batches/${BATCH_ID}`,
};

describe("request basics", () => {
	it("sends the token, the Accept header and the /api prefix", async () => {
		const fetch = mockFetch(
			json(200, { data: { email: "a@b.c", name: "A", company: null } }),
		);

		await client(fetch).account.get();

		const call = callOf(fetch);
		expect(call.method).toBe("GET");
		expect(call.url.href).toBe("https://snapsbrew.test/api/v1/auth");
		expect(call.headers.get("authorization")).toBe("Bearer test-token");
		expect(call.headers.get("accept")).toBe("application/json");
		expect(call.headers.get("content-type")).toBeNull();
	});

	it("keeps the base path of an instance that is not at the root", async () => {
		const fetch = mockFetch(json(200, { data: [] }));

		await client(fetch, {
			baseUrl: "https://example.com/snapsbrew/",
		}).tags.list();

		expect(callOf(fetch).url.href).toBe(
			"https://example.com/snapsbrew/api/v1/tags",
		);
	});

	it("encodes ids in the path", async () => {
		const fetch = mockFetch(json(200, { data: SNAP }));

		await client(fetch).screenshots.get("a/b?c");

		expect(callOf(fetch).url.pathname).toBe("/api/v1/screenshots/a%2Fb%3Fc");
	});

	it("rejects an empty id without a request", async () => {
		const fetch = mockFetch();

		await expect(client(fetch).templates.get("")).rejects.toThrow(TypeError);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe("account", () => {
	it("get() reads /v1/auth", async () => {
		const account = {
			email: "dev@example.com",
			name: "Ada Lovelace",
			company: "Analytical Engines",
		};
		const fetch = mockFetch(json(200, { data: account }));

		expect(await client(fetch).account.get()).toEqual(account);
	});
});

describe("templates", () => {
	it("list() reads one page and changes an empty modification list to an object", async () => {
		const page = {
			data: [
				{
					uuid: TEMPLATE_ID,
					title: "T",
					width: 1200,
					height: 630,
					layers: LAYERS_WIRE,
					created_at: "x",
				},
			],
			meta: { previous_cursor: null, next_cursor: "eyJpZCI6MTB9" },
		};
		const fetch = mockFetch(json(200, page));

		const result = await client(fetch).templates.list({ cursor: "abc" });

		expect(callOf(fetch).url.search).toBe("?cursor=abc");
		expect(result.meta.next_cursor).toBe("eyJpZCI6MTB9");
		expect(result.data[0]?.layers).toEqual(LAYERS);
	});

	it("get() reads one template", async () => {
		const template = {
			uuid: TEMPLATE_ID,
			title: "T",
			size: "open_graph",
			width: 1200,
			height: 630,
			layers: LAYERS_WIRE,
			published_version: 2,
			has_unpublished_edits: true,
			created_at: "x",
		};
		const fetch = mockFetch(json(200, { data: template }));

		const result = await client(fetch).templates.get(TEMPLATE_ID);

		expect(callOf(fetch).url.pathname).toBe(`/api/v1/templates/${TEMPLATE_ID}`);
		expect(result).toEqual({ ...template, layers: LAYERS });
	});

	it("sizes() reads the presets", async () => {
		const sizes = [
			{
				size: "open_graph",
				name: "Open Graph",
				platform: "Web & email",
				width: 1200,
				height: 630,
				aspect_ratio: "1.9:1",
				safe_margin_px: 47,
			},
		];
		const fetch = mockFetch(json(200, { data: sizes }));

		expect(await client(fetch).templates.sizes()).toEqual(sizes);
		expect(callOf(fetch).url.pathname).toBe("/api/v1/templates/sizes");
	});

	it("create() posts the template", async () => {
		const result = {
			uuid: TEMPLATE_ID,
			title: "Card",
			size: "open_graph",
			width: 1200,
			height: 630,
			created_at: "x",
		};
		const fetch = mockFetch(
			json(200, { data: result, message: "Template created successfully" }),
		);

		expect(
			await client(fetch).templates.create({
				title: "Card",
				size: "open_graph",
			}),
		).toEqual(result);
		expect(callOf(fetch)).toMatchObject({
			method: "POST",
			body: { title: "Card", size: "open_graph" },
		});
		expect(callOf(fetch).headers.get("content-type")).toBe("application/json");
	});

	it("update() patches by UUID or numeric id", async () => {
		const fetch = mockFetch(json(200, { data: { uuid: TEMPLATE_ID } }));

		await client(fetch).templates.update(42, {
			title: "New",
			width: 1080,
			height: 1080,
		});

		expect(callOf(fetch)).toMatchObject({
			method: "PATCH",
			body: { title: "New", width: 1080, height: 1080 },
		});
		expect(callOf(fetch).url.pathname).toBe("/api/v1/templates/42");
	});

	it("delete() sends DELETE and returns nothing", async () => {
		const fetch = mockFetch(
			json(200, { message: "Template deleted successfully" }),
		);

		expect(await client(fetch).templates.delete(TEMPLATE_ID)).toBeUndefined();
		expect(callOf(fetch).method).toBe("DELETE");
	});

	it("publish() returns the version", async () => {
		const data = { id: TEMPLATE_ID, uuid: TEMPLATE_ID, published_version: 3 };
		const fetch = mockFetch(
			json(200, { data, message: "Template published." }),
		);

		expect(await client(fetch).templates.publish(TEMPLATE_ID)).toEqual(data);
		expect(callOf(fetch).url.pathname).toBe(
			`/api/v1/templates/${TEMPLATE_ID}/publish`,
		);
	});

	it("preview() returns the HTML and sends the variants in PHP bracket form", async () => {
		const fetch = mockFetch(html("<!DOCTYPE html><p>preview</p>"));

		const result = await client(fetch).templates.preview(TEMPLATE_ID, {
			variants: [
				{ layer: "headline", text: "Hello" },
				{ layer: "badge", hidden: true },
			],
		});

		expect(result).toBe("<!DOCTYPE html><p>preview</p>");
		expect([...callOf(fetch).url.searchParams]).toEqual([
			["variants[0][layer]", "headline"],
			["variants[0][text]", "Hello"],
			["variants[1][layer]", "badge"],
			["variants[1][hidden]", "1"],
		]);
	});

	it("setTags() replaces the tags", async () => {
		const tags = [{ id: 1, name: "Launch", slug: "launch" }];
		const fetch = mockFetch(
			json(200, { message: "Tags updated successfully.", tags }),
		);

		expect(await client(fetch).templates.setTags(TEMPLATE_ID, [1])).toEqual(
			tags,
		);
		expect(callOf(fetch)).toMatchObject({
			method: "POST",
			body: { tag_ids: [1] },
		});
	});
});

describe("documents", () => {
	const document = {
		version: 2,
		layers: [{ key: "headline", type: "text", properties: [] }],
		groups: {},
	};

	it("get() reads the document", async () => {
		const fetch = mockFetch(json(200, { document, revision: 4 }));

		expect(await client(fetch).documents.get(TEMPLATE_ID)).toEqual({
			document,
			revision: 4,
		});
		expect(callOf(fetch).url.pathname).toBe(
			`/api/v1/templates/${TEMPLATE_ID}/document`,
		);
	});

	it("replace() sends PUT with the revision", async () => {
		const fetch = mockFetch(json(200, { document, revision: 5 }));

		await client(fetch).documents.replace(TEMPLATE_ID, {
			revision: 4,
			document,
		});

		expect(callOf(fetch)).toMatchObject({
			method: "PUT",
			body: { revision: 4, document },
		});
	});

	it("replace() does not retry a server error", async () => {
		const fetch = mockFetch(json(500, {}));

		await expect(
			client(fetch).documents.replace(TEMPLATE_ID, { revision: 4, document }),
		).rejects.toMatchObject({
			code: "server_error",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("apply() sends PATCH with the operations", async () => {
		const fetch = mockFetch(json(200, { document, revision: 5 }));
		const operations = [
			{
				operation: "set_layer_property",
				layer_key: "headline",
				property: "fontWeight",
				value: 700,
			},
		] as const;

		await client(fetch).documents.apply(TEMPLATE_ID, {
			revision: 4,
			operations,
		});

		expect(callOf(fetch)).toMatchObject({
			method: "PATCH",
			body: { revision: 4, operations },
		});
	});

	it("preflight() reads the issues", async () => {
		const result = {
			issues: [
				{ code: "image_asset_missing", path: "/layers/0/source", message: "x" },
			],
			revision: 4,
		};
		const fetch = mockFetch(json(200, result));

		expect(await client(fetch).documents.preflight(TEMPLATE_ID)).toEqual(
			result,
		);
		expect(callOf(fetch).url.pathname).toBe(
			`/api/v1/templates/${TEMPLATE_ID}/document/preflight`,
		);
	});
});

describe("snaps", () => {
	it("create() maps the parameters to the wire names", async () => {
		const fetch = mockFetch(json(201, SNAP));

		const snap = await client(fetch).snaps.create({
			templateId: TEMPLATE_ID,
			variants: [{ layer: "title", text: "Hello" }],
			format: "webp",
			transparent: true,
			idempotencyKey: "order-42",
		});

		expect(snap).toEqual(SNAP);
		expect(callOf(fetch)).toMatchObject({
			method: "POST",
			body: {
				template_id: TEMPLATE_ID,
				variants: [{ layer: "title", text: "Hello" }],
				format: "webp",
				transparent: true,
				idempotency_key: "order-42",
			},
		});
		expect(callOf(fetch).url.pathname).toBe("/api/v1/snaps");
	});

	it("create() sends an async render with its webhook", async () => {
		const fetch = mockFetch(
			json(202, {
				...SNAP,
				status: "pending",
				media_url: null,
				is_async: true,
			}),
		);

		const snap = await client(fetch).snaps.create({
			templateId: TEMPLATE_ID,
			async: true,
			webhookUrl: "https://example.com/hooks/snap",
		});

		expect(snap.status).toBe("pending");
		expect(callOf(fetch).body).toEqual({
			template_id: TEMPLATE_ID,
			async: true,
			webhook_url: "https://example.com/hooks/snap",
		});
	});

	it("create() with a collection returns a list", async () => {
		const fetch = mockFetch(json(201, [SNAP, SNAP]));

		const snaps = await client(fetch).snaps.create({ collectionId: "c-1" });

		expect(snaps).toHaveLength(2);
		expect(callOf(fetch).body).toEqual({ collection_id: "c-1" });
	});

	it("preview() sends the template id and the variants as a query", async () => {
		const fetch = mockFetch(html("<html>preview</html>"));

		const result = await client(fetch).snaps.preview({
			templateId: TEMPLATE_ID,
			variants: [{ layer: "bg", background_color: "#f0573f" }],
		});

		expect(result).toBe("<html>preview</html>");
		expect(callOf(fetch).url.pathname).toBe("/api/v1/snaps/preview");
		expect(Object.fromEntries(callOf(fetch).url.searchParams)).toEqual({
			template_id: TEMPLATE_ID,
			"variants[0][layer]": "bg",
			"variants[0][background_color]": "#f0573f",
		});
		expect(callOf(fetch).headers.get("accept")).toContain("text/html");
	});
});

describe("batches", () => {
	it("create() maps the parameters to the wire names", async () => {
		const fetch = mockFetch(json(202, BATCH));

		const batch = await client(fetch).batches.create({
			templateId: TEMPLATE_ID,
			title: "October launch",
			items: [
				{ identifier: "row-1", variants: [{ layer: "title", text: "A" }] },
				{ variants: [] },
			],
			webhookUrl: "https://example.com/hooks/batch",
			format: "jpeg",
		});

		expect(batch).toEqual(BATCH);
		expect(callOf(fetch)).toMatchObject({
			method: "POST",
			body: {
				template_id: TEMPLATE_ID,
				title: "October launch",
				items: [
					{ identifier: "row-1", variants: [{ layer: "title", text: "A" }] },
					{ variants: [] },
				],
				webhook_url: "https://example.com/hooks/batch",
				format: "jpeg",
			},
		});
	});

	it("create() gives a ServerError with internal_error on a 500", async () => {
		const body = {
			message:
				"The server could not create the batch. Try again later. If the error continues, contact support and give the X-Request-Uuid header of this response.",
			code: "internal_error",
		};
		const fetch = mockFetch(json(500, body, { "x-request-uuid": "req-batch" }));

		const error = await client(fetch)
			.batches.create({ templateId: TEMPLATE_ID, items: [{ variants: [] }] })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ServerError);
		expect(error).toMatchObject({
			code: "server_error",
			status: 500,
			apiCode: "internal_error",
			message: body.message,
			requestId: "req-batch",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("get() reads the batch and its items", async () => {
		const result = { ...BATCH, items: [] };
		const fetch = mockFetch(json(200, result));

		expect(await client(fetch).batches.get(BATCH_ID)).toEqual(result);
		expect(callOf(fetch).url.pathname).toBe(
			`/api/v1/snaps/batches/${BATCH_ID}`,
		);
	});

	it("cancel() posts to the cancel route", async () => {
		const fetch = mockFetch(
			json(200, { ...BATCH, status: "canceled", items: [] }),
		);

		await client(fetch).batches.cancel(BATCH_ID);

		expect(callOf(fetch).method).toBe("POST");
		expect(callOf(fetch).url.pathname).toBe(
			`/api/v1/snaps/batches/${BATCH_ID}/cancel`,
		);
	});

	it("wait() reads until the status is terminal", async () => {
		const fetch = mockFetch(
			json(200, { ...BATCH, items: [] }),
			json(200, { ...BATCH, status: "processing", items: [] }),
			json(200, {
				...BATCH,
				status: "completed",
				completed: 2,
				pending: 0,
				items: [],
			}),
		);

		const batch = await client(fetch).batches.wait(BATCH_ID, { interval: 1 });

		expect(batch.status).toBe("completed");
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("wait() stops when the signal aborts", async () => {
		const fetch = mockFetch(
			json(200, { ...BATCH, items: [] }),
			json(200, { ...BATCH, items: [] }),
		);
		const controller = new AbortController();
		const promise = client(fetch).batches.wait(BATCH_ID, {
			interval: 50,
			signal: controller.signal,
		});
		setTimeout(() => controller.abort(new Error("enough")), 10);

		await expect(promise).rejects.toThrow("enough");
	});
});

describe("screenshots", () => {
	const screenshot = {
		id: "a1b2c3",
		url: "https://example.com",
		image_url: "https://snapsbrew.test/storage/screenshots/a1b2c3.png",
		width: 1330,
		height: 780,
		created_at: "2026-05-01T12:00:00.000000Z",
	};

	it("create() posts the page URL", async () => {
		const fetch = mockFetch(json(200, { data: screenshot }));

		expect(
			await client(fetch).screenshots.create({
				url: "https://example.com",
				width: 1330,
			}),
		).toEqual(screenshot);
		expect(callOf(fetch)).toMatchObject({
			method: "POST",
			body: { url: "https://example.com", width: 1330 },
		});
	});

	it("create() is not retried after a server error", async () => {
		const fetch = mockFetch(json(500, {}));

		await expect(
			client(fetch).screenshots.create({ url: "https://example.com" }),
		).rejects.toMatchObject({
			code: "server_error",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("get() reads one screenshot", async () => {
		const fetch = mockFetch(json(200, { data: screenshot }));

		expect(await client(fetch).screenshots.get("a1b2c3")).toEqual(screenshot);
	});

	it("get() and create() give a null image_url when there is no image", async () => {
		const empty = { ...screenshot, image_url: null };
		const fetch = mockFetch(
			json(200, { data: empty }),
			json(200, { data: empty }),
		);

		const read = await client(fetch).screenshots.get("a1b2c3");
		const created = await client(fetch).screenshots.create({
			url: "https://example.com",
		});

		expect(read.image_url).toBeNull();
		expect(created.image_url).toBeNull();
	});

	it("types image_url as string or null", () => {
		expectTypeOf<Screenshot["image_url"]>().toEqualTypeOf<string | null>();
		expectTypeOf<ScreenshotListItem["image_url"]>().toEqualTypeOf<
			string | null
		>();
	});

	// GET /v1/screenshots names the id `uuid` and reads `image_url` from the
	// media library, the same as the read and the create.
	const listItem = (uuid: string) => ({
		uuid,
		url: "https://example.com",
		image_url: `https://snapsbrew.test/storage/screenshots/${uuid}.png`,
		width: 1330,
		height: 780,
		created_at: "2026-05-01T12:00:00.000000Z",
	});

	it("list() reads one page with the image URL of each item", async () => {
		const page = {
			data: [listItem("a1b2c3")],
			meta: { previous_cursor: null, next_cursor: null },
		};
		const fetch = mockFetch(json(200, page));

		const result = await client(fetch).screenshots.list();

		expect(result).toEqual(page);
		expect(result.data[0]?.image_url).toBe(
			"https://snapsbrew.test/storage/screenshots/a1b2c3.png",
		);
		expect(callOf(fetch).url.search).toBe("");
	});

	it("list() follows next_cursor to the next page", async () => {
		const fetch = mockFetch(
			json(200, {
				data: [listItem("a1b2c3")],
				meta: { previous_cursor: null, next_cursor: "eyJpZCI6MX0" },
			}),
			json(200, {
				data: [listItem("d4e5f6")],
				meta: { previous_cursor: "eyJpZCI6Mn0", next_cursor: null },
			}),
		);

		const items = await client(fetch).screenshots.list().toArray();

		expect(items.map((item) => item.image_url)).toEqual([
			"https://snapsbrew.test/storage/screenshots/a1b2c3.png",
			"https://snapsbrew.test/storage/screenshots/d4e5f6.png",
		]);
		expect(callOf(fetch, 1).url.searchParams.get("cursor")).toBe("eyJpZCI6MX0");
	});

	it("list() gives a null image_url when there is no image", async () => {
		const fetch = mockFetch(
			json(200, {
				data: [{ ...listItem("a1b2c3"), image_url: null }],
				meta: { previous_cursor: null, next_cursor: null },
			}),
		);

		const result = await client(fetch).screenshots.list();

		expect(result.data[0]?.image_url).toBeNull();
	});
});

describe("media", () => {
	// The exact body of POST /v1/media and of each item of GET /v1/media.
	const media: Media = {
		id: 12,
		uuid: "5b0c7a52-3f9e-4a8d-9c1e-2d7f6b4e8a10",
		name: "logo",
		file_name: "logo.png",
		mime_type: "image/png",
		size: 20480,
		original_url: "https://snapsbrew.test/storage/12/logo.png",
		src: "https://snapsbrew.test/storage/12/conversions/logo-image.jpg",
		created_at: "2026-05-01T12:00:00.000000Z",
	};

	it("types Media with the nine documented fields only", () => {
		expectTypeOf<keyof Media>().toEqualTypeOf<
			| "id"
			| "uuid"
			| "name"
			| "file_name"
			| "mime_type"
			| "size"
			| "original_url"
			| "src"
			| "created_at"
		>();
	});

	it("upload() sends multipart form data", async () => {
		const fetch = mockFetch(json(200, media));

		const result = await client(fetch).media.upload(
			new Blob(["png-bytes"], { type: "image/png" }),
			{
				filename: "logo.png",
			},
		);

		expect(result).toEqual(media);
		const call = callOf(fetch);
		expect(call.method).toBe("POST");
		expect(call.headers.get("content-type")).toBeNull();
		const form = call.body as FormData;
		const file = form.get("file") as File;
		expect(file.name).toBe("logo.png");
		expect(await file.text()).toBe("png-bytes");
	});

	it("upload() uses the name of a File", async () => {
		const fetch = mockFetch(json(200, media));

		await client(fetch).media.upload(
			new File(["x"], "photo.jpg", { type: "image/jpeg" }),
		);

		expect(((callOf(fetch).body as FormData).get("file") as File).name).toBe(
			"photo.jpg",
		);
	});

	it("list() sends the page number", async () => {
		const fetch = mockFetch(
			json(200, {
				data: [media],
				current_page: 2,
				last_page: 2,
				next_page_url: null,
			}),
		);

		const page = await client(fetch).media.list({ page: 2 });

		expect(page.current_page).toBe(2);
		expect(page.data).toEqual([media]);
		expect(callOf(fetch).url.search).toBe("?page=2");
	});
});

describe("tags", () => {
	it("list() sends the search term", async () => {
		const fetch = mockFetch(
			json(200, { data: [{ id: 1, name: "Launch", slug: "launch" }] }),
		);

		expect(await client(fetch).tags.list({ search: "lau" })).toEqual([
			{ id: 1, name: "Launch", slug: "launch" },
		]);
		expect(callOf(fetch).url.search).toBe("?search=lau");
	});

	it("create() posts the name", async () => {
		const fetch = mockFetch(
			json(201, { data: { id: 2, name: "Sale", slug: "sale" } }),
		);

		expect(await client(fetch).tags.create({ name: "Sale" })).toEqual({
			id: 2,
			name: "Sale",
			slug: "sale",
		});
		expect(callOf(fetch).body).toEqual({ name: "Sale" });
	});
});

describe("guides", () => {
	const cases = [
		["design", "/v1/guides/design"],
		["layers", "/v1/guides/layers"],
		["variantProperties", "/v1/guides/variant-properties"],
		["editorDocument", "/v1/guides/editor-document"],
		["purposes", "/v1/guides/purposes"],
	] as const;

	for (const [method, path] of cases) {
		it(`${method}() reads ${path} and returns data`, async () => {
			const fetch = mockFetch(json(200, { data: { probe: method } }));

			expect(await client(fetch).guides[method]()).toEqual({ probe: method });
			expect(callOf(fetch).url.pathname).toBe(`/api${path}`);
		});
	}

	it("platforms() returns the list and the review month", async () => {
		const body = {
			data: [{ platform: "instagram" }],
			specs_reviewed: "2026-09",
		};
		const fetch = mockFetch(json(200, body));

		expect(await client(fetch).guides.platforms()).toEqual(body);
	});

	it("platform() and purpose() read one guide", async () => {
		const fetch = mockFetch(
			json(200, { data: { platform: "instagram" } }),
			json(200, { data: { purpose: "link_preview" } }),
		);
		const sb = client(fetch);

		expect(await sb.guides.platform("insta")).toEqual({
			platform: "instagram",
		});
		expect(await sb.guides.purpose("og")).toEqual({ purpose: "link_preview" });
		expect(callOf(fetch, 0).url.pathname).toBe(
			"/api/v1/guides/platforms/insta",
		);
		expect(callOf(fetch, 1).url.pathname).toBe("/api/v1/guides/purposes/og");
	});
});
