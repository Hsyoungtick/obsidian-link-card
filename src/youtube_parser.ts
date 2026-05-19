import { requestUrl } from "obsidian";
import { DEFAULT_USER_AGENT, formatNumberCN, formatDateFromString, log } from "./utils";

export interface YouTubeParseResult {
	url: string;
	title: string;
	host: string;
	image?: string;
	avatar?: string;
	author?: string;
	views?: string;
	duration?: string;
	date?: string;
	[key: string]: unknown;
	indent: number;
}

export class YouTubeParser {
	url: string;

	constructor(url: string) {
		this.url = url;
	}

	static isYouTubeUrl(url: string): boolean {
		try {
			const hostname = new URL(url).hostname;
			return hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be";
		} catch {
			return false;
		}
	}

	static extractVideoId(url: string): string | null {
		try {
			const parsed = new URL(url);
			if (parsed.hostname === "youtu.be") {
				return parsed.pathname.slice(1) || null;
			}
			return parsed.searchParams.get("v");
		} catch {
			return null;
		}
	}

	async parse(): Promise<YouTubeParseResult | null> {
		const videoId = YouTubeParser.extractVideoId(this.url);
		if (!videoId) {
			log("YouTube parse: 无法提取videoId");
			return null;
		}

		try {
			const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

			let title: string | undefined;
			let author: string | undefined;
			let image: string | undefined;
			let avatar: string | undefined;
			let views: string | undefined;
			let date: string | undefined;
			let oembedThumbnail: string | undefined;

			try {
				const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
				const res = await requestUrl({
					url: oembedUrl,
					headers: {
						"User-Agent": DEFAULT_USER_AGENT,
						Accept: "application/json",
					},
				});

				if (res.status === 200) {
					const data = res.json;
					title = data.title || undefined;
					author = data.author_name || undefined;
					oembedThumbnail = data.thumbnail_url || undefined;
				}
			} catch (e) {
				log("YouTube oEmbed: 请求失败", e);
			}

			try {
				const htmlRes = await requestUrl({
					url: cleanUrl,
					headers: {
						"User-Agent": DEFAULT_USER_AGENT,
						Accept: "text/html",
						"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
					},
				});

				if (htmlRes.status === 200) {
					const htmlText = htmlRes.text;

					const ogImageMatch = htmlText.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
					if (ogImageMatch) {
						image = ogImageMatch[1];
					}

					const playerMatch = htmlText.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/);
					if (playerMatch) {
						try {
							const playerData = JSON.parse(playerMatch[1]);
							const viewCount = playerData?.videoDetails?.viewCount;
							if (viewCount) {
								views = formatNumberCN(parseInt(viewCount, 10));
							}
							const publishDate = playerData?.microformat?.playerMicroformatRenderer?.publishDate;
							if (publishDate) {
								date = formatDateFromString(publishDate);
							}
							if (!title) {
								title = playerData?.videoDetails?.title || undefined;
							}
							if (!author) {
								author = playerData?.videoDetails?.author || undefined;
							}
						} catch (e) {
							log("YouTube HTML: 解析ytInitialPlayerResponse失败", e);
						}
					}

					const dataMatch = htmlText.match(/ytInitialData\s*=\s*(\{.+?\})\s*;/);
					if (dataMatch) {
						try {
							const initData = JSON.parse(dataMatch[1]);
							const avatarUrl = this.extractAvatarFromInitialData(initData);
							if (avatarUrl) {
								avatar = avatarUrl;
							}
						} catch (e) {
							log("YouTube HTML: 解析ytInitialData失败", e);
						}
					}

					if (!views) {
						const viewsMatch = htmlText.match(/"viewCount"\s*:\s*"(\d+)"/);
						if (viewsMatch) {
							views = formatNumberCN(parseInt(viewsMatch[1], 10));
						}
					}

					if (!date) {
						const dateMatch = htmlText.match(/"publishDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
						if (dateMatch) {
							date = dateMatch[1];
						}
					}
				}
			} catch (e) {
				log("YouTube HTML: 请求页面失败", e);
			}

			if (!image && oembedThumbnail) {
				image = oembedThumbnail;
			}
			if (!image) {
				image = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
			}

			if (!avatar) {
				const channelMatch = this.url.match(/\/(channel\/[\w-]+)/);
				if (channelMatch) {
					avatar = `https://yt3.ggpht.com/ytc/${channelMatch[1]}=s48-c-k-c0x00ffffff-no-rj`;
				}
			}

			log("YouTube parse: title=", title || "无", "author=", author || "无", "image=", image || "无", "avatar=", avatar || "无", "views=", views || "无");

			const result: YouTubeParseResult = {
				url: this.url,
				title: title || "YouTube Video",
				host: "youtube.com",
				image,
				avatar,
				author,
				views,
				date,
				indent: 0,
			};

			return result;
		} catch (e) {
			log("YouTube parse error:", e);
			return null;
		}
	}

	private extractAvatarFromInitialData(initData: any): string | undefined {
		try {
			const contents = initData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
			if (contents) {
				for (const content of contents) {
					const owner = content?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
					if (owner?.thumbnail?.thumbnails?.length > 0) {
						const thumbnails = owner.thumbnail.thumbnails;
						const thumb = thumbnails[thumbnails.length - 1];
						if (thumb?.url) {
							return thumb.url;
						}
					}
				}
			}
		} catch {
			// 忽略解析错误
		}
		return undefined;
	}
}
