export { Snapsbrew, type SnapsbrewOptions } from "./client";
export type { FetchLike, RequestOptions } from "./core/transport";
export {
	type AnySnapsbrewError,
	ApiError,
	type ApiErrorCode,
	AuthenticationError,
	AuthorizationError,
	ConflictError,
	ConnectionError,
	isSnapsbrewError,
	NotFoundError,
	RateLimitError,
	ServerError,
	SnapsbrewError,
	type SnapsbrewErrorCode,
	TimeoutError,
	ValidationError,
} from "./errors";
export { PagePromise } from "./pagination";
export type {
	AccountResource,
	CreateScreenshotParams,
	Guides,
	MediaLibrary,
	MediaListParams,
	Screenshots,
	TagListParams,
	Tags,
	UploadOptions,
} from "./resources/library";
export type {
	Batches,
	BatchItemParams,
	CreateBatchParams,
	CreateCollectionSnapsParams,
	CreateSnapParams,
	SnapDelivery,
	SnapPreviewParams,
	Snaps,
	WaitOptions,
} from "./resources/snaps";
export type {
	ApplyOperationsParams,
	CreateTemplateParams,
	CursorParams,
	EditorDocuments,
	ReplaceDocumentParams,
	TemplateCanvas,
	TemplatePreviewParams,
	Templates,
	UpdateTemplateParams,
} from "./resources/templates";
export { encodeVariants, type SignedUrlOptions, signedUrl } from "./signed-url";
export type * from "./types";
