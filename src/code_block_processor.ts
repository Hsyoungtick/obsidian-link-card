import {
	App,
	parseYaml,
	Notice,
	ButtonComponent,
	getLinkpath,
} from "obsidian";
import { YamlParseError, NoRequiredParamsError } from "./errors";
import { CheckIf } from "./checkif";
import { ObsidianAutoCardLinkSettings } from "./settings";
import { t } from "./i18n";
import { ICON_PLAY, ICON_STAR, ICON_DATE } from "./icons";

function insertSvg(container: HTMLElement, svgString: string): void {
	const template = document.createElement("template");
	template.innerHTML = svgString.trim();
	const node = template.content.firstChild;
	if (node) {
		container.appendChild(node);
	}
}
import { log } from "./utils";

interface CardData {
	url: string;
	title: string;
	description?: string;
	host?: string;
	image?: string;
	favicon?: string;
	avatar?: string;
	author?: string;
	duration?: string;
	views?: string;
	date?: string;
	stars?: string;
	repo?: string;
	[key: string]: unknown;
	indent: number;
}

interface CardTheme {
	titleLineClamp: number;
	titleLineHeight: number;
	showDescription: boolean;
}

function getCardTheme(data: CardData): CardTheme {
	const isTwitter = data.host?.includes("x.com") || data.host?.includes("twitter.com");
	if (isTwitter) {
		return {
			titleLineClamp: 3,
			titleLineHeight: 1.5,
			showDescription: false,
		};
	}
	return {
		titleLineClamp: 2,
		titleLineHeight: 1.4,
		showDescription: true,
	};
}

export class CodeBlockProcessor {
	app: App;
	static settings: ObsidianAutoCardLinkSettings | null = null;

	constructor(app: App) {
		this.app = app;
	}

	async run(source: string, el: HTMLElement): Promise<void> {
		try {
			const data = this.parseLinkMetadataFromYaml(source);
			el.appendChild(this.genLinkEl(data));
		} catch (error) {
			if (error instanceof NoRequiredParamsError) {
				el.appendChild(this.genErrorEl(error.message));
			} else if (error instanceof YamlParseError) {
				el.appendChild(this.genErrorEl(error.message));
			} else if (error instanceof TypeError) {
				el.appendChild(this.genErrorEl(t("Internal links error")));
				log(error);
			} else {
				log(t("Cardlink unknown error"), error);
			}
		}
	}

	parseLinkMetadataFromYaml(source: string): CardData {
		let yaml: Partial<CardData>;
		let indent = -1;

		source = source
			.split(/\r?\n|\r|\n/g)
			.map((line) =>
				line.replace(/^\t+/g, (tabs) => {
					const n = tabs.length;
					if (indent < 0) {
						indent = n;
					}
					return " ".repeat(n);
				})
			)
			.join("\n");

		try {
			yaml = parseYaml(source) as Partial<CardData>;
		} catch (error) {
			log(error);
			throw new YamlParseError(t("YAML parse error"));
		}

		if (!yaml || !yaml.url || !yaml.title) {
			throw new NoRequiredParamsError(t("Required params missing"));
		}

		const result: CardData = {
			url: yaml.url,
			title: yaml.title,
			description: yaml.description,
			host: yaml.host,
			image: yaml.image,
			favicon: yaml.favicon,
			avatar: yaml.avatar,
			author: yaml.author,
			duration: yaml.duration,
			views: yaml.views,
			date: yaml.date || (yaml as Record<string, unknown>).pubdate as string | undefined,
			stars: yaml.stars,
			repo: yaml.repo,
			indent,
		};

		for (const key of Object.keys(yaml)) {
			if (!(key in result)) {
				(result as Record<string, unknown>)[key] = yaml[key];
			}
		}

		return result;
	}

	genErrorEl(errorMsg: string): HTMLElement {
		const containerEl = document.createElement("div");
		containerEl.addClass("auto-card-link-error-container");
		const spanEl = document.createElement("span");
		spanEl.textContent = `cardlink error: ${errorMsg}`;
		containerEl.appendChild(spanEl);
		return containerEl;
	}

	resolveImageUrl(url: string | undefined): string {
		if (!url) return "";
		if (url.startsWith("[[") && url.endsWith("]]")) {
			return this.getLocalImagePath(url);
		}
		if (!CheckIf.isUrl(url)) {
			return this.getLocalImagePath(`[[${url}]]`);
		}
		return url;
	}

