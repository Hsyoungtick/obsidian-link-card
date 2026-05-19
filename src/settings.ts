import { App, PluginSettingTab, Notice, Setting, moment } from "obsidian";
import { t } from "./i18n";
import { setDebugEnabled } from "./utils";
import type ObsidianAutoCardLink from "./main";

export interface ObsidianAutoCardLinkSettings {
	enhanceDefaultPaste: boolean;
	showInMenuItem: boolean;
	followColorScheme: boolean;
	cacheEnabled: boolean;
	cacheExpiry: number;
	fallbackApiEnabled: boolean;
	debugEnabled: boolean;
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
	tpl_x_htmlProxyUrl: "http://127.0.0.1:8080",
};

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
		const nitterDocUrl = moment.locale().startsWith("zh")
			? "https://github.com/Hsyoungtick/twitter-gallery/blob/main/docs/nitter_config_zh.md"
			: "https://github.com/Hsyoungtick/twitter-gallery/blob/main/docs/nitter_config.md";
		containerEl.querySelector(".setting-item:last-child .setting-item-description")?.createEl("a", {
			href: nitterDocUrl,
			text: t("Nitter doc link"),
			attr: { target: "_blank" },
		});

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
