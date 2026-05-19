import { extractCleanImageUrl, extractImagesFromDoc, formatDateFromString, log, resolveFirstDefined, sanitizeText } from "./utils";

export interface LinkMetadataParseResult {
	url: string;
	title?: string;
	description?: string;
	host: string;
	favicon?: string;
	image?: string;
	avatar?: string;
	author?: string;
	date?: string;
	stars?: string;
	views?: string;
	duration?: string;
	[key: string]: unknown;
	indent: number;
}

export class LinkMetadataParser {
	url: string;
	proxyBase: string;
	htmlDoc: Document;

	constructor(url: string, htmlText: string, proxyBase?: string) {
		this.url = url;
		this.proxyBase = proxyBase || "";
		const parser = new DOMParser();
		this.htmlDoc = parser.parseFromString(htmlText, "text/html");
	}

	async parse(specialistData?: Record<string, unknown>): Promise<LinkMetadataParseResult | null> {
		const { hostname } = new URL(this.url);
		let data: LinkMetadataParseResult = {
			url: this.url,
			host: hostname,
			indent: 0,
		};

		const allFields = await this.extractAllHtmlFields(
			this.htmlDoc,
			this.proxyBase
		);
		data = { ...data, ...allFields };

		const ogTitle = data["og:title"] as string | undefined;
		const twitterTitle = data["twitter:title"] as string | undefined;
		const htmlTitle = this.getTitle();
		const specialistTitle = specialistData?.title as string | undefined;
		if (!data.title) {
			data.title = htmlTitle;
		}
		const titleChain = [
			{ source: "专用解析器title", value: specialistTitle },
			{ source: "og:title", value: ogTitle },
			{ source: "twitter:title", value: twitterTitle },
			{ source: "title", value: htmlTitle },
		];
		const selectedTitle = resolveFirstDefined(specialistTitle, ogTitle, twitterTitle, htmlTitle);
		if (selectedTitle) data.title = selectedTitle;
		log("标题回退链:", titleChain.map(c => `${c.source}(${c.value || "无"})`).join(" -> "), `→ ${selectedTitle || "无"}`);

		const ogDesc = data["og:description"] as string | undefined;
		const twitterDesc = data["twitter:description"] as string | undefined;
		const htmlDesc = this.getDescription();
		const specialistDesc = specialistData?.description as string | undefined;
		if (!data.description) {
			data.description = htmlDesc;
		}
		const descChain = [
			{ source: "专用解析器description", value: specialistDesc },
			{ source: "og:description", value: ogDesc },
			{ source: "twitter:description", value: twitterDesc },
			{ source: "description", value: htmlDesc },
		];
		const selectedDesc = resolveFirstDefined(specialistDesc, ogDesc, twitterDesc, htmlDesc);
		if (selectedDesc) data.description = selectedDesc;
		log("简介回退链:", descChain.map(c => `${c.source}(${c.value || "无"})`).join(" -> "), `→ ${selectedDesc || "无"}`);

		const specialistImage = specialistData?.image as string | undefined;
		const ogImage = (
			this.htmlDoc.querySelector(
				"meta[property='og:image']"
			) as HTMLMetaElement | null
		)?.getAttribute("content");
		const twitterImage = (
			this.htmlDoc.querySelector(
				"meta[name='twitter:image'], meta[property='twitter:image']"
			) as HTMLMetaElement | null
		)?.getAttribute("content");
		const extractedImages = extractImagesFromDoc(this.htmlDoc);
		const favicon = await this.getFavicon();

		const imageCandidates = [
			{ source: "专用解析器image", value: specialistImage },
			{ source: "og:image", value: ogImage },
			{ source: "twitter:image", value: twitterImage },
			{ source: "cover", value: extractedImages.cover },
			{ source: "avatar", value: extractedImages.avatar },
			{ source: "firstImg", value: extractedImages.firstImg },
			{ source: "favicon", value: favicon },
		];

		let selectedImage = "";
		let selectedSource = "";
		for (const candidate of imageCandidates) {
			if (candidate.value) {
				selectedImage = extractCleanImageUrl(candidate.value);
				selectedSource = candidate.source;
				break;
			}
		}

		if (!selectedImage && data.og_image) {
			selectedImage = extractCleanImageUrl(data.og_image as string);
			selectedSource = "og_image";
		}

		log("图片回退链:", imageCandidates.map(c => `${c.source}(${c.value || "无"})`).join(" -> "));

		if (selectedImage) {
			data.image = selectedImage;
			log(`图片选择: ${selectedSource} → ${selectedImage}`);
		} else {
			log("图片选择: 无可用图片");
		}

		if (favicon) data.favicon = favicon;

		const specialistAvatar = specialistData?.avatar as string | undefined;
		if (specialistAvatar) {
			data.avatar = specialistAvatar;
		} else if (extractedImages.avatar) {
			data.avatar = extractedImages.avatar;
		} else if (favicon) {
			data.avatar = favicon;
		}

		const specialistDate = specialistData?.date as string | undefined;
		const specialistPubdate = specialistData?.pubdate as string | undefined;
		const dateResult = this.extractDates(this.htmlDoc, data);

		const dateChain = [
			{ source: "专用解析器date", value: specialistDate },
			{ source: "专用解析器pubdate", value: specialistPubdate },
			...dateResult.candidates,
		];
		const finalDate = resolveFirstDefined(specialistDate, specialistPubdate, dateResult.pubdate);
		if (finalDate) data.date = finalDate;

		log("日期回退链:", dateChain.map(c => `${c.source}(${c.value || "无"})`).join(" -> "), `→ ${finalDate || "无"}`);

		const specialistAuthor = specialistData?.author as string | undefined;
		const metaAuthor = (this.htmlDoc.querySelector("meta[name='author']") as HTMLMetaElement | null)?.getAttribute("content") || undefined;
		const siteNameAuthor = (this.htmlDoc.querySelector("meta[property='og:site_name']") as HTMLMetaElement | null)?.getAttribute("content") || undefined;
		const authorChain = [
			{ source: "专用解析器author", value: specialistAuthor },
			{ source: "meta[author]", value: metaAuthor },
			{ source: "og:site_name", value: siteNameAuthor },
		];
		const finalAuthor = resolveFirstDefined(specialistAuthor, metaAuthor, siteNameAuthor);
		if (finalAuthor) data.author = finalAuthor;
		log("作者回退链:", authorChain.map(c => `${c.source}(${c.value || "无"})`).join(" -> "), `→ ${finalAuthor || "无"}`);

		if (specialistData?.stars) data.stars = specialistData.stars as string;
		if (specialistData?.views) data.views = specialistData.views as string;
		if (specialistData?.duration) data.duration = specialistData.duration as string;
		if (specialistData?.repo) data.repo = specialistData.repo as string;

		if (data.title) {
			data.title = sanitizeText(data.title);
		}
		if (data.description) {
			data.description = sanitizeText(data.description);
		}

		return data.title ? data : null;
	}

