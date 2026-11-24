import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	NotFoundError,
	RateLimitError,
	ServerError,
	Snapsbrew,
} from "../src/index";
import { callOf, client, json, mockFetch } from "./helpers";

const FORM_URL =
	"https://snapsbrew.test/api/v1/embedded-forms/5c2a9e1f-0b44-4a1e-9f2b-5d3c8e1a7b60?signature=0f3a9c";
const SNAP = {
	id: "9f1c2d3e",
	media_url: "https://snapsbrew.test/storage/snaps/9f1c2d3e.png",
	status: "completed",
};

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

async function settle<T>(promise: Promise<T>): Promise<T | unknown> {
	const result = promise.catch((error: unknown) => error);
	await vi.runAllTimersAsync();

	return result;
}

describe("forms.submit()", () => {
	it("posts the layers to the signed URL and returns one snap", async () => {
		const fetch = mockFetch(json(201, SNAP));

		const snap = await client(fetch).forms.submit(FORM_URL, {
			headline: "Hello",
		});

		const call = callOf(fetch);
		expect(snap).toEqual(SNAP);
		expect(call.method).toBe("POST");
		expect(call.url.href).toBe(FORM_URL);
		expect(call.body).toBeInstanceOf(FormData);
		expect((call.body as FormData).get("layers[headline]")).toBe("Hello");
	});

	it("returns a list of snaps for a collection form", async () => {
		const fetch = mockFetch(json(201, [SNAP, { ...SNAP, id: "4b8a7c6d" }]));

		const snaps = await client(fetch).forms.submit(FORM_URL, {
			"141e8454__headline": "Hello",
		});

		expect(Array.isArray(snaps)).toBe(true);
		expect((snaps as { id: string }[]).map((snap) => snap.id)).toEqual([
			"9f1c2d3e",
			"4b8a7c6d",
		]);
	});

	it("sends an image layer as a file", async () => {
		const fetch = mockFetch(json(201, SNAP));
		const photo = new File(["PNG-BYTES"], "photo.png", { type: "image/png" });

		await client(fetch).forms.submit(FORM_URL, { photo });

		const sent = (callOf(fetch).body as FormData).get("layers[photo]");
		expect(sent).toBeInstanceOf(File);
		expect((sent as File).name).toBe("photo.png");
	});

	it("sends no token to the form", async () => {
		const fetch = mockFetch(json(201, SNAP));

		await client(fetch).forms.submit(FORM_URL, { headline: "Hello" });

		expect(callOf(fetch).headers.has("authorization")).toBe(false);
	});

	it("submits from a client with no token", async () => {
		const fetch = mockFetch(json(201, SNAP));
		const sb = new Snapsbrew({ baseUrl: "https://snapsbrew.test", fetch });

		expect(await sb.forms.submit(FORM_URL, { headline: "Hello" })).toEqual(
			SNAP,
		);
		expect(callOf(fetch).headers.has("authorization")).toBe(false);
	});

	it("refuses a URL that is not absolute", async () => {
		await expect(
			client(mockFetch()).forms.submit("/api/v1/embedded-forms/5c2a", {
				headline: "Hello",
			}),
		).rejects.toThrow(TypeError);
	});

	it("gives a not found error for a bad signature", async () => {
		const fetch = mockFetch(json(404, { message: "" }));

		const error = await settle(
			client(fetch).forms.submit(FORM_URL, { headline: "Hello" }),
		);

		expect(error).toBeInstanceOf(NotFoundError);
	});

	it("gives the rate limit code of too many submissions", async () => {
		const fetch = mockFetch(
			json(
				429,
				{ message: "Too many.", code: "rate_limited" },
				{ "retry-after": "30" },
			),
		);

		const error = await settle(
			client(fetch, { maxRetries: 0 }).forms.submit(FORM_URL, {
				headline: "Hello",
			}),
		);

		expect(error).toBeInstanceOf(RateLimitError);
		expect(error).toMatchObject({ apiCode: "rate_limited", retryAfter: 30 });
	});

	it("retries a rate limit", async () => {
		const fetch = mockFetch(
			json(429, { code: "rate_limited" }, { "retry-after": "1" }),
			json(201, SNAP),
		);

		expect(
			await settle(client(fetch).forms.submit(FORM_URL, { headline: "Hello" })),
		).toEqual(SNAP);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("does not retry a server error", async () => {
		const fetch = mockFetch(
			json(500, { message: "Server Error" }),
			json(201, SNAP),
		);

		const error = await settle(
			client(fetch).forms.submit(FORM_URL, { headline: "Hello" }),
		);

		expect(error).toBeInstanceOf(ServerError);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
