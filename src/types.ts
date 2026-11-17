/**
 * The types of the Snapsbrew REST API. Response fields keep the names that the
 * server sends (snake_case), so a type maps one to one to the JSON body.
 */

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The properties that a variant can override on one layer. */
export interface VariantProperties {
	/** Replace the content of a text layer. */
	text: string;
	/** Replace the image of an image layer. The URL must be public. */
	image_url: string;
	/** Replace a background color, for example `#f0573f`. */
	background_color: string;
	/** Set the content of a QR code layer. */
	qr_content: string;
	/** Set the value of a barcode layer. */
	barcode_content: string;
	/** Remove the layer from the render. */
	hidden: boolean;
}

/** The name of one variant property. */
export type VariantProperty = keyof VariantProperties;

type VariantOf<K extends VariantProperty> = Simplify<
	{ layer: string } & { [P in K]: VariantProperties[P] } & {
		[P in Exclude<VariantProperty, K>]?: never;
	}
>;

/** A variant that replaces the content of a text layer. */
export type TextVariant = VariantOf<"text">;
/** A variant that replaces the image of an image layer. */
export type ImageVariant = VariantOf<"image_url">;
/** A variant that replaces a background color. */
export type BackgroundColorVariant = VariantOf<"background_color">;
/** A variant that sets the content of a QR code layer. */
export type QrContentVariant = VariantOf<"qr_content">;
/** A variant that sets the value of a barcode layer. */
export type BarcodeContentVariant = VariantOf<"barcode_content">;
/** A variant that shows or hides a layer. */
export type HiddenVariant = VariantOf<"hidden">;

/**
 * One override for one layer. Each variant names a layer key and sets
 * exactly one property. The union rejects an object that sets two properties.
 */
export type Variant =
	| TextVariant
	| ImageVariant
	| BackgroundColorVariant
	| QrContentVariant
	| BarcodeContentVariant
	| HiddenVariant;

/** The output type of a snap. */
export type SnapType = "image" | "pdf";

/** The image format of a snap. */
export type ImageFormat = "png" | "jpeg" | "webp";

/** The status of a snap or of a batch item. */
export type SnapStatus =
	| "pending"
	| "processing"
	| "completed"
	| "failed"
	| "canceled";

/** The status of a batch. */
export type BatchStatus = SnapStatus;

/** A batch status that never changes again. */
export type TerminalBatchStatus = "completed" | "failed" | "canceled";

/** An ISO 8601 timestamp, for example `2026-05-01T12:00:00.000000Z`. */
export type Timestamp = string;

/**
 * The output options of a render. JPEG has no alpha channel, so the type
 * rejects `transparent: true` together with `format: 'jpeg'`.
 */
export type OutputOptions = { type?: SnapType } & (
	| { format?: "png" | "webp"; transparent?: boolean }
	| { format: "jpeg"; transparent?: false }
);

/** `GET /v1/auth`: the account that owns the token. */
export interface Account {
	email: string;
	name: string;
	/** `null` when the account belongs to no company. */
	company: string | null;
}

/** A property that a template layer accepts as an override. */
export type LayerModification =
	| "image_url"
	| "text"
	| "qr_content"
	| "barcode_content";

/** One addressable layer of a template, with its current values. */
export interface TemplateLayer {
	/** The layer key. Use it as `layer` in a variant. */
	layer: string | null;
	/** The overrides that the layer accepts, with the current values. */
	available_modifications: Partial<Record<LayerModification, string | null>>;
}

/** One template in `GET /v1/templates`. */
export interface TemplateListItem {
	uuid: string;
	title: string;
	width: number;
	height: number;
	layers: TemplateLayer[];
	created_at: Timestamp;
}

/** `GET /v1/templates/{uuid}`: one template with its publish state. */
export interface Template extends TemplateListItem {
	/** The canvas size preset, or `custom`. `null` for an old template with no preset. */
	size: string | null;
	/** The version that snaps render. `null` until the first publish. */
	published_version: number | null;
	/** `true` when the draft is not the same as the published version. */
	has_unpublished_edits: boolean;
}

/** The fields that a template create or update returns. */
export interface TemplateWriteResult {
	uuid: string;
	title: string;
	/** The canvas size preset, or `custom`. `null` for an old template with no preset. */
	size: string | null;
	width: number;
	height: number;
	created_at: Timestamp;
}

/** `POST /v1/templates/{uuid}/publish`. */
export interface PublishedTemplate {
	/** @deprecated The server repeats `uuid` here. Read `uuid`. */
	id: string;
	uuid: string;
	published_version: number;
}

/** A canvas size preset from `GET /v1/templates/sizes`. */
export interface SizePreset {
	size: string;
	name: string;
	platform: string;
	width: number;
	height: number;
	aspect_ratio: string;
	safe_margin_px: number;
}

/** A layer definition for a template write. `GET /v1/guides/layers` gives the vocabulary. */
export interface LayerDefinition {
	/** The unique layer key. A variant uses it as `layer`. */
	key: string;
	/** The editor layer type, for example `text`, `image`, `qr_code`, `barcode` or `empty`. */
	type?: string;
	/** The design-time properties. Send `[]` for none. */
	properties: Array<{ name: string; value: unknown }>;
	[property: string]: unknown;
}

/** A layer group for a template write. */
export interface LayerGroup {
	id: string;
	name?: string | null;
	visible?: boolean;
	collapsed?: boolean;
	order?: number;
}

