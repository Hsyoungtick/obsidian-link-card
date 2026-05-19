import { moment } from "obsidian";
import en from "./locale/en";
import zhCN from "./locale/zh-cn";

const localeMap: Record<string, Partial<typeof en>> = {
	en,
	"zh-cn": zhCN,
	"zh-CN": zhCN,
	"zh-TW": zhCN,
	"zh-Hans": zhCN,
	"zh-Hant": zhCN,
};

const locale = localeMap[moment.locale()] || en;

export function t(str: keyof typeof en): string {
	return (locale && locale[str]) || en[str] || str;
}
