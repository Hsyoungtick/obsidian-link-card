import { urlRegex, imageRegex, linkRegex } from "./regex";

export class CheckIf {
	static isUrl(text: string): boolean {
		const regex = new RegExp(urlRegex);
		return regex.test(text);
	}

	static isImage(text: string): boolean {
		const regex = new RegExp(imageRegex);
		return regex.test(text);
	}

	static isLinkedUrl(text: string): boolean {
		const regex = new RegExp(linkRegex);
		return regex.test(text);
	}
}
