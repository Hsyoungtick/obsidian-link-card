import { requestUrl } from "obsidian";
import { DEFAULT_USER_AGENT, log } from "./utils";

export interface TwitterParseResult {
	url: string;
	title: string;
	host: string;
	image?: string;
	avatar?: string;
	author?: string;
	views?: string;
	date?: string;
	[key: string]: unknown;
	indent: number;
}

export class TwitterParser {
	url: string;
	proxyUrl: string;

	constructor(url: string, proxyUrl: string) {
		this.url = url;
		this.proxyUrl = proxyUrl;
	}

	static isTwitterUrl(url: string): boolean {
		const twitterRegex = /^https?:\/\/(www\.)?(x|twitter)\.com\//i;
		return twitterRegex.test(url);
	}

	async parse(): Promise<TwitterParseResult | null> {
		try {
			const nitterUrl = new URL(this.proxyUrl);
			const targetUrl = new URL(this.url);
			const fetchUrl = `${nitterUrl.protocol}//${nitterUrl.host}${targetUrl.pathname}${targetUrl.search}`;

			const res = await requestUrl({
				url: fetchUrl,
				headers: {
					"User-Agent": DEFAULT_USER_AGENT,
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
				},
			});

			if (res.status !== 200) return null;

			const htmlDoc = new DOMParser().parseFromString(res.text, "text/html");

			const ogDescription = (htmlDoc.querySelector("meta[property='og:description']") as HTMLMetaElement | null)?.getAttribute("content") || undefined;
			const ogTitle = (htmlDoc.querySelector("meta[property='og:title']") as HTMLMetaElement | null)?.getAttribute("content") || undefined;
			const ogImage = (htmlDoc.querySelector("meta[property='og:image']") as HTMLMetaElement | null)?.getAttribute("content") || undefined;

			const title = ogDescription || undefined;
			const author = ogTitle || undefined;

			let image: string | undefined;
			if (ogImage) {
				image = this.resolveImageUrl(ogImage);
			}

			const views = this.extractViews(htmlDoc);
			const date = this.extractDate(htmlDoc);
			const avatar = this.extractAvatar(htmlDoc);

			log("Twitter parse: title=og:description(" + (ogDescription || "无") + "), author=og:title(" + (ogTitle || "无") + "), image=og:image(" + (ogImage || "无") + "), views=" + (views || "无") + ", date=" + (date || "无") + ", avatar=" + (avatar || "无"));

			if (!title) return null;

			const result: TwitterParseResult = {
				url: this.url,
				title,
				host: "x.com",
				image,
				avatar,
				author,
				views,
				date,
				indent: 0,
			};

			log("Twitter parse: 最终字段 title=", result.title, "author=", result.author || "无", "image=", result.image || "无", "avatar=", result.avatar || "无", "views=", result.views || "无", "date=", result.date || "无");
			return result;
		} catch (e) {
			log("Twitter parse error:", e);
			return null;
		}
	}

	private extractAvatar(doc: Document): string | undefined {
		const selectors = [
			"img.avatar.round",
			"img.avatar",
			"a.avatar img",
			".avatar img",
			".tweet-avatar img",
			"img[src*='avatar']",
			"img[src*='profile_images']",
		];
		for (const selector of selectors) {
			const img = doc.querySelector(selector) as HTMLImageElement | null;
			const src = img?.getAttribute("src");
			if (src) {
				const resolved = this.resolveImageUrl(src);
				log(`Twitter avatar: 选择器 ${selector} 匹配成功 → ${resolved}`);
				return resolved;
			}
		}
		const allImgs = doc.querySelectorAll("img[src]");
		for (const img of Array.from(allImgs)) {
			const src = img.getAttribute("src") || "";
			if (src.includes("profile_images") || src.includes("avatar")) {
				const resolved = this.resolveImageUrl(src);
				log(`Twitter avatar: 全局扫描匹配 → ${resolved}`);
				return resolved;
			}
		}
		log("Twitter avatar: 未找到头像");
		return undefined;
	}

	private extractViews(doc: Document): string | undefined {
		const tweetStats = doc.querySelectorAll("span.tweet-stat");
		for (const stat of Array.from(tweetStats)) {
			const iconViews = stat.querySelector("span.icon-views");
			if (iconViews) {
				const container = stat.querySelector("div.icon-container");
				if (container) {
					const text = container.textContent?.trim();
					if (text) return text;
				}
			}
		}
		return undefined;
	}

	private extractDate(doc: Document): string | undefined {
		const published = doc.querySelector("p.tweet-published");
		if (!published) return undefined;
		const text = published.textContent?.trim();
		if (!text) return undefined;
		return this.formatDateToUTC8(text);
	}

	private formatDateToUTC8(dateStr: string): string | undefined {
		const cleaned = dateStr.replace(/\s*·\s*/, " ");
		const date = new Date(cleaned);
		if (isNaN(date.getTime())) return undefined;
		const utc8 = new Date(date.getTime() + 8 * 60 * 60 * 1000);
		const year = utc8.getUTCFullYear();
		const month = String(utc8.getUTCMonth() + 1).padStart(2, "0");
		const day = String(utc8.getUTCDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	private resolveImageUrl(src: string): string {
		if (src.startsWith("//")) {
			return "https:" + src;
		}
		if (src.startsWith("/")) {
			try {
				const proxyBase = new URL(this.proxyUrl);
				return `${proxyBase.protocol}//${proxyBase.host}${src}`;
			} catch {
				return src;
			}
		}
		return src;
	}
}
