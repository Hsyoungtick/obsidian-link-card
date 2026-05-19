import { requestUrl } from "obsidian";
import { formatDateFromString, formatNumberEN, log, sanitizeText, DEFAULT_USER_AGENT } from "./utils";

export interface GitHubParseResult {
	url: string;
	title: string;
	description?: string;
	host: string;
	image?: string;
	avatar?: string;
	author?: string;
	stars?: string;
	repo?: string;
	date?: string;
	[key: string]: unknown;
	indent: number;
}

export class GitHubParser {
	url: string;

	constructor(url: string) {
		this.url = url;
	}

	static isGitHubUrl(url: string): boolean {
		const githubRegex =
			/^https?:\/\/(www\.)?github\.com\/[^\/]+\/[^\/]+/i;
		return githubRegex.test(url);
	}

	static extractRepoInfo(
		url: string
	): { owner: string; repo: string } | null {
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
		if (match) {
			return { owner: match[1], repo: match[2] };
		}
		return null;
	}

	async parse(): Promise<GitHubParseResult | null> {
		const repoInfo = GitHubParser.extractRepoInfo(this.url);
		if (!repoInfo) return null;

		try {
			return await this.parseFromApi(repoInfo.owner, repoInfo.repo);
		} catch (e) {
			log("GitHub API error, falling back to HTML:", e);
			return await this.parseFromHtml();
		}
	}

	async parseFromApi(
		owner: string,
		repo: string
	): Promise<GitHubParseResult | null> {
		try {
			const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
			const res = await requestUrl({
				url: apiUrl,
				headers: {
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "obsidian-auto-card-link",
				},
			});

			if (res.status !== 200 || !res.json) {
				return await this.parseFromHtml();
			}

			const data = res.json;
			log("GitHub API 原始数据: full_name=", data.full_name, "stargazers_count=", data.stargazers_count, "updated_at=", data.updated_at, "language=", data.language, "owner.login=", data.owner?.login);

			const title = sanitizeText(repo || data.full_name || `${owner}/${repo}`);

			const description = data.description
				? sanitizeText(data.description)
				: undefined;

			let date: string | undefined;
			if (data.created_at) {
				date = formatDateFromString(data.created_at);
			}
			log("GitHub parse: 日期回退链: created_at(" + (data.created_at || "无") + ") → 最终选择date=" + (date || "无"));

			const coverUrl = `https://opengraph.githubassets.com/1/${owner}/${repo}`;
			const avatarUrl = data.owner?.avatar_url || undefined;

			log("GitHub parse: 图片回退链: cover(opengraph)(" + coverUrl + ") -> avatar(" + (avatarUrl || "无") + ") → 最终选择cover作为image");

			const result: GitHubParseResult = {
				url: this.url,
				title,
				description,
				host: "github.com",
				image: coverUrl,
				avatar: avatarUrl,
				author: data.owner?.login || owner,
				stars:
					data.stargazers_count !== undefined
						? formatNumberEN(data.stargazers_count)
						: undefined,
				repo: data.name || repo,
				date,
				indent: 0,
			};
			log("GitHub parse: 最终字段 title=", result.title, "author=", result.author || "无", "stars=", result.stars || "无", "date=", result.date || "无", "repo=", result.repo || "无");
			return result;
		} catch (e) {
			log("GitHub API fetch error:", e);
			return await this.parseFromHtml();
		}
	}

	async parseFromHtml(): Promise<GitHubParseResult | null> {
		try {
			const res = await requestUrl({
				url: this.url,
				headers: {
					"User-Agent": DEFAULT_USER_AGENT,
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				},
			});
			if (res.status !== 200) return null;

			const parser = new DOMParser();
			const htmlDoc = parser.parseFromString(res.text, "text/html");

			const ogTitle = htmlDoc.querySelector(
				"meta[property='og:title']"
			) as HTMLMetaElement | null;
			const title = ogTitle
				?.getAttribute("content")
				? sanitizeText(ogTitle.getAttribute("content") || "")
				: undefined;

			if (!title) return null;

			const ogDesc = htmlDoc.querySelector(
				"meta[property='og:description']"
			) as HTMLMetaElement | null;
			const description = ogDesc
				?.getAttribute("content")
				? sanitizeText(ogDesc.getAttribute("content") || "")
				: undefined;

			const ogImage = htmlDoc.querySelector(
				"meta[property='og:image']"
			) as HTMLMetaElement | null;
			const image = ogImage?.getAttribute("content") || undefined;

			let stars: string | undefined;
			const starButton = htmlDoc.querySelector(
				"a[href$='/stargazers']"
			);
			if (starButton) {
				const match = starButton.textContent?.match(/[\d,]+/);
				if (match) stars = match[0].replace(/,/g, "");
			}

			let date: string | undefined;
			const relativeTime = htmlDoc.querySelector("relative-time");
			if (relativeTime) {
				const datetime = relativeTime.getAttribute("datetime");
				if (datetime) {
					date = formatDateFromString(datetime);
				}
			}
			log("GitHub HTML: 日期回退链: datetime(" + (relativeTime?.getAttribute("datetime") || "无") + ") → 最终选择date=" + (date || "无"));

			const repoInfo = GitHubParser.extractRepoInfo(this.url);
			const coverUrl = repoInfo
				? `https://opengraph.githubassets.com/1/${repoInfo.owner}/${repoInfo.repo}`
				: image;

			log("GitHub HTML: 图片回退链: cover(opengraph)(" + coverUrl + ") -> og:image(" + (image || "无") + ") → 最终选择cover作为image");

			const result: GitHubParseResult = {
				url: this.url,
				title,
				description,
				host: "github.com",
				image: coverUrl || image,
				author: repoInfo?.owner,
				stars,
				repo: repoInfo?.repo,
				date,
				indent: 0,
			};
			log("GitHub HTML: 最终字段 title=", result.title, "author=", result.author || "无", "stars=", result.stars || "无", "date=", result.date || "无");
			return result;
		} catch (e) {
			log("GitHub HTML parse error:", e);
			return null;
		}
	}

}
