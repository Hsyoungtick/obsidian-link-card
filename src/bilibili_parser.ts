import { requestUrl } from "obsidian";
import { extractCleanImageUrl, extractImagesFromDoc, formatDateFromTimestamp, formatNumberCN, log, sanitizeText, DEFAULT_USER_AGENT } from "./utils";

export interface BilibiliParseResult {
	url: string;
	title: string;
	host: string;
	image?: string;
	avatar?: string;
	author?: string;
	duration?: string;
	views?: string;
	date?: string;
	[key: string]: unknown;
	indent: number;
}

export class BilibiliParser {
	url: string;

	constructor(url: string) {
		this.url = url;
	}

	static isBilibiliUrl(url: string): boolean {
		try {
			const hostname = new URL(url).hostname;
			return hostname === "bilibili.com" || hostname === "www.bilibili.com" || hostname.endsWith(".bilibili.com");
		} catch {
			return false;
		}
	}

	static extractVideoId(
		url: string
	): { type: string; id: string } | null {
		const bvMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
		if (bvMatch) return { type: "bvid", id: bvMatch[1] };
		const avMatch = url.match(/\/video\/av(\d+)/i);
		if (avMatch) return { type: "avid", id: avMatch[1] };
		return null;
	}

	async parse(): Promise<BilibiliParseResult | null> {
		const videoId = BilibiliParser.extractVideoId(this.url);
		if (videoId) {
			return await this.parseVideo(videoId);
		}
		return await this.parseOpusFromHTML();
	}

	async parseVideo(videoId: { type: string; id: string }): Promise<BilibiliParseResult | null> {
		try {
			const apiUrl =
				videoId.type === "bvid"
					? `https://api.bilibili.com/x/web-interface/view?bvid=${videoId.id}`
					: `https://api.bilibili.com/x/web-interface/view?aid=${videoId.id}`;
			const res = await requestUrl({
				url: apiUrl,
				headers: {
					"User-Agent": DEFAULT_USER_AGENT,
					Referer: "https://www.bilibili.com/",
					Origin: "https://www.bilibili.com",
					Cookie: `buvid3=${this.generateBuvid3()}`,
				},
			});
			if (res.status !== 200 || !res.json || res.json.code !== 0) {
				log("Bilibili API 返回错误: status=", res.status, "code=", res.json?.code);
				return null;
			}
			const data = res.json.data;
			log("Bilibili API 原始数据: pubdate=", data.pubdate, "ctime=", data.ctime, "duration=", data.duration, "view=", data.stat?.view);

			const title = sanitizeText(data.title);
			const coverUrl = extractCleanImageUrl(data.pic);
			const avatarUrl = data.owner?.face ? extractCleanImageUrl(data.owner.face) : undefined;

			const imageCandidates = [
				{ source: "cover(pic)", value: coverUrl },
				{ source: "avatar(owner.face)", value: avatarUrl },
			];
			const selectedImage = coverUrl || avatarUrl || undefined;
			const selectedSource = coverUrl ? "cover(pic)" : (avatarUrl ? "avatar(owner.face)" : "无");
			log("Bilibili parse: 图片回退链:", imageCandidates.map(c => `${c.source}(${c.value || "无"})`).join(" -> "), `→ 最终选择${selectedSource}作为image`);

			const pubdate = data.pubdate ? formatDateFromTimestamp(data.pubdate) : undefined;
			const updated_at = data.ctime ? formatDateFromTimestamp(data.ctime) : undefined;
			const date = pubdate || updated_at;
			log("Bilibili parse: 日期回退链: pubdate(" + (data.pubdate || "无") + ") -> ctime(" + (data.ctime || "无") + ") → 最终选择date=" + (date || "无"));

			const result: BilibiliParseResult = {
				url: this.url,
				title,
				host: "bilibili.com",
				image: selectedImage,
				avatar: avatarUrl || undefined,
				author: data.owner?.name,
				duration: this.formatDuration(data.duration),
				views: formatNumberCN(data.stat.view),
				date: date,
				indent: 0,
			};
			log("Bilibili parse: 最终字段 title=", result.title, "author=", result.author || "无", "views=", result.views || "无", "date=", result.date || "无", "duration=", result.duration || "无");
			return result;
		} catch (e) {
			log("Bilibili API error:", e);
			return null;
		}
	}

	async parseOpus(_opusId: string): Promise<BilibiliParseResult | null> {
		return await this.parseOpusFromHTML();
	}

