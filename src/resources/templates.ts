import { segment } from "../core/query";
import type { RequestOptions, Transport } from "../core/transport";
import { cursorPages, type PagePromise } from "../pagination";
import type {
	CursorPage,
	EditorDocument,
	EditorDocumentBody,
	EditorOperation,
	LayerDefinition,
	LayerGroup,
	PreflightResult,
	PublishedTemplate,
	SizePreset,
	Tag,
	Template,
	TemplateLayer,
	TemplateListItem,
	TemplateWriteResult,
	Variant,
} from "../types";

/** The canvas of a new template: a size preset, or a width and a height. */
export type TemplateCanvas =
	| { size: string; width?: never; height?: never }
	| { size?: never; width: number; height: number };

/** The fields of `templates.create()`. */
export type CreateTemplateParams = {
	title: string;
	/** The layers. `GET /v1/guides/layers` gives the vocabulary. An empty list makes an empty canvas. */
	layers?: readonly LayerDefinition[];
	groups?: readonly LayerGroup[];
} & TemplateCanvas;

/** The fields of `templates.update()`. The server requires `title` on each update. */
export interface UpdateTemplateParams {
	title: string;
	/** A size preset. It sets the width and the height. */
	size?: string;
	width?: number;
	height?: number;
	layers?: readonly LayerDefinition[];
	/** `null` removes every group. */
	groups?: readonly LayerGroup[] | null;
}

/** The fields of a list call with a cursor. */
export interface CursorParams {
	/** A cursor from `meta.next_cursor` of an earlier page. */
	cursor?: string;
}

/** The fields of a preview call. */
export interface TemplatePreviewParams {
	variants?: readonly Variant[];
}

/** `/v1/templates`: list, read, write and publish templates. */
export class Templates {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/**
	 * Lists the templates of your company. Use `await` for one page, or
	 * `for await` for each template.
	 */
	list(
		params: CursorParams = {},
		options: RequestOptions = {},
	): PagePromise<CursorPage<TemplateListItem>, TemplateListItem> {
		return cursorPages<CursorPage<TemplateListItem>, TemplateListItem>(
			async (cursor) => {
				const page = await this.#transport.request<
					CursorPage<TemplateListItem>
				>({ method: "GET", path: "/v1/templates", query: { cursor } }, options);

				return { ...page, data: page.data.map(withLayerObjects) };
			},
			params.cursor,
		);
	}

	/** Reads one template with its layers and its publish state. */
	async get(
		templateUuid: string,
		options: RequestOptions = {},
	): Promise<Template> {
		const body = await this.#transport.request<{ data: Template }>(
			{ method: "GET", path: `/v1/templates/${segment(templateUuid)}` },
			options,
		);

		return withLayerObjects(body.data);
	}

	/** Lists each canvas size preset that a template write accepts as `size`. */
	async sizes(options: RequestOptions = {}): Promise<SizePreset[]> {
		const body = await this.#transport.request<{ data: SizePreset[] }>(
			{ method: "GET", path: "/v1/templates/sizes" },
			options,
		);

		return body.data;
	}

	/** Creates a template. */
	async create(
		params: CreateTemplateParams,
		options: RequestOptions = {},
	): Promise<TemplateWriteResult> {
		const body = await this.#transport.request<{ data: TemplateWriteResult }>(
			{ method: "POST", path: "/v1/templates", json: params },
			options,
		);

		return body.data;
	}

	/**
	 * Updates a template. The id is the UUID or the numeric id. A template
	 * from the v2 editor rejects this call: use `documents` for it.
	 */
	async update(
		templateId: string | number,
		params: UpdateTemplateParams,
		options: RequestOptions = {},
	): Promise<TemplateWriteResult> {
		const body = await this.#transport.request<{ data: TemplateWriteResult }>(
			{
				method: "PATCH",
				path: `/v1/templates/${segment(templateId)}`,
				json: params,
			},
			options,
		);

		return body.data;
	}

	/** Deletes a template. The id is the UUID or the numeric id. */
	async delete(
		templateId: string | number,
		options: RequestOptions = {},
	): Promise<void> {
		await this.#transport.request(
			{ method: "DELETE", path: `/v1/templates/${segment(templateId)}` },
			options,
		);
	}

	/**
	 * Publishes the draft as a new version. Snaps render only the published
	 * version. A repeat of the call creates no second version.
	 */
	async publish(
		templateUuid: string,
		options: RequestOptions = {},
	): Promise<PublishedTemplate> {
		const body = await this.#transport.request<{ data: PublishedTemplate }>(
			{
				method: "POST",
				path: `/v1/templates/${segment(templateUuid)}/publish`,
				idempotent: true,
			},
			options,
		);

		return body.data;
	}

	/** Renders a watermarked HTML preview. A preview costs no credit and stores nothing. */
	async preview(
		templateUuid: string,
		params: TemplatePreviewParams = {},
		options: RequestOptions = {},
	): Promise<string> {
		return this.#transport.request<string>(
			{
				method: "GET",
				path: `/v1/templates/${segment(templateUuid)}/preview`,
				query: { variants: params.variants },
				text: true,
			},
			options,
		);
	}

	/** Replaces all the tags of a template. An empty list removes each tag. */
	async setTags(
		templateUuid: string,
		tagIds: readonly number[],
		options: RequestOptions = {},
	): Promise<Tag[]> {
		const body = await this.#transport.request<{ tags: Tag[] }>(
			{
				method: "POST",
				path: `/v1/templates/${segment(templateUuid)}/tags`,
				json: { tag_ids: tagIds },
				idempotent: true,
			},
			options,
		);

		return body.tags;
	}
}

