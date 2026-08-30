import { Editor, MarkdownView, Plugin, Menu } from "obsidian";
import {
	ObsidianAutoCardLinkSettings,
	DEFAULT_SETTINGS,
	ObsidianAutoCardLinkSettingTab,
} from "./settings";
import { CodeBlockGenerator } from "./code_block_generator";
import { CodeBlockProcessor } from "./code_block_processor";
import { MetadataCache, ImageCache } from "./cache";
import { CheckIf } from "./checkif";
import { t } from "./i18n";
import { setDebugEnabled, log } from "./utils";

export default class ObsidianAutoCardLink extends Plugin {
	settings: ObsidianAutoCardLinkSettings;
	cache: MetadataCache;
	imageCache: ImageCache;

	async onload() {
		await this.loadSettings();

		this.cache = new MetadataCache(
			this.settings.cacheEnabled,
			this.settings.cacheExpiry
		);
		const storedData = await this.loadData() as Record<string, unknown> | null;
		const cacheEntries = (storedData?.["auto-card-link-cache"] as Record<string, import("./cache").CacheEntry> | null) || null;
		this.cache.fromJSON(cacheEntries);

		this.imageCache = new ImageCache(
			this.app,
			this.manifest.dir ?? "",
			this.settings.imageCacheEnabled
		);
		await this.imageCache.loadUrlMap();

		CodeBlockGenerator.settings = this.settings;
		CodeBlockGenerator.cache = this.cache;
		CodeBlockGenerator.imageCache = this.imageCache;
		CodeBlockProcessor.settings = this.settings;
		CodeBlockProcessor.cache = this.cache;
		CodeBlockProcessor.imageCache = this.imageCache;

		this.registerMarkdownCodeBlockProcessor("cardlink", async (source, el) => {
			const processor = new CodeBlockProcessor(this.app);
			await processor.run(source, el);
		});

		this.addCommand({
			id: "paste-url-and-enhance",
			name: t("Paste URL and enhance"),
			editorCallback: async (editor: Editor) => {
				await this.pasteUrlAndEnhance(editor);
			},
		});

		this.addCommand({
			id: "enhance-selected-url",
			name: t("Render as card"),
			editorCallback: async (editor: Editor) => {
				await this.enhanceSelectedUrl(editor);
			},
		});

		this.registerEvent(
			this.app.workspace.on("editor-paste", (evt: ClipboardEvent) => {
				this.handlePaste(evt);
			})
		);

		if (this.settings.showInMenuItem) {
			this.registerEvent(
				this.app.workspace.on("editor-menu", (menu: Menu) => {
					this.addContextMenuItems(menu);
				})
			);
		}

		this.addSettingTab(
			new ObsidianAutoCardLinkSettingTab(this.app, this)
		);
	}

	onunload() {
		void this.saveCacheData();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		setDebugEnabled(this.settings.debugEnabled);
	}

	async saveSettings() {
		const diff: Partial<ObsidianAutoCardLinkSettings> = {};
		for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof ObsidianAutoCardLinkSettings>) {
			if (JSON.stringify(this.settings[key]) !== JSON.stringify(DEFAULT_SETTINGS[key])) {
				Object.assign(diff, { [key]: this.settings[key] });
			}
		}
		if (Object.keys(diff).length === 0) {
			try {
				await this.app.vault.adapter.remove(
					`${this.manifest.dir}/data.json`
				);
			} catch {
				// 文件不存在时忽略
			}
		} else {
			await this.saveData(diff);
		}
		CodeBlockGenerator.settings = this.settings;
		CodeBlockProcessor.settings = this.settings;
	}

	async saveCacheData() {
		try {
			const cacheData = this.cache.toJSON();
			const cacheStr = JSON.stringify(cacheData);
			if (cacheStr.length < 5000000) {
				const existingData = ((await this.loadData()) as Record<string, unknown> | null) || {};
				existingData["auto-card-link-cache"] = cacheData;
				await this.saveData(existingData);
			}
		} catch (e) {
			log("Failed to save cache:", e);
		}
	}

	async pasteUrlAndEnhance(editor: Editor): Promise<void> {
		const clipboardText = await navigator.clipboard.readText();
		if (!clipboardText) return;

		const url = clipboardText.trim();
		if (!CheckIf.isUrl(url)) return;

		const generator = new CodeBlockGenerator(editor);
		await generator.convertUrlToCodeBlock(url);
		await this.saveCacheData();
	}

	async enhanceSelectedUrl(editor: Editor): Promise<void> {
		const selectedText = editor.getSelection().trim();
		if (!selectedText) return;

		let url = selectedText;
		const linkMatch = selectedText.match(/^\[.*?\]\((.*?)\)$/);
		if (linkMatch) {
			url = linkMatch[1];
		}

		if (!CheckIf.isUrl(url)) return;

		const generator = new CodeBlockGenerator(editor);
		await generator.convertUrlToCodeBlock(url);
		await this.saveCacheData();
	}

	handlePaste(evt: ClipboardEvent): void {
		if (!this.settings.enhanceDefaultPaste) return;

		const clipboardText = evt.clipboardData?.getData("text/plain");
		if (!clipboardText) return;

		const url = clipboardText.trim();
		if (!CheckIf.isUrl(url)) return;

		const activeView =
			this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		if (!editor) return;

		evt.preventDefault();

		const generator = new CodeBlockGenerator(editor);
		generator.convertUrlToCodeBlock(url).then(async () => {
			await this.saveCacheData();
		});
	}

	addContextMenuItems(menu: Menu): void {
		menu.addItem((item) => {
			item
				.setTitle(t("Render as card menu"))
				.setIcon("link")
				.onClick(async () => {
					const activeView =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!activeView) return;
					await this.enhanceSelectedUrl(activeView.editor);
				});
		});
	}
}