	async parseOpusFromHTML(): Promise<BilibiliParseResult | null> {
		try {
			const buvid3 = this.generateBuvid3();
			const res = await requestUrl({
				url: this.url,
				headers: {
					"User-Agent": DEFAULT_USER_AGENT,
					Referer: "https://www.bilibili.com/",
					Origin: "https://www.bilibili.com",
					Cookie: `buvid3=${buvid3}`,
				},
			});
			if (res.status !== 200) return null;
			const html = res.text;

			let title = "";
			let authorName = "";
			let pubTs = 0;
			let ogImage = "";
			let avatar = "";

			const initMatch = html.match(
				/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/
			);
			if (initMatch) {
				try {
					const state = JSON.parse(initMatch[1]);
					const modules = state.detail?.modules || {};
					log("Bilibili opus __INITIAL_STATE__ 顶层keys:", Object.keys(state), "detail keys:", state.detail ? Object.keys(state.detail) : "无");
					for (const [, mod] of Object.entries(modules) as [string, any][]) {
						if (mod?.module_type === "MODULE_TYPE_TITLE") {
							title = (mod.module_title?.text || "")
								.replace(" - 哔哩哔哩", "")
								.trim();
						}
						if (mod?.module_type === "MODULE_TYPE_AUTHOR") {
							authorName = mod.module_author?.name || "";
							pubTs = mod.module_author?.pub_ts || 0;
							const face = mod.module_author?.face || mod.module_author?.avatar_url || "";
							if (face) {
								avatar = extractCleanImageUrl(face);
							}
							log("Bilibili opus MODULE_TYPE_AUTHOR: name=", authorName, "pub_ts=", pubTs, "face=", face ? "有" : "无");
						}
						if (
							mod?.module_type === "MODULE_TYPE_SHARE" ||
							mod?.module_type === "MODULE_TYPE_TITLE_EXTRA"
						) {
							const sharePic = mod.share_info?.pic;
							if (sharePic && !sharePic.includes("app_logo") && !ogImage) {
								ogImage = sharePic;
							}
						}
					}
				} catch (e) {
					log("Failed to parse __INITIAL_STATE__:", e);
				}
			}

			if (!avatar || !authorName) {
				const appleTouchIcon = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
				if (appleTouchIcon) {
					const iconUrl = appleTouchIcon[1];
					if (/\/bfs\/face\//i.test(iconUrl) && !avatar) {
						avatar = extractCleanImageUrl(iconUrl);
						log("Bilibili opus: 从apple-touch-icon提取avatar:", avatar);
					}
				}
			}

			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");

			if (!title) {
				const titleEl = doc.querySelector("title");
				title = titleEl
					? titleEl.textContent?.replace(" - 哔哩哔哩", "").trim() || ""
					: "";
			}

			if (!ogImage) {
				const ogImageEl = doc.querySelector(
					"meta[property='og:image']"
				) as HTMLMetaElement | null;
				const ogImageContent = ogImageEl ? ogImageEl.getAttribute("content") || "" : "";
				if (ogImageContent) {
					ogImage = ogImageContent;
				}
			}

			const extractedImages = extractImagesFromDoc(doc);

			if (extractedImages.avatar && !avatar) {
				avatar = extractedImages.avatar;
			}

			title = sanitizeText(title);

			const imageCandidates = [
				{ source: "og:image", value: ogImage },
				{ source: "cover", value: extractedImages.cover },
				{ source: "avatar", value: avatar || extractedImages.avatar },
				{ source: "firstImg", value: extractedImages.firstImg },
			];
			const selectedImage = extractCleanImageUrl(
				ogImage || extractedImages.cover || avatar || extractedImages.avatar || extractedImages.firstImg || ""
			) || undefined;
			const selectedSource = ogImage ? "og:image" : (extractedImages.cover ? "cover" : (avatar ? "avatar" : (extractedImages.firstImg ? "firstImg" : "无")));
			log("Bilibili opus: 图片回退链:", imageCandidates.map(c => `${c.source}(${c.value || "无"})`).join(" -> "), `→ 最终选择${selectedSource}作为image`);

			const pubdate = pubTs ? formatDateFromTimestamp(pubTs) : undefined;
			log("Bilibili opus: 日期回退链: pub_ts(" + (pubTs || "无") + ") → 最终选择date=" + (pubdate || "无"));

			const result: BilibiliParseResult = {
				url: this.url,
				title,
				host: "bilibili.com",
				image: selectedImage,
				avatar: avatar || extractedImages.avatar || undefined,
				author: authorName || undefined,
				date: pubdate,
				indent: 0,
			};
			log("Bilibili opus: 最终字段 title=", result.title, "author=", result.author || "无", "date=", result.date || "无");
			return result;
		} catch (e) {
			log("Bilibili opus HTML parse error:", e);
			return null;
		}
	}

	formatDuration(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
		}
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	generateBuvid3(): string {
		const chars = "0123456789ABCDEF";
		const mac = Array.from({ length: 12 }, () =>
			chars[Math.floor(Math.random() * chars.length)]
		).join("");
		const formattedMac = mac.match(/.{2}/g)?.join(":") || mac;
		const md5Input = formattedMac;
		let hash = 0;
		for (let i = 0; i < md5Input.length; i++) {
			const char = md5Input.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash |= 0;
		}
		const suffix = Math.abs(hash).toString(16).padStart(8, "0").toUpperCase();
		return `${mac}${suffix}`;
	}
}
