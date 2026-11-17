import { type FetchLike, Transport } from "./core/transport";
import {
	AccountResource,
	Guides,
	MediaLibrary,
	Screenshots,
	Tags,
} from "./resources/library";
import { Batches, Snaps } from "./resources/snaps";
import { EditorDocuments, Templates } from "./resources/templates";

/** The settings of a `Snapsbrew` client. */
export interface SnapsbrewOptions {
	/**
	 * The root URL of your Snapsbrew instance, for example
	 * `https://app.snapsbrew.com`. The SDK adds `/api` to it.
	 */
	baseUrl: string | URL;
	/** An API token with the `api_requests` ability. */
	token: string;
	/** The time limit for one attempt, in milliseconds. The default is 60000. */
	timeout?: number;
	/** The maximum number of retries after the first attempt. The default is 2. Use 0 to stop retries. */
	maxRetries?: number;
	/** A `fetch` function for tests or a proxy. The global `fetch` is the default. */
	fetch?: FetchLike;
}

const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * A client for one Snapsbrew instance.
 *
 * @example
 * const sb = new Snapsbrew({ baseUrl: 'https://app.snapsbrew.com', token: process.env.SNAPSBREW_TOKEN })
 * const snap = await sb.snaps.create({ templateId, variants: [{ layer: 'title', text: 'Hello' }] })
 */
export class Snapsbrew {
	/** `/v1/auth`. */
	readonly account: AccountResource;
	/** `/v1/templates`. */
	readonly templates: Templates;
	/** `/v1/templates/{uuid}/document`: the v2 editor draft. */
	readonly documents: EditorDocuments;
	/** `/v1/snaps`. */
	readonly snaps: Snaps;
	/** `/v1/snaps/batches`. */
	readonly batches: Batches;
	/** `/v1/screenshots`. */
	readonly screenshots: Screenshots;
	/** `/v1/media`. */
	readonly media: MediaLibrary;
	/** `/v1/tags`. */
	readonly tags: Tags;
	/** `/v1/guides`. */
	readonly guides: Guides;

	constructor(options: SnapsbrewOptions) {
		if (typeof options.token !== "string" || options.token.trim() === "") {
			throw new TypeError("`token` must be an API token that is not empty.");
		}

		const transport = new Transport({
			baseUrl: options.baseUrl,
			token: options.token,
			timeout: positive("timeout", options.timeout ?? DEFAULT_TIMEOUT),
			maxRetries: positive(
				"maxRetries",
				options.maxRetries ?? DEFAULT_MAX_RETRIES,
				true,
			),
			fetch: options.fetch,
		});

		this.account = new AccountResource(transport);
		this.templates = new Templates(transport);
		this.documents = new EditorDocuments(transport);
		this.snaps = new Snaps(transport);
		this.batches = new Batches(transport);
		this.screenshots = new Screenshots(transport);
		this.media = new MediaLibrary(transport);
		this.tags = new Tags(transport);
		this.guides = new Guides(transport);
	}
}

function positive(name: string, value: number, allowZero = false): number {
	const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);

	if (!valid) {
		throw new TypeError(
			`\`${name}\` must be a ${allowZero ? "number that is 0 or more" : "positive number"}.`,
		);
	}

	return value;
}