	genLinkEl(data: CardData): HTMLElement {
		const theme = getCardTheme(data);
		const isTwitter = data.host?.includes("x.com") || data.host?.includes("twitter.com");
		const usedRenderFields: string[] = [];

		const containerEl = document.createElement("div");
		containerEl.addClass("auto-card-link-container");
		containerEl.addClass("video-holder");
		if (!CodeBlockProcessor.settings?.followColorScheme) {
			containerEl.addClass("no-color-scheme");
		}
		containerEl.setAttr("data-auto-card-link-depth", data.indent);

		const cardEl = document.createElement("a");
		cardEl.setAttr("href", data.url);
		usedRenderFields.push("url");
		cardEl.setAttr("target", "_blank");
		containerEl.appendChild(cardEl);

		if (isTwitter) {
			cardEl.addClass("twitter-card-link");
		}

		const hasImage = !!data.image;
		if (hasImage) {
			usedRenderFields.push("image");
			const coverBox = document.createElement("div");
			coverBox.addClass("cover-box");
			cardEl.appendChild(coverBox);

			const resolvedImage = this.resolveImageUrl(data.image);
			const coverImg = document.createElement("img");
			coverImg.addClass("cover-img");
			coverImg.setAttr("src", resolvedImage);
			coverImg.setAttr("draggable", "false");
			coverImg.onerror = () => {
				coverBox.remove();
			};
			coverBox.appendChild(coverImg);

			if (data.duration) {
				usedRenderFields.push("duration");
				const subtitleEl = document.createElement("div");
				subtitleEl.addClass("video-subtitle");
				const durationEl = document.createElement("span");
				durationEl.addClass("video-duration");
				durationEl.textContent = data.duration;
				subtitleEl.appendChild(durationEl);
				coverBox.appendChild(subtitleEl);
			}
		}

		const contentContainer = document.createElement("div");
		contentContainer.addClass("video-content-container");
		cardEl.appendChild(contentContainer);

		const titleValue = data.repo || data.title || "";
		if (titleValue) {
			if (data.repo) usedRenderFields.push("repo");
			else usedRenderFields.push("title");
			const titleEl = document.createElement("div");
			titleEl.addClass("video-title");
			titleEl.style.fontSize = "16px";
			titleEl.style.lineHeight = String(theme.titleLineHeight);
			titleEl.style.height = "auto";
			titleEl.style.maxHeight = `${16 * theme.titleLineHeight * theme.titleLineClamp}px`;
			titleEl.style.overflow = "hidden";
			titleEl.style.display = "-webkit-box";
			titleEl.style.webkitLineClamp = String(theme.titleLineClamp);
			titleEl.style.webkitBoxOrient = "vertical";
			titleEl.textContent = titleValue;
			contentContainer.appendChild(titleEl);
		}

		if (theme.showDescription && data.description) {
			usedRenderFields.push("description");
			const descEl = document.createElement("div");
			descEl.addClass("video-description");
			descEl.style.fontSize = "12px";
			descEl.style.lineHeight = "1.4";
			descEl.style.height = "auto";
			descEl.style.maxHeight = "33.6px";
			descEl.style.overflow = "hidden";
			descEl.style.display = "-webkit-box";
			descEl.style.webkitLineClamp = "2";
			descEl.style.webkitBoxOrient = "vertical";
			descEl.textContent = data.description;
			contentContainer.appendChild(descEl);
		}

		const spacer = document.createElement("div");
		spacer.style.flex = "1";
		contentContainer.appendChild(spacer);

		const dataEl = document.createElement("div");
		dataEl.addClass("video-card-info");
		let hasData = false;

		if (data.views) {
			hasData = true;
			usedRenderFields.push("views");
			const viewItem = document.createElement("span");
			viewItem.addClass("cover-info-item");
			insertSvg(viewItem, ICON_PLAY);
			const viewNum = document.createElement("span");
			viewNum.addClass("num-info");
			viewNum.textContent = data.views;
			viewItem.appendChild(viewNum);
			dataEl.appendChild(viewItem);
		}
		if (data.stars) {
			hasData = true;
			usedRenderFields.push("stars");
			const starItem = document.createElement("span");
			starItem.addClass("cover-info-item");
			insertSvg(starItem, ICON_STAR);
			const starCount = document.createElement("span");
			starCount.addClass("num-info");
			starCount.textContent = data.stars;
			starItem.appendChild(starCount);
			dataEl.appendChild(starItem);
		}
		if (data.date) {
			hasData = true;
			usedRenderFields.push("date");
			const dateItem = document.createElement("span");
			dateItem.addClass("cover-info-item");
			insertSvg(dateItem, ICON_DATE);
			const dateText = document.createElement("span");
			dateText.addClass("num-info");
			dateText.textContent = data.date;
			dateItem.appendChild(dateText);
			dataEl.appendChild(dateItem);
		}

		if (hasData) {
			contentContainer.appendChild(dataEl);
		}

		const bottomEl = document.createElement("div");
		bottomEl.addClass("video-card-bottom");
		contentContainer.appendChild(bottomEl);

		const authorEl = document.createElement("div");
		authorEl.addClass("author-info");

		const avatarSrc = data.avatar || data.favicon;
		if (avatarSrc) {
			if (data.avatar) usedRenderFields.push("avatar");
			else usedRenderFields.push("favicon");
			const img = document.createElement("img");
			img.addClass("avatar-icon");
			img.setAttr("src", avatarSrc);
			img.setAttr("draggable", "false");
			img.onerror = () => {
				img.remove();
			};
			authorEl.appendChild(img);
		}

		if (data.author) {
			usedRenderFields.push("author");
			const authorText = document.createElement("span");
			authorText.addClass("author-name");
			authorText.textContent = data.author;
			authorEl.appendChild(authorText);
		} else if (data.host) {
			usedRenderFields.push("host");
			const hostText = document.createElement("span");
			hostText.addClass("author-name");
			hostText.textContent = data.host;
			authorEl.appendChild(hostText);
		}
		bottomEl.appendChild(authorEl);

		new ButtonComponent(containerEl)
			.setClass("auto-card-link-copy-url")
			.setClass("clickable-icon")
			.setIcon("copy")
			.setTooltip(`Copy URL\n${data.url}`)
			.onClick(() => {
				navigator.clipboard.writeText(data.url);
				new Notice(t("URL copied"));
			});

		log("卡片渲染使用的字段:", usedRenderFields.join(", "));

		return containerEl;
	}

	getLocalImagePath(link: string): string {
		link = link.slice(2, -2);
		const imageRelativePath = this.app.metadataCache.getFirstLinkpathDest(
			getLinkpath(link),
			""
		)?.path;
		if (!imageRelativePath) return link;
		return this.app.vault.adapter.getResourcePath(imageRelativePath);
	}
}
