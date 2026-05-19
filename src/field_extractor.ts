export class FieldExtractor {
	static extractFromJson(
		data: Record<string, unknown>,
		fieldConfig: string
	): Record<string, unknown> {
		if (!fieldConfig || !data) return {};
		const result: Record<string, unknown> = {};
		const fields = fieldConfig
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean);

		for (const field of fields) {
			const value = this.getJsonValueByPath(data, field);
			if (value !== undefined && value !== null) {
				const resultKey = field.replace(/\./g, "_");
				result[resultKey] = value;
			}
		}
		return result;
	}

	static getJsonValueByPath(
		obj: unknown,
		path: string
	): unknown {
		if (!path) return undefined;
		const parts = path.split(".");
		let current = obj;
		for (const part of parts) {
			const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
			if (arrayMatch) {
				const key = arrayMatch[1];
				const index = parseInt(arrayMatch[2]);
				if (
					current &&
					typeof current === "object" &&
					key in current &&
					Array.isArray((current as Record<string, unknown>)[key])
				) {
					current = (current as Record<string, unknown[]>)[key][index];
				} else {
					return undefined;
				}
			} else {
				if (current && typeof current === "object" && part in current) {
					current = (current as Record<string, unknown>)[part];
				} else {
					return undefined;
				}
			}
		}
		return current;
	}

	static async extractFromHtml(
		htmlDoc: Document,
		fieldConfig: string,
		proxyBase?: string
	): Promise<Record<string, string>> {
		if (!fieldConfig || !htmlDoc) return {};
		const result: Record<string, string> = {};
		const fields = fieldConfig
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean);

		for (const field of fields) {
			const value = await this.getHtmlValueBySelector(
				htmlDoc,
				field,
				proxyBase
			);
			if (value) {
				const resultKey = field
					.replace(/[:\[\]]/g, "_")
					.replace(/_+/g, "_")
					.replace(/^_|_$/g, "");
				result[resultKey] = value;
			}
		}
		return result;
	}

	static async getHtmlValueBySelector(
		htmlDoc: Document,
		selector: string,
		proxyBase?: string
	): Promise<string | null> {
		if (!selector) return null;

		if (selector.startsWith("og:") || selector.startsWith("twitter:")) {
			const meta = htmlDoc.querySelector(
				`meta[property='${selector}']`
			) as HTMLMetaElement | null;
			if (meta) {
				let content = meta.getAttribute("content") || "";
				if (
					selector.includes("image") &&
					proxyBase &&
					content &&
					content.startsWith("/")
				) {
					const base = proxyBase.replace(/\/+$/, "");
					content = `${base}${content}`;
				}
				return content;
			}
		} else if (selector.includes("[")) {
			const element = htmlDoc.querySelector(selector);
			if (element) {
				const attrMatch = selector.match(/\[(\w+)\]$/);
				if (attrMatch) {
					return element.getAttribute(attrMatch[1]);
				}
			}
		} else {
			const meta = htmlDoc.querySelector(
				`meta[name='${selector}']`
			) as HTMLMetaElement | null;
			if (meta) return meta.getAttribute("content");
			const element = htmlDoc.querySelector(selector);
			if (element) return element.textContent;
		}
		return null;
	}
}
