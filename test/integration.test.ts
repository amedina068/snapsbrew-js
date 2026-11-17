import { describe, expect, it } from "vitest";
import { Snapsbrew } from "../src/index";

// These tests call a real instance. They run only when both variables are
// set. They read data and make one free preview. They create nothing.
const baseUrl = process.env.SNAPSBREW_TEST_URL;
const token = process.env.SNAPSBREW_TEST_TOKEN;
const enabled =
	baseUrl !== undefined &&
	baseUrl !== "" &&
	token !== undefined &&
	token !== "";

describe.skipIf(!enabled)("integration", () => {
	const sb = new Snapsbrew({
		baseUrl: baseUrl ?? "https://unused.test",
		token: token ?? "unused",
		maxRetries: 1,
	});

	it("reads the account of the token", async () => {
		const account = await sb.account.get();

		expect(typeof account.email).toBe("string");
		expect(
			account.company === null || typeof account.company === "string",
		).toBe(true);
	});

	it("lists templates and previews the first one", async () => {
		const page = await sb.templates.list();

		expect(Array.isArray(page.data)).toBe(true);
		expect(page.meta).toHaveProperty("next_cursor");

		const first = page.data[0];

		if (first === undefined) {
			return;
		}

		const html = await sb.snaps.preview({ templateId: first.uuid });

		expect(html.toLowerCase()).toContain("<html");
	}, 60_000);
});
