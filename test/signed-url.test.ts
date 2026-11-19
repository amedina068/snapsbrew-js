import { describe, expect, it } from "vitest";
import { encodeVariants, signedUrl, type Variant } from "../src/index";
import { canonicalString, hmacSha256Hex } from "../src/signed-url";
import vectors from "./fixtures/signed-url-vectors.json" with { type: "json" };

const BASE = "https://snapsbrew.example";

describe("signed URL vectors", () => {
	for (const vector of vectors.cases) {
		describe(vector.name, () => {
			const params = Object.entries(vector.params) as Array<[string, string]>;

			it("builds the canonical string", () => {
				expect(canonicalString(params)).toBe(vector.canonical_string);
			});

			it("builds the signature", async () => {
				expect(await hmacSha256Hex(vectors.key, vector.canonical_string)).toBe(
					vector.signature,
				);
			});

			it("encodes the variants as standard base64", () => {
				if (vector.variants_json === null) {
					return;
				}

				const variants = JSON.parse(vector.variants_json) as Variant[];
				expect(encodeVariants(variants)).toBe(vector.params.variants);
			});

			it("builds the URL", async () => {
				const variants =
					vector.variants_json === null
						? undefined
						: (JSON.parse(vector.variants_json) as Variant[]);
				const format = (vector.params as { format?: string }).format;
				const url = await signedUrl({
					baseUrl: BASE,
					key: vectors.key,
					templateId: vector.params.template_id,
					...(variants === undefined ? {} : { variants }),
					// The vector uses `jpg`. The server ignores this value and renders a PNG.
					...(format === undefined ? {} : { format: format as "png" }),
				});

				expect(url).toBe(vector.url);
			});
		});
	}
});

describe("signedUrl()", () => {
	const options = {
		baseUrl: BASE,
		key: vectors.key,
		templateId: "044ec825-ee2f-4d06-bb77-98663e27f529",
	};

	it("signs the transparent flag and extra parameters", async () => {
		const url = new URL(
			await signedUrl({
				...options,
				format: "webp",
				transparent: true,
				params: { width_hint: "1200" },
			}),
		);
		const params = [...url.searchParams].filter(
			([name]) => name !== "signature",
		);

		expect(Object.fromEntries(params)).toEqual({
			template_id: options.templateId,
			format: "webp",
			transparent: "1",
			width_hint: "1200",
		});
		expect(url.searchParams.get("signature")).toBe(
			await hmacSha256Hex(vectors.key, canonicalString(params)),
		);
	});

	it("keeps a base path and drops a trailing slash", async () => {
		const url = await signedUrl({
			...options,
			baseUrl: "https://example.com/snapsbrew/",
		});
		expect(
			url.startsWith(
				"https://example.com/snapsbrew/signed-url/image.jpg?template_id=",
			),
		).toBe(true);
	});

	it("gives the same URL for the same input", async () => {
		const variants: Variant[] = [{ layer: "title", text: "Hello" }];
		expect(await signedUrl({ ...options, variants })).toBe(
			await signedUrl({ ...options, variants }),
		);
	});

	it("sorts names in byte order, not in locale order", () => {
		expect(
			canonicalString([
				["b", "2"],
				["B", "1"],
				["a_b", "3"],
				["a", "4"],
			]),
		).toBe("B=1&a=4&a_b=3&b=2");
	});

	it("rejects bad input", async () => {
		await expect(signedUrl({ ...options, key: "" })).rejects.toThrow(TypeError);
		await expect(signedUrl({ ...options, templateId: "" })).rejects.toThrow(
			TypeError,
		);
		await expect(
			signedUrl({ ...options, baseUrl: "snapsbrew.example" }),
		).rejects.toThrow(TypeError);
		await expect(
			signedUrl({ ...options, params: { signature: "x" } }),
		).rejects.toThrow(/reserved/);
		await expect(
			signedUrl({ ...options, params: { identifier: "x" } }),
		).rejects.toThrow(/reserved/);
		await expect(
			signedUrl({ ...options, params: { api_log_uuid: "x" } }),
		).rejects.toThrow(/reserved/);
		await expect(
			signedUrl({ ...options, params: { "a.b": "x" } }),
		).rejects.toThrow(/letters/);
		const jpeg = { ...options, format: "jpeg", transparent: true } as const;
		// @ts-expect-error The type rejects JPEG with transparency.
		const transparentJpeg = signedUrl(jpeg);
		await expect(transparentJpeg).rejects.toThrow(/JPEG/);
	});
});
