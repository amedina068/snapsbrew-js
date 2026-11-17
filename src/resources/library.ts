import { segment } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { cursorPages, PagePromise } from "../pagination";
import type {
	Account,
	CursorPage,
	GuideCatalog,
	Media,
	MediaPage,
	PlatformIndex,
	PurposeSummary,
	Screenshot,
	ScreenshotListItem,
	Tag,
	VariantPropertyGuide,
} from "../types";
import type { CursorParams } from "./templates";

/** `/v1/auth`: the account that owns the token. */
export class AccountResource {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Reads the account and the company of the token. Use it to test a token. */
	async get(options: RequestOptions = {}): Promise<Account> {
		const body = await this.#transport.request<{ data: Account }>(
			{ method: "GET", path: "/v1/auth" },
			options,
		);

		return body.data;
	}
}

/** The fields of `screenshots.create()`. */
export interface CreateScreenshotParams {
	/** The public page to capture. */
	url: string;
	/** The width of the viewport. The default is 1330. */
	width?: number;
	/** The height of the viewport. The default is 780. */
	height?: number;
}

/** `/v1/screenshots`: capture web pages. */
export class Screenshots {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists the screenshots of your company. */
	list(
		params: CursorParams = {},
		options: RequestOptions = {},
	): PagePromise<CursorPage<ScreenshotListItem>, ScreenshotListItem> {
		return cursorPages<CursorPage<ScreenshotListItem>, ScreenshotListItem>(
			(cursor) =>
				this.#transport.request<CursorPage<ScreenshotListItem>>(
					{ method: "GET", path: "/v1/screenshots", query: { cursor } },
					options,
				),
			params.cursor,
		);
	}

	/** Reads one screenshot. */
	async get(
		screenshotUuid: string,
		options: RequestOptions = {},
	): Promise<Screenshot> {
		const body = await this.#transport.request<{ data: Screenshot }>(
			{ method: "GET", path: `/v1/screenshots/${segment(screenshotUuid)}` },
			options,
		);

		return body.data;
	}

	/** Captures a web page. The call waits until the image is ready. */
	async create(
		params: CreateScreenshotParams,
		options: RequestOptions = {},
	): Promise<Screenshot> {
		const body = await this.#transport.request<{ data: Screenshot }>(
			{ method: "POST", path: "/v1/screenshots", json: params },
			options,
		);

		return body.data;
	}
}

/** The fields of `media.list()`. */
export interface MediaListParams {
	/** The first page to load. The default is 1. */
	page?: number;
}

/** The settings of `media.upload()`. */
export interface UploadOptions extends RequestOptions {
	/** The file name. The default is the name of a `File`, or `upload`. */
	filename?: string;
}

/** `/v1/media`: the image library of your account. */
export class MediaLibrary {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists your images, 12 on each page, the newest first. */
	list(
		params: MediaListParams = {},
		options: RequestOptions = {},
	): PagePromise<MediaPage, Media> {
		return new PagePromise<MediaPage, Media>(
			async (page) => {
				const body = await this.#transport.request<MediaPage>(
					{ method: "GET", path: "/v1/media", query: { page } },
					options,
				);

				return {
					page: body,
					items: body.data,
					next:
						body.next_page_url === null
							? undefined
							: String(body.current_page + 1),
				};
			},
			params.page === undefined ? undefined : String(params.page),
		);
	}

	/**
	 * Uploads an image. Use the `src` of the result as an `image_url` variant.
	 *
	 * @example
	 * const media = await sb.media.upload(new Blob([bytes], { type: 'image/png' }), { filename: 'logo.png' })
	 */
	async upload(file: Blob, options: UploadOptions = {}): Promise<Media> {
		const { filename, ...requestOptions } = options;
		const form = new FormData();
		const name =
			filename ??
			(typeof File !== "undefined" && file instanceof File
				? file.name
				: "upload");
		form.append("file", file, name);

		return this.#transport.request<Media>(
			{ method: "POST", path: "/v1/media", form },
			requestOptions,
		);
	}
}

/** The fields of `tags.list()`. */
export interface TagListParams {
	/** A part of the tag name. The match ignores case. */
	search?: string;
}

/** `/v1/tags`: the tags of your company. */
export class Tags {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Lists up to 15 tags, sorted by name. */
	async list(
		params: TagListParams = {},
		options: RequestOptions = {},
	): Promise<Tag[]> {
		const body = await this.#transport.request<{ data: Tag[] }>(
			{ method: "GET", path: "/v1/tags", query: { search: params.search } },
			options,
		);

		return body.data;
	}

	/** Creates a tag. The server makes the slug from the name. */
	async create(
		params: { name: string },
		options: RequestOptions = {},
	): Promise<Tag> {
		const body = await this.#transport.request<{ data: Tag }>(
			{ method: "POST", path: "/v1/tags", json: params },
			options,
		);

		return body.data;
	}
}

/**
 * `/v1/guides`: static reference catalogs. The content is the same for each
 * account, so you can keep a response in a cache. A guide call does not go
 * into the usage log.
 */
export class Guides {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Canvas presets, layer order, typography, color rules and recipes. */
	design(options: RequestOptions = {}): Promise<GuideCatalog> {
		return this.#data<GuideCatalog>("/v1/guides/design", options);
	}

	/** The layer vocabulary for a template write. */
	layers(options: RequestOptions = {}): Promise<GuideCatalog> {
		return this.#data<GuideCatalog>("/v1/guides/layers", options);
	}

	/** Each property that a variant can set. */
	variantProperties(
		options: RequestOptions = {},
	): Promise<VariantPropertyGuide[]> {
		return this.#data<VariantPropertyGuide[]>(
			"/v1/guides/variant-properties",
			options,
		);
	}

	/** The contract of the v2 editor document. */
	editorDocument(options: RequestOptions = {}): Promise<GuideCatalog> {
		return this.#data<GuideCatalog>("/v1/guides/editor-document", options);
	}

	/** One line for each platform, and the month of the last spec check. */
	platforms(options: RequestOptions = {}): Promise<PlatformIndex> {
		return this.#transport.request<PlatformIndex>(
			{ method: "GET", path: "/v1/guides/platforms" },
			options,
		);
	}

	/** The full rules of one platform, for example `instagram` or the alias `insta`. */
	async platform(
		key: string,
		options: RequestOptions = {},
	): Promise<GuideCatalog> {
		return this.#data<GuideCatalog>(
			`/v1/guides/platforms/${segment(key)}`,
			options,
		);
	}

	/** One line for each image purpose. */
	purposes(options: RequestOptions = {}): Promise<PurposeSummary[]> {
		return this.#data<PurposeSummary[]>("/v1/guides/purposes", options);
	}

	/** The full rules of one image purpose, for example `link_preview` or the alias `og`. */
	async purpose(
		key: string,
		options: RequestOptions = {},
	): Promise<GuideCatalog> {
		return this.#data<GuideCatalog>(
			`/v1/guides/purposes/${segment(key)}`,
			options,
		);
	}

	async #data<T>(path: string, options: RequestOptions): Promise<T> {
		const body = await this.#transport.request<{ data: T }>(
			{ method: "GET", path },
			options,
		);

		return body.data;
	}
}