	async extractAllHtmlFields(
		htmlDoc: Document,
		proxyBase: string
	): Promise<Record<string, string>> {
		const result: Record<string, string> = {};
		const metaTags = htmlDoc.querySelectorAll(
			"meta[property], meta[name]"
		);
		for (const meta of Array.from(metaTags)) {
			const property =
				meta.getAttribute("property") || meta.getAttribute("name");
			const content = meta.getAttribute("content");
			if (property && content) {
				if (
					(property.includes("image") || property.includes("video")) &&
					proxyBase
				) {
					if (content.startsWith("http")) {
						try {
							const contentUrl = new URL(content);
							const proxyUrl = new URL(proxyBase);
							result[property] = `${proxyUrl.protocol}//${proxyUrl.host}${contentUrl.pathname}${contentUrl.search}`;
						} catch (e) {
							result[property] = content;
						}
					} else if (content.startsWith("/")) {
						try {
							const proxyUrl = new URL(proxyBase);
							result[property] = `${proxyUrl.protocol}//${proxyUrl.host}${content}`;
						} catch (e) {
							result[property] = content;
						}
					} else {
						result[property] = content;
					}
				} else {
					result[property] = content;
				}
			}
		}

		const title = htmlDoc.querySelector("title");
		if (title && title.textContent) {
			result["title"] = title.textContent;
		}

		const videoPosters = htmlDoc.querySelectorAll("video[poster]");
		for (let i = 0; i < videoPosters.length; i++) {
			const poster = videoPosters[i].getAttribute("poster");
			if (poster) {
				result[`video_poster_${i}`] = poster;
			}
		}

		const images = htmlDoc.querySelectorAll("img[src]");
		for (let i = 0; i < Math.min(images.length, 5); i++) {
			const src = images[i].getAttribute("src");
			if (src && !src.startsWith("data:")) {
				result[`img_src_${i}`] = src;
			}
		}

		const links = htmlDoc.querySelectorAll(
			"link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
		);
		for (const link of Array.from(links)) {
			const rel = link.getAttribute("rel");
			const href = link.getAttribute("href");
			if (rel && href) {
				result[`link_${rel}`] = href;
			}
		}

		return result;
	}