/** One page of a cursor-paginated list. */
export interface CursorPage<T> {
	data: T[];
	meta: {
		previous_cursor: string | null;
		next_cursor: string | null;
	};
}

/** A rendered (or queued) snap. */
export interface Snap {
	id: string;
	/** The URL of the finished file. `null` until the render is complete. */
	media_url: string | null;
	width: number | null;
	height: number | null;
	type: SnapType;
	status: SnapStatus;
	is_async: boolean;
	webhook_url: string | null;
	completed_at: Timestamp | null;
	/** A message for a person. Do not branch on this value. */
	last_error: string | null;
	variants: Variant[] | null;
	/** `null` for a snap from an inline design. */
	template_id: string | null;
	/** `null` for a snap from an inline design. */
	template_title: string | null;
	created_at: Timestamp;
}

/** The counts of a batch. */
export interface Batch {
	uuid: string;
	title: string;
	status: BatchStatus;
	total_rows: number;
	processed_rows: number;
	completed: number;
	pending: number;
	failed: number;
	canceled: number;
	status_url: string;
}

/** One item of a batch. */
export interface BatchItem {
	id: string;
	identifier: string | null;
	status: SnapStatus;
	/** Set only when `status` is `completed`. */
	media_url: string | null;
	/** A message for a person. Do not branch on this value. */
	last_error: string | null;
}

/** A batch with each of its items. */
export interface BatchWithItems extends Batch {
	items: BatchItem[];
}

/** `GET /v1/screenshots/{uuid}` and `POST /v1/screenshots`. */
export interface Screenshot {
	id: string;
	/** The page that the server captured. */
	url: string;
	/** The URL of the image. `null` when the server stored no image. */
	image_url: string | null;
	width: number;
	height: number;
	created_at: Timestamp;
}

/** One screenshot in `GET /v1/screenshots`. The list names the id `uuid`. */
export interface ScreenshotListItem {
	/** The same value as `id` in `Screenshot`. */
	uuid: string;
	/** The page that the server captured. */
	url: string;
	/** The URL of the image. `null` when the server stored no image. */
	image_url: string | null;
	width: number;
	height: number;
	created_at: Timestamp;
}

/**
 * One image in the media library. The upload and the list return these
 * fields and no other field.
 */
export interface Media {
	id: number;
	uuid: string | null;
	/** The file name without the extension. */
	name: string;
	/** The stored file name. */
	file_name: string;
	mime_type: string | null;
	/** The file size in bytes. */
	size: number;
	/** The URL of the original file. */
	original_url: string;
	/** The URL to use as an `image_url` variant. */
	src: string;
	created_at: Timestamp;
}

/** One page of `GET /v1/media`, in the Laravel paginator format. */
export interface MediaPage {
	data: Media[];
	current_page: number;
	last_page: number;
	per_page: number;
	total: number;
	from: number | null;
	to: number | null;
	path: string;
	first_page_url: string;
	last_page_url: string;
	next_page_url: string | null;
	prev_page_url: string | null;
	links: Array<{ url: string | null; label: string; active: boolean }>;
}

/** A tag. */
export interface Tag {
	id: number;
	name: string;
	slug: string;
}

/** One layer of a v2 editor document. */
export interface EditorLayer {
	key: string;
	type: string;
	properties: Array<{ name: string; value: unknown }>;
	[field: string]: unknown;
}

/** The body of a v2 editor document. */
export interface EditorDocumentBody {
	version: number;
	layers: EditorLayer[];
	groups: Record<string, unknown> | unknown[];
	[field: string]: unknown;
}

/** An editor document and its revision. */
export interface EditorDocument {
	/** `null` when the template has no draft. */
	document: EditorDocumentBody | null;
	revision: number;
}

/** One operation of `PATCH /v1/templates/{uuid}/document`. */
export type EditorOperation =
	| {
			operation: "set_layer_property";
			layer_key: string;
			property: string;
			value: unknown;
	  }
	| { operation: "set_layer_type"; layer_key: string; type: string };

/** One problem that the preflight found. */
export interface PreflightIssue {
	code: string;
	/** A JSON pointer into the document. */
	path: string;
	message: string;
}

/** `GET /v1/templates/{uuid}/document/preflight`. */
export interface PreflightResult {
	/** An empty list means that the known checks pass. */
	issues: PreflightIssue[];
	revision: number;
}

/** A JSON value. The guide catalogs use it for the parts that change often. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/** A guide catalog. Its fields change between API versions. */
export type GuideCatalog = { [key: string]: JsonValue };

/** One variant property in `GET /v1/guides/variant-properties`. */
export interface VariantPropertyGuide {
	property: VariantProperty;
	value_type: string;
	applies_to: string;
	description: string;
	example: Variant;
}

/** One platform in `GET /v1/guides/platforms`. */
export interface PlatformSummary {
	platform: string;
	name: string;
	start_here: string;
	dimensions: string | null;
	why: string;
}

/** `GET /v1/guides/platforms`. */
export interface PlatformIndex {
	data: PlatformSummary[];
	/** The month of the last check of the published specs, for example `2026-09`. */
	specs_reviewed: string;
}

/** One purpose in `GET /v1/guides/purposes`. */
export interface PurposeSummary {
	purpose: string;
	name: string;
	use_when: string;
	sizes: string[];
}
