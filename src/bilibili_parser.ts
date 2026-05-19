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
		const md5Hash = md5(formattedMac);
		const suffix = md5Hash.substring(0, 8).toUpperCase();
		return `${mac}${suffix}`;
	}
}

function md5(string: string): string {
	function md5cycle(x: number[], k: number[]) {
		let a = x[0], b = x[1], c = x[2], d = x[3];
		a = ff(a, b, c, d, k[0], 7, -680876936);
		d = ff(d, a, b, c, k[1], 12, -389564586);
		c = ff(c, d, a, b, k[2], 17, 606105819);
		b = ff(b, c, d, a, k[3], 22, -1044525330);
		a = ff(a, b, c, d, k[4], 7, -176418897);
		d = ff(d, a, b, c, k[5], 12, 1200080426);
		c = ff(c, d, a, b, k[6], 17, -1473231341);
		b = ff(b, c, d, a, k[7], 22, -45705983);
		a = ff(a, b, c, d, k[8], 7, 1770035416);
		d = ff(d, a, b, c, k[9], 12, -1958414417);
		c = ff(c, d, a, b, k[10], 17, -42063);
		b = ff(b, c, d, a, k[11], 22, -1990404162);
		a = ff(a, b, c, d, k[12], 7, 1804603682);
		d = ff(d, a, b, c, k[13], 12, -40341101);
		c = ff(c, d, a, b, k[14], 17, -1502002290);
		b = ff(b, c, d, a, k[15], 22, 1236535329);
		a = gg(a, b, c, d, k[1], 5, -165796510);
		d = gg(d, a, b, c, k[6], 9, -1069501632);
		c = gg(c, d, a, b, k[11], 14, 643717713);
		b = gg(b, c, d, a, k[0], 20, -373897302);
		a = gg(a, b, c, d, k[5], 5, -701558691);
		d = gg(d, a, b, c, k[10], 9, 38016083);
		c = gg(c, d, a, b, k[15], 14, -660478335);
		b = gg(b, c, d, a, k[4], 20, -405537848);
		a = gg(a, b, c, d, k[9], 5, 568446438);
		d = gg(d, a, b, c, k[14], 9, -1019803690);
		c = gg(c, d, a, b, k[3], 14, -187363961);
		b = gg(b, c, d, a, k[8], 20, 1163531501);
		a = gg(a, b, c, d, k[13], 5, -1444681467);
		d = gg(d, a, b, c, k[2], 9, -51403784);
		c = gg(c, d, a, b, k[7], 14, 1735328473);
		b = gg(b, c, d, a, k[12], 20, -1926607734);
		a = hh(a, b, c, d, k[5], 4, -378558);
		d = hh(d, a, b, c, k[8], 11, -2022574463);
		c = hh(c, d, a, b, k[11], 16, 1839030562);
		b = hh(b, c, d, a, k[14], 23, -35309556);
		a = hh(a, b, c, d, k[1], 4, -1530992060);
		d = hh(d, a, b, c, k[4], 11, 1272893353);
		c = hh(c, d, a, b, k[7], 16, -155497632);
		b = hh(b, c, d, a, k[10], 23, -1094730640);
		a = hh(a, b, c, d, k[13], 4, 681279174);
		d = hh(d, a, b, c, k[0], 11, -358537222);
		c = hh(c, d, a, b, k[3], 16, -722521979);
		b = hh(b, c, d, a, k[6], 23, 76029189);
		a = hh(a, b, c, d, k[9], 4, -640364487);
		d = hh(d, a, b, c, k[12], 11, -421815835);
		c = hh(c, d, a, b, k[15], 16, 530742520);
		b = hh(b, c, d, a, k[2], 23, -995338651);
		a = ii(a, b, c, d, k[0], 6, -198630844);
		d = ii(d, a, b, c, k[7], 10, 1126891415);
		c = ii(c, d, a, b, k[14], 15, -1416354905);
		b = ii(b, c, d, a, k[5], 21, -57434055);
		a = ii(a, b, c, d, k[12], 6, 1700485571);
		d = ii(d, a, b, c, k[3], 10, -1894986606);
		c = ii(c, d, a, b, k[10], 15, -1051523);
		b = ii(b, c, d, a, k[1], 21, -2054922799);
		a = ii(a, b, c, d, k[8], 6, 1873313359);
		d = ii(d, a, b, c, k[15], 10, -30611744);
		c = ii(c, d, a, b, k[6], 15, -1560198380);
		b = ii(b, c, d, a, k[13], 21, 1309151649);
		a = ii(a, b, c, d, k[4], 6, -145523070);
		d = ii(d, a, b, c, k[11], 10, -1120210379);
		c = ii(c, d, a, b, k[2], 15, 718787259);
		b = ii(b, c, d, a, k[9], 21, -343485551);
		x[0] = add32(a, x[0]);
		x[1] = add32(b, x[1]);
		x[2] = add32(c, x[2]);
		x[3] = add32(d, x[3]);
	}
	function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
		a = add32(add32(a, q), add32(x, t));
		return add32((a << s) | (a >>> (32 - s)), b);
	}
	function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
		return cmn((b & c) | (~b & d), a, b, x, s, t);
	}
	function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
		return cmn((b & d) | (c & ~d), a, b, x, s, t);
	}
	function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
		return cmn(b ^ c ^ d, a, b, x, s, t);
	}
	function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
		return cmn(c ^ (b | ~d), a, b, x, s, t);
	}
	function add32(a: number, b: number) {
		return (a + b) & 0xffffffff;
	}
	function md5blk(s: string) {
		const md5blks: number[] = [];
		for (let i = 0; i < 64; i += 4) {
			md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
		}
		return md5blks;
	}
	const hex_chr = "0123456789abcdef".split("");
	function rhex(n: number) {
		let s = "";
		for (let j = 0; j < 4; j++) {
			s += hex_chr[(n >> (j * 8 + 4)) & 0x0f] + hex_chr[(n >> (j * 8)) & 0x0f];
		}
		return s;
	}
	function hex(x: number[]) {
		return x.map(rhex).join("");
	}
	let n = string.length;
	let state = [1732584193, -271733879, -1732584194, 271733878];
	let i: number;
	for (i = 64; i <= n; i += 64) {
		md5cycle(state, md5blk(string.substring(i - 64, i)));
	}
	string = string.substring(i - 64);
	const tail = new Array(16).fill(0);
	for (i = 0; i < string.length; i++) {
		tail[i >> 2] |= string.charCodeAt(i) << (i % 4 << 3);
	}
	tail[i >> 2] |= 0x80 << (i % 4 << 3);
	if (i > 55) {
		md5cycle(state, tail);
		for (i = 0; i < 16; i++) tail[i] = 0;
	}
	tail[14] = n * 8;
	md5cycle(state, tail);
	return hex(state);
}
