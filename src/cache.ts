import { App, requestUrl } from "obsidian";
import { log } from "./utils";

export interface CacheEntry {
	data: Record<string, unknown>;
	timestamp: number;
}

export class MetadataCache {
	private cache: Map<string, CacheEntry> = new Map();
	private expiryMs: number;
	private enabled: boolean;

	constructor(enabled: boolean = true, expiryHours: number = 24) {
		this.enabled = enabled;
		this.expiryMs = expiryHours * 60 * 60 * 1000;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setExpiry(hours: number): void {
		this.expiryMs = hours * 60 * 60 * 1000;
	}

	get(url: string): Record<string, unknown> | null {
		if (!this.enabled) return null;
		const entry = this.cache.get(url);
		if (!entry) return null;
		if (Date.now() - entry.timestamp > this.expiryMs) {
			this.cache.delete(url);
			return null;
		}
		return entry.data;
	}

	set(url: string, data: Record<string, unknown>): void {
		if (!this.enabled) return;
		this.cache.set(url, { data, timestamp: Date.now() });
	}

	clear(): void {
		this.cache.clear();
	}

	toJSON(): Record<string, CacheEntry> {
		const obj: Record<string, CacheEntry> = {};
		this.cache.forEach((value, key) => {
			obj[key] = value;
		});
		return obj;
	}

	fromJSON(data: Record<string, CacheEntry> | null): void {
		this.cache.clear();
		if (!data) return;
		for (const [key, value] of Object.entries(data)) {
			this.cache.set(key, value);
		}
	}

	size(): number {
		return this.cache.size;
	}

	cleanExpired(): number {
		let removed = 0;
		const now = Date.now();
		this.cache.forEach((entry, key) => {
			if (now - entry.timestamp > this.expiryMs) {
				this.cache.delete(key);
				removed++;
			}
		});
		return removed;
	}
}

export class ImageCache {
	private app: App;
	private cacheDir: string;
	private enabled: boolean;
	private urlMap: Map<string, string>;

	constructor(app: App, pluginDir: string, enabled: boolean = false) {
		this.app = app;
		this.cacheDir = `${pluginDir}/cache`;
		this.enabled = enabled;
		this.urlMap = new Map();
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	private async ensureCacheDir(): Promise<void> {
		try {
			const exists = await this.app.vault.adapter.exists(this.cacheDir);
			if (!exists) {
				await this.app.vault.adapter.mkdir(this.cacheDir);
			}
		} catch {
			// 目录已存在时忽略
		}
	}

	urlToFilename(url: string): string {
		const ext = this.getExtensionFromUrl(url);
		const baseName = url.replace(/[^a-zA-Z0-9-]/g, "_");
		return `${baseName}.${ext}`;
	}

	private getExtensionFromUrl(url: string): string {
		try {
			const pathname = new URL(url).pathname;
			const match = pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i);
			if (match) return match[1].toLowerCase();
		} catch {
			// URL解析失败时使用默认扩展名
		}
		return "png";
	}

	private getFilePath(filename: string): string {
		return `${this.cacheDir}/${filename}`;
	}

	async cacheImage(url: string): Promise<string | null> {
		if (!this.enabled) return null;

		const filename = this.urlToFilename(url);
		const filePath = this.getFilePath(filename);

		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (exists) {
				this.urlMap.set(filename, url);
				return filename;
			}
		} catch {
			// 文件不存在时继续下载
		}

		try {
			await this.ensureCacheDir();
			const response = await requestUrl({
				url: url,
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			});

			if (response.status === 200 && response.arrayBuffer) {
				await this.app.vault.adapter.writeBinary(filePath, response.arrayBuffer);
				this.urlMap.set(filename, url);
				await this.saveUrlMap();
				log("图片已缓存:", url);
				return filename;
			}
		} catch (e) {
			log("图片缓存失败:", url, e);
		}
		return null;
	}

	async getCachedResourcePath(filename: string): Promise<string | null> {
		const filePath = this.getFilePath(filename);
		try {
			const exists = await this.app.vault.adapter.exists(filePath);
			if (exists) {
				return this.app.vault.adapter.getResourcePath(filePath);
			}
		} catch {
			// 文件不存在时忽略
		}
		return null;
	}

	getOriginalUrl(filename: string): string | null {
		return this.urlMap.get(filename) || null;
	}

	async clear(): Promise<void> {
		try {
			const exists = await this.app.vault.adapter.exists(this.cacheDir);
			if (exists) {
				const result = await this.app.vault.adapter.list(this.cacheDir);
				for (const file of result.files) {
					await this.app.vault.adapter.remove(file);
				}
			}
			this.urlMap.clear();
			await this.saveUrlMap();
		} catch (e) {
			log("清除图片缓存失败:", e);
		}
	}

	getCacheDir(): string {
		return this.cacheDir;
	}

	getAbsoluteCacheDir(): string {
		const adapter = this.app.vault.adapter as unknown as { basePath: string };
		return `${adapter.basePath}/${this.cacheDir}`;
	}

	async loadUrlMap(): Promise<void> {
		const mapPath = `${this.cacheDir}/image_map.json`;
		try {
			const exists = await this.app.vault.adapter.exists(mapPath);
			if (exists) {
				const data = JSON.parse(await this.app.vault.adapter.read(mapPath));
				this.urlMap = new Map(Object.entries(data));
			}
		} catch {
			// 映射文件不存在或解析失败时忽略
		}
	}

	async saveUrlMap(): Promise<void> {
		try {
			await this.ensureCacheDir();
			const mapPath = `${this.cacheDir}/image_map.json`;
			const data: Record<string, string> = {};
			this.urlMap.forEach((url, filename) => {
				data[filename] = url;
			});
			await this.app.vault.adapter.write(mapPath, JSON.stringify(data, null, 2));
		} catch (e) {
			log("保存图片映射失败:", e);
		}
	}
}