	extractDates(htmlDoc: Document, data: Record<string, unknown>): { pubdate?: string; updated_at?: string; candidates: { source: string; value?: string }[] } {
		const candidates: { source: string; value?: string }[] = [];

		const pubdateCandidates = [
			{ source: "article:published_time", selector: "meta[property='article:published_time']" },
			{ source: "og:pubdate", selector: "meta[property='og:pubdate']" },
			{ source: "pubdate", selector: "meta[name='pubdate']" },
			{ source: "datePublished", selector: "meta[itemprop='datePublished']" },
			{ source: "date", selector: "meta[name='date']" },
		];

		const updatedCandidates = [
			{ source: "article:modified_time", selector: "meta[property='article:modified_time']" },
			{ source: "og:updated_time", selector: "meta[property='og:updated_time']" },
			{ source: "dateModified", selector: "meta[itemprop='dateModified']" },
			{ source: "lastmod", selector: "meta[name='lastmod']" },
		];

		let pubdate: string | undefined;
		for (const c of pubdateCandidates) {
			const el = htmlDoc.querySelector(c.selector) as HTMLMetaElement | null;
			const value = el?.getAttribute("content") || undefined;
			candidates.push({ source: c.source, value });
			if (!pubdate && value) {
				pubdate = formatDateFromString(value);
			}
		}

		if (!pubdate && data.pubdate) {
			candidates.push({ source: "data.pubdate", value: String(data.pubdate) });
			pubdate = formatDateFromString(String(data.pubdate));
		}

		let updated_at: string | undefined;
		for (const c of updatedCandidates) {
			const el = htmlDoc.querySelector(c.selector) as HTMLMetaElement | null;
			const value = el?.getAttribute("content") || undefined;
			candidates.push({ source: c.source, value });
			if (!updated_at && value) {
				updated_at = formatDateFromString(value);
			}
		}

		if (!updated_at && data.updated_at) {
			candidates.push({ source: "data.updated_at", value: String(data.updated_at) });
			updated_at = formatDateFromString(String(data.updated_at));
		}

		return { pubdate, updated_at, candidates };
	}

	getTitle(): string | undefined {
		const ogTitle = this.htmlDoc.querySelector(
			"meta[property='og:title']"
		) as HTMLMetaElement | null;
		if (ogTitle) return ogTitle.getAttribute("content") || undefined;

		const title = this.htmlDoc.querySelector("title");
		if (title) return title.textContent || undefined;
		return undefined;
	}

	getDescription(): string | undefined {
		const ogDescription = this.htmlDoc.querySelector(
			"meta[property='og:description']"
		) as HTMLMetaElement | null;
		if (ogDescription)
			return ogDescription.getAttribute("content") || undefined;

		const metaDescription = this.htmlDoc.querySelector(
			"meta[name='description']"
		) as HTMLMetaElement | null;
		if (metaDescription)
			return metaDescription.getAttribute("content") || undefined;
		return undefined;
	}

	async getFavicon(): Promise<string> {
		const favicon = (
			this.htmlDoc.querySelector(
				"link[rel='icon']"
			) as HTMLLinkElement | null
		)?.getAttribute("href");
		if (favicon) return await this.fixImageUrl(favicon);

		const shortcutIcon = (
			this.htmlDoc.querySelector(
				"link[rel='shortcut icon']"
			) as HTMLLinkElement | null
		)?.getAttribute("href");
		if (shortcutIcon) return await this.fixImageUrl(shortcutIcon);

		const appleIcon = (
			this.htmlDoc.querySelector(
				"link[rel='apple-touch-icon']"
			) as HTMLLinkElement | null
		)?.getAttribute("href");
		if (appleIcon) return await this.fixImageUrl(appleIcon);

		const { hostname } = new URL(this.url);
		return `https://${hostname}/favicon.ico`;
	}

	async getImage(): Promise<string | undefined> {
		const ogImage = (
			this.htmlDoc.querySelector(
				"meta[property='og:image']"
			) as HTMLMetaElement | null
		)?.getAttribute("content");
		if (ogImage) return await this.fixImageUrl(ogImage);

		const videoPoster = (
			this.htmlDoc.querySelector(
				"video[poster]"
			) as HTMLVideoElement | null
		)?.getAttribute("poster");
		if (videoPoster) return await this.fixImageUrl(videoPoster);
		return undefined;
	}

	async fixImageUrl(url: string): Promise<string> {
		if (url === undefined) return "";
		const { hostname } = new URL(this.url);
		let image = url;

		if (url && url.startsWith("//")) {
			const testUrlHttps = `https:${url}`;
			const testUrlHttp = `http:${url}`;
			if (await checkUrlAccessibility(testUrlHttps)) {
				image = testUrlHttps;
			} else if (await checkUrlAccessibility(testUrlHttp)) {
				image = testUrlHttp;
			}
		} else if (url && url.startsWith("/") && this.proxyBase) {
			const base = this.proxyBase.replace(/\/+$/, "");
			image = `${base}${url}`;
		} else if (url && url.startsWith("/") && hostname) {
			const testUrlHttps = `https://${hostname}${url}`;
			const testUrlHttp = `http://${hostname}${url}`;
			const resUrlHttps = await checkUrlAccessibility(testUrlHttps);
			const resUrlHttp = await checkUrlAccessibility(testUrlHttp);
			if (resUrlHttps) {
				image = testUrlHttps;
			} else if (resUrlHttp) {
				image = testUrlHttp;
			}
		} else if (url && url.startsWith("http") && this.proxyBase) {
			try {
				const imageUrl = new URL(url);
				const proxyUrl = new URL(this.proxyBase);
				if (imageUrl.host !== proxyUrl.host) {
					image = `${proxyUrl.protocol}//${proxyUrl.host}${imageUrl.pathname}${imageUrl.search}`;
				}
			} catch (e) {
				// 忽略 URL 解析错误
			}
		}
		return extractCleanImageUrl(image);
	}
}

function checkUrlAccessibility(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(true);
		img.onerror = () => resolve(false);
		img.src = url;
	});
}
