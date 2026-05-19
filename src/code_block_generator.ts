import { Editor, Notice, requestUrl } from "obsidian";
import { EditorExtensions } from "./editor_enhancements";
import { BilibiliParser } from "./bilibili_parser";
import { GitHubParser } from "./github_parser";
import { TwitterParser } from "./twitter_parser";
import { YouTubeParser } from "./youtube_parser";
import { LinkMetadataParser } from "./link_metadata_parser";
import { MetadataCache } from "./cache";
import { ObsidianAutoCardLinkSettings } from "./settings";
import { t } from "./i18n";
import { DEFAULT_USER_AGENT, log, logGroupStart, logGroupEnd } from "./utils";

const RENDER_FIELDS = [
	"url",
	"title",
	"description",
	"host",
	"image",
	"favicon",
	"avatar",
	"author",
	"date",
	"stars",
	"views",
	"duration",
	"repo",
];

export class CodeBlockGenerator {
	editor: Editor;
	static settings: ObsidianAutoCardLinkSettings | null = null;
	static cache: MetadataCache | null = null;

	constructor(editor: Editor) {
		this.editor = editor;
	}

	async convertUrlToCodeBlock(url: string): Promise<void> {
		const selectedText = this.editor.getSelection();
		const pasteId = this.createBlockHash();
		const fetchingText = `[${t("Fetching data")}#${pasteId}](${url})`;
		this.editor.replaceSelection(fetchingText);

		const linkMetadata = await this.fetchLinkMetadata(url);

		const text = this.editor.getValue();
		const start = text.indexOf(fetchingText);
		if (start < 0) {
			log(`Unable to find text "${fetchingText}" in current editor, bailing out; link ${url}`);
			return;
		}
		const end = start + fetchingText.length;
		const startPos = EditorExtensions.getEditorPositionFromIndex(text, start);
		const endPos = EditorExtensions.getEditorPositionFromIndex(text, end);

		if (!linkMetadata) {
			new Notice(t("Failed to fetch"));
			this.editor.replaceRange(selectedText || url, startPos, endPos);
			return;
		}

		this.editor.replaceRange(
			this.genCodeBlock(linkMetadata),
			startPos,
			endPos
		);
	}

