import { App, PluginSettingTab, Notice, Setting, requestUrl, Modal } from "obsidian";
import { t } from "./i18n";
import { DEFAULT_USER_AGENT, setDebugEnabled } from "./utils";
import type ObsidianAutoCardLink from "./main";

export interface ObsidianAutoCardLinkSettings {
	enhanceDefaultPaste: boolean;
	showInMenuItem: boolean;
	followColorScheme: boolean;
	cacheEnabled: boolean;
	cacheExpiry: number;
	fallbackApiEnabled: boolean;
	debugEnabled: boolean;
	tpl_bilibili_video_apiUrl: string;
	tpl_x_htmlProxyUrl: string;
}

export const DEFAULT_SETTINGS: ObsidianAutoCardLinkSettings = {
	enhanceDefaultPaste: true,
	showInMenuItem: true,
	followColorScheme: true,
	cacheEnabled: false,
	cacheExpiry: 24,
	fallbackApiEnabled: true,
	debugEnabled: false,
	tpl_bilibili_video_apiUrl: "https://api.bilibili.com/x/web-interface/view",
	tpl_x_htmlProxyUrl: "http://127.0.0.1:8080",
};

class TestResultModal extends Modal {
	resultText: string;

	constructor(app: App, resultText: string) {
		super(app);
		this.resultText = resultText;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: t("Test result") });

		const pre = contentEl.createEl("pre", {
			cls: "link-card-test-result",
		});
		pre.textContent = this.resultText;
		pre.style.cssText =
			"max-height:400px;overflow:auto;background:var(--background-secondary);padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-all;user-select:all;cursor:text;";

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText(t("Copy")).onClick(() => {
					navigator.clipboard.writeText(this.resultText);
					new Notice(t("Copied"));
				})
			)
			.addButton((btn) =>
				btn.setButtonText(t("Close")).onClick(() => this.close())
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class ObsidianAutoCardLinkSettingTab extends PluginSettingTab {
	plugin: ObsidianAutoCardLink;

	constructor(app: App, plugin: ObsidianAutoCardLink) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Link Card" });

		new Setting(containerEl)
			.setName(t("Enhance default paste"))
			.setDesc(t("Enhance default paste desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enhanceDefaultPaste)
					.onChange(async (value) => {
						this.plugin.settings.enhanceDefaultPaste = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Show in menu item"))
			.setDesc(t("Show in menu item desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showInMenuItem)
					.onChange(async (value) => {
						this.plugin.settings.showInMenuItem = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Follow color scheme"))
			.setDesc(t("Follow color scheme desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.followColorScheme)
					.onChange(async (value) => {
						this.plugin.settings.followColorScheme = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Debug mode"))
			.setDesc(t("Debug mode desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugEnabled)
					.onChange(async (value) => {
						this.plugin.settings.debugEnabled = value;
						setDebugEnabled(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Cache enabled"))
			.setDesc(t("Cache enabled desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.cacheEnabled)
					.onChange(async (value) => {
						this.plugin.settings.cacheEnabled = value;
						this.plugin.cache.setEnabled(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Cache expiry"))
			.setDesc(t("Cache expiry desc"))
			.addSlider((slider) =>
				slider
					.setLimits(1, 168, 1)
					.setValue(this.plugin.settings.cacheExpiry)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cacheExpiry = value;
						this.plugin.cache.setExpiry(value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Clear cache"))
			.setDesc(t("Clear cache desc"))
			.addButton((button) =>
				button.setButtonText(t("Clear")).onClick(async () => {
					this.plugin.cache.clear();
					await this.plugin.saveSettings();
					new Notice(t("Cache cleared"));
				})
			);

		new Setting(containerEl)
			.setName(t("Fallback API"))
			.setDesc(t("Fallback API desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fallbackApiEnabled)
					.onChange(async (value) => {
						this.plugin.settings.fallbackApiEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bilibili API URL")
			.setDesc(t("API URL desc"))
			.addText((text) =>
				text
					.setPlaceholder("https://api.bilibili.com/x/web-interface/view")
					.setValue(this.plugin.settings.tpl_bilibili_video_apiUrl)
					.onChange(async (value) => {
						this.plugin.settings.tpl_bilibili_video_apiUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("X/Twitter proxy URL")
			.setDesc(t("HTML proxy desc"))
			.addText((text) =>
				text
					.setPlaceholder("http://127.0.0.1:8080")
					.setValue(this.plugin.settings.tpl_x_htmlProxyUrl)
					.onChange(async (value) => {
						this.plugin.settings.tpl_x_htmlProxyUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("Reset settings"))
			.setDesc(t("Reset settings desc"))
			.addButton((button) =>
				button.setButtonText(t("Reset")).onClick(async () => {
					Object.assign(this.plugin.settings, DEFAULT_SETTINGS);
					setDebugEnabled(DEFAULT_SETTINGS.debugEnabled);
					await this.plugin.saveSettings();
					this.display();
					new Notice(t("Settings reset"));
				})
			);
	}
}