/** The fields of `documents.replace()`. */
export interface ReplaceDocumentParams {
	/** The revision that the last read returned. */
	revision: number;
	/** The complete document. A layer or a property that you leave out is removed. */
	document: EditorDocumentBody;
}

/** The fields of `documents.apply()`. */
export interface ApplyOperationsParams {
	/** The revision that the last read returned. */
	revision: number;
	/** One to 100 operations. They apply together, or none applies. */
	operations: readonly EditorOperation[];
}

/**
 * `/v1/templates/{uuid}/document`: the v2 editor draft of a template. Each
 * write is a compare-and-swap. If the revision moved, the write throws a
 * `ConflictError` with `currentRevision`. The SDK does not retry a write.
 */
export class EditorDocuments {
	readonly #transport: Transport;

	constructor(transport: Transport) {
		this.#transport = transport;
	}

	/** Reads the document and its revision. */
	async get(
		templateUuid: string,
		options: RequestOptions = {},
	): Promise<EditorDocument> {
		return this.#transport.request<EditorDocument>(
			{
				method: "GET",
				path: `/v1/templates/${segment(templateUuid)}/document`,
			},
			options,
		);
	}

	/** Replaces the whole document. */
	async replace(
		templateUuid: string,
		params: ReplaceDocumentParams,
		options: RequestOptions = {},
	): Promise<EditorDocument> {
		return this.#transport.request<EditorDocument>(
			{
				method: "PUT",
				path: `/v1/templates/${segment(templateUuid)}/document`,
				json: params,
				// A repeat after a lost response gets a conflict, not the result.
				idempotent: false,
			},
			options,
		);
	}

	/** Applies a list of operations and changes only the properties that they name. */
	async apply(
		templateUuid: string,
		params: ApplyOperationsParams,
		options: RequestOptions = {},
	): Promise<EditorDocument> {
		return this.#transport.request<EditorDocument>(
			{
				method: "PATCH",
				path: `/v1/templates/${segment(templateUuid)}/document`,
				json: params,
			},
			options,
		);
	}

	/** Lists the known problems of the stored draft. */
	async preflight(
		templateUuid: string,
		options: RequestOptions = {},
	): Promise<PreflightResult> {
		return this.#transport.request<PreflightResult>(
			{
				method: "GET",
				path: `/v1/templates/${segment(templateUuid)}/document/preflight`,
			},
			options,
		);
	}
}

// The server sends `[]`, not `{}`, for a layer that accepts no override,
// because PHP encodes an empty array as a list.
function withLayerObjects<T extends { layers: TemplateLayer[] }>(
	template: T,
): T {
	return {
		...template,
		layers: template.layers.map((layer) => ({
			...layer,
			available_modifications: Array.isArray(layer.available_modifications)
				? {}
				: layer.available_modifications,
		})),
	};
}
