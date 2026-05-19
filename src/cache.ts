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
