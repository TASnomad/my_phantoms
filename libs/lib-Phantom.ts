import Buster from "phantombuster"
import puppeteer from "puppeteer"
import { isEmptyObject, IObject } from "./lib-my-store"
import Toolkit, { IProxy } from "./lib-Toolkit"

interface IBrowserInitOptions {
	userAgent?: string
	chromeFlags?: string[]
}

interface IBrowserInitDTO {
	browser: puppeteer.Browser
	page: puppeteer.Page
	proxy: IProxy
}

interface ISnapshotDTO {
	html: string
	image: string
}

export class PhantomStatefullness {
	public static dedupeInput<T>(input: T[]): T[] {
		return Array.from(new Set(input.filter(Boolean)))
	}

	public static getNextInput<T extends IObject>(rawInput: T[], input: T[], statefullnessKey: string, amount?: number): T[] {
		const res: T[] = []

		for (const q of input) {
			let found = false
			for (const d of rawInput) {
				if (d && d[statefullnessKey] === q) {
					found = true
					break
				}
			}
			if (!found) {
				if (q) {
					res.push(q)
					if (typeof amount === "number" && res.length > amount) {
						break
					}
				}
			}
		}
		return res
	}
}

export default class Phantom {
	private tk: Toolkit
	private buster: Buster

	constructor(buster: Buster) {
		this.tk = new Toolkit(buster)
		this.buster = buster
	}

	public async initBrowser(options?: IBrowserInitOptions): Promise<IBrowserInitDTO> {
		const args = [ "--no-sandbox" ]
		if (options && options.chromeFlags) {
			options.chromeFlags.forEach((f) => args.push(f))
		}
		const p = await this.tk.fetchConfiguredProxy()
		if (!isEmptyObject(p)) {
			args.push("--proxy-server=" + p.address)
		}


		const browser = await puppeteer.launch({ args, ignoreHTTPSErrors: true })
		const page = await browser.newPage()

		if (options && options.userAgent) {
			await page.setUserAgent(options.userAgent)
		}
		if (!isEmptyObject(p)) {
			await page.authenticate({ username: p.username || "", password: p.password || "" })
		}
		return {
			browser,
			page,
			proxy: p,
		}
	}

	public async snapshot(page: puppeteer.Page, name: string): Promise<ISnapshotDTO> {
		const res: ISnapshotDTO = { html: "", image: "" }

		const shot = await page.screenshot({ type: "jpeg", fullPage: true, encoding: "base64" })
		res.image = await this.buster.saveBase64(shot.toString(), name + ".jpg")
		res.html = await this.buster.saveText(await page.content(), name + ".html")
		return res
	}

	public async waitForOneOfSelectors(page: puppeteer.Page, selectors: string[], options?: puppeteer.PageFnOptions): Promise<string> {
		const handler = (sels: string[]) => {
			for (const sel of sels) {
				const el = document.querySelector(sel)
				if (el) {
					return sel.toString()
				}
			}
			return false
		}
		let res: puppeteer.JSHandle
		try {
			res = await page.waitForFunction(handler, options, selectors)
		} catch (err) {
			throw new Error("Not able to find one of the following CSS selectors:" + selectors)
		}
		return res.jsonValue() as Promise<string>
	}
}
