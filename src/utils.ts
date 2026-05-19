export const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let _debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
	_debugEnabled = enabled;
}

export function isDebugEnabled(): boolean {
	return _debugEnabled;
}

export function log(...args: unknown[]): void {
	if (_debugEnabled) {
		console.log("[auto-card-link]", ...args);
	}
}

export function logGroupStart(label: string): void {
	if (_debugEnabled) {
		console.groupCollapsed(`[auto-card-link] ${label}`);
	}
}

export function logGroupEnd(): void {
	if (_debugEnabled) {
		console.groupEnd();
	}
}

export function formatDateFromTimestamp(timestamp: number): string {
	const date = new Date(timestamp * 1000);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function formatDateFromString(dateStr: string): string | undefined {
	if (!dateStr) return undefined;
	try {
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return undefined;
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	} catch {
		return undefined;
	}
}

export function formatNumberCN(num: number): string {
	if (num >= 100000000) {
		return (num / 100000000).toFixed(1) + "亿";
	} else if (num >= 10000) {
		return (num / 10000).toFixed(1) + "万";
	}
	return num.toString();
}

export function formatNumberEN(num: number): string {
	if (num >= 1000) {
		return (num / 1000).toFixed(1) + "k";
	}
	return num.toString();
}

export function sanitizeText(text: string): string {
	return text
		.replace(/\r\n|\n|\r/g, " ")
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.trim();
}

export function getNestedValue(data: unknown, path: string): string | null {
	if (!path || !data) return null;
	const parts = path.split(".");
	let value: unknown = data;
	for (const part of parts) {
		const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
		if (arrayMatch) {
			const key = arrayMatch[1];
			const index = parseInt(arrayMatch[2]);
			if (
				value &&
				typeof value === "object" &&
				key in value &&
				Array.isArray((value as Record<string, unknown[]>)[key])
			) {
				value = (value as Record<string, unknown[]>)[key][index];
			} else {
				return null;
			}
		} else {
			if (value && typeof value === "object" && part in value) {
				value = (value as Record<string, unknown>)[part];
			} else {
				return null;
			}
		}
	}
	if (value === null || value === undefined) return null;
	return String(value);
}

export function extractCleanImageUrl(url: string): string {
	if (!url) return "";
	let cleanUrl = url.trim().split(" ")[0];
	if (cleanUrl.startsWith("//")) {
		cleanUrl = "https:" + cleanUrl;
	}
	const atMatch = cleanUrl.match(/^(https?:\/\/[^\s]+?)@/);
	if (atMatch) {
		return atMatch[1];
	}
	const extMatch = cleanUrl.match(/^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))/i);
	if (extMatch) {
		return extMatch[1];
	}
	return cleanUrl.split("?")[0];
}

function isCoverUrl(url: string): boolean {
	return /\/new_dyn\//i.test(url);
}

function isAvatarUrl(url: string): boolean {
	if (/\/bfs\/face\//i.test(url) && !/\/noface/i.test(url)) return true;
	if (/\/profile_images\//i.test(url)) return true;
	return false;
}

export interface ImageExtractResult {
	cover?: string;
	avatar?: string;
	firstImg?: string;
}

export function extractImagesFromDoc(doc: Document): ImageExtractResult {
	const result: ImageExtractResult = {};
	const allImgs = doc.querySelectorAll("img[src]");
	const imgList = Array.from(allImgs);
	const imgSrcs: string[] = [];

	for (let i = 0; i < imgList.length; i++) {
		const img = imgList[i];
		const src = img.getAttribute("src") || "";
		if (!src || src.startsWith("data:")) continue;
		imgSrcs.push(src);

		if (isCoverUrl(src) && !result.cover) {
			result.cover = extractCleanImageUrl(src);
		}

		if (isAvatarUrl(src) && !result.avatar) {
			result.avatar = extractCleanImageUrl(src);
		}

		if (!result.firstImg) {
			result.firstImg = extractCleanImageUrl(src);
		}

		if (result.cover && result.avatar) break;
	}

	if (!result.avatar) {
		const appleTouchIcon = doc.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
		if (appleTouchIcon?.href) {
			const href = appleTouchIcon.href;
			if (isAvatarUrl(href)) {
				result.avatar = extractCleanImageUrl(href);
				imgSrcs.push(`[apple-touch-icon]${href}`);
			}
		}
	}

	if (!result.firstImg && imgSrcs.length === 0) {
		const linkIcon = doc.querySelector("link[rel='icon'], link[rel='shortcut icon']") as HTMLLinkElement | null;
		if (linkIcon?.href) {
			imgSrcs.push(`[link-icon]${linkIcon.href}`);
		}
	}

	log("extractImagesFromDoc: img src列表:", imgSrcs.length > 0 ? imgSrcs : "无", "结果:", JSON.stringify(result));

	return result;
}

export function resolveFirstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
	for (const v of values) {
		if (v !== undefined && v !== null) {
			if (typeof v === "string" && v === "") continue;
			return v;
		}
	}
	return undefined;
}