	genCodeBlock(linkMetadata: Record<string, unknown>): string {
		const codeBlockTexts = ["\n```cardlink"];
		const usedFields: string[] = [];

		const formatValue = (value: unknown): string => {
			if (typeof value !== "string") return String(value);
			const cleanValue = value
				.replace(/\r\n|\n|\r/g, " ")
				.replace(/\\/g, "\\\\")
				.trim();
			const escaped = cleanValue.replace(/'/g, "''");
			return `'${escaped}'`;
		};

		for (const fieldName of RENDER_FIELDS) {
			const value = linkMetadata[fieldName];
			if (value !== undefined && value !== null && value !== "") {
				codeBlockTexts.push(`${fieldName}: ${formatValue(value)}`);
				usedFields.push(fieldName);
			}
		}

		codeBlockTexts.push("```\n");

		log("渲染卡片使用的字段:", usedFields.join(", "));

		return codeBlockTexts.join("\n");
	}

	async fetchLinkMetadata(
		url: string
	): Promise<Record<string, unknown> | null> {
		if (!url || typeof url !== "string") return null;
		if (!url.match(/^https?:\/\//i)) {
			url = "https://" + url;
		}

		logGroupStart(`开始分析 ${url}`);

		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
		} catch (e) {
			log("URL解析失败");
			logGroupEnd();
			return null;
		}

		if (CodeBlockGenerator.cache) {
			const cached = CodeBlockGenerator.cache.get(url);
			if (cached) {
				log("命中缓存");
				this.logResult(url, cached);
				logGroupEnd();
				return cached;
			}
		}

		let specialistData: Record<string, unknown> | null = null;

		if (BilibiliParser.isBilibiliUrl(url)) {
			const bilibiliParser = new BilibiliParser(url);
			specialistData = await bilibiliParser.parse();
		}

		if (YouTubeParser.isYouTubeUrl(url)) {
			const youTubeParser = new YouTubeParser(url);
			specialistData = await youTubeParser.parse();
		}

		if (
			parsedUrl.hostname === "github.com" &&
			GitHubParser.isGitHubUrl(url)
		) {
			const githubParser = new GitHubParser(url);
			specialistData = await githubParser.parse();
		}

		const isTwitter = TwitterParser.isTwitterUrl(url);

		if (isTwitter) {
			const proxyUrl =
				CodeBlockGenerator.settings?.tpl_x_htmlProxyUrl ||
				"http://127.0.0.1:8080";
			const twitterParser = new TwitterParser(url, proxyUrl);
			specialistData = await twitterParser.parse();
		}

		if (specialistData && (YouTubeParser.isYouTubeUrl(url) || isTwitter)) {
			this.saveToCache(url, specialistData);
			this.logResult(url, specialistData);
			logGroupEnd();
			return specialistData;
		}

		let fetchUrl = url;
		let proxyBase = "";

		const res = await (() =>
			requestUrl({
				url: fetchUrl,
				headers: {
					"User-Agent": DEFAULT_USER_AGENT,
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
				},
			}).catch(() => null))();

		let result: Record<string, unknown> | null = null;

		if (res && res.status === 200) {
			const parser = new LinkMetadataParser(url, res.text, proxyBase);
			result = await parser.parse(specialistData || undefined);
			if (result) {
				this.saveToCache(url, result);
				this.logResult(url, result);
				logGroupEnd();
				return result;
			}
		}

		if (specialistData) {
			this.saveToCache(url, specialistData);
			this.logResult(url, specialistData);
			logGroupEnd();
			return specialistData;
		}

		if (CodeBlockGenerator.settings?.fallbackApiEnabled) {
			result = await this.fetchFromFallbackApi(url);
			if (result) {
				this.saveToCache(url, result);
				this.logResult(url, result);
				logGroupEnd();
				return result;
			}
		}

		log("分析完毕：无结果");
		logGroupEnd();
		return result;
	}

	logResult(url: string, data: Record<string, unknown>): void {
		log("── 输出字段 ──");
		for (const key of Object.keys(data)) {
			if (key === "indent") continue;
			const value = data[key];
			if (value !== undefined && value !== null && value !== "") {
				log(`  ${key}: ${value}`);
			}
		}
		log("── 所有原始字段 ──");
		for (const [key, value] of Object.entries(data)) {
			log(`  ${key}: ${JSON.stringify(value)}`);
		}
		log("分析完毕 ✓");
	}

	async fetchFromFallbackApi(
		url: string
	): Promise<Record<string, unknown> | null> {
		try {
			const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
			const res = await requestUrl({ url: microlinkUrl });
			if (res.status === 200 && res.json && res.json.status === "success") {
				const data = res.json.data;
				const { hostname } = new URL(url);
				const result: Record<string, unknown> = {
					url: data.url || url,
					title: data.title || "",
					description: data.description || "",
					host: hostname,
					indent: 0,
				};
				if (data.image?.url) {
					result.image = data.image.url;
				}
				if (result.title) {
					this.saveToCache(url, result);
					return result;
				}
			}
		} catch (e) {
			log("Microlink API fallback error:", e);
		}

		try {
			const iframelyUrl = `http://iframely.server.crestify.com/iframely?url=${encodeURIComponent(url)}`;
			const res = await requestUrl({ url: iframelyUrl });
			if (res.status === 200 && res.json) {
				const data = res.json;
				if (data.code === 403) return null;

				const { hostname } = new URL(url);
				const result: Record<string, unknown> = {
					url: url,
					title: data.meta?.title || "",
					description: data.meta?.description || "",
					host: hostname,
					indent: 0,
				};

				const imageLink = data.links?.find(
					(l: { type: string; rel: string[] }) =>
						l.type?.startsWith("image") &&
						l.rel?.includes("twitter")
				);
				if (imageLink) {
					result.image = imageLink.href;
				}

				if (result.title) {
					this.saveToCache(url, result);
					return result;
				}
			}
		} catch (e) {
			log("iframely API fallback error:", e);
		}

		return null;
	}

	saveToCache(url: string, data: Record<string, unknown>): void {
		if (CodeBlockGenerator.cache) {
			CodeBlockGenerator.cache.set(url, data);
		}
	}

	createBlockHash(): string {
		let result = "";
		const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
		const charactersLength = characters.length;
		for (let i = 0; i < 4; i++) {
			result += characters.charAt(
				Math.floor(Math.random() * charactersLength)
			);
		}
		return result;
	}
}
