// Phantombuster configuration {
"phantombuster command: nodejs"
"phantombuster package: 5"
"phantombuster dependencies: lib-my-store.js, lib-Phantom.js, lib-Toolkit.js"

import Buster from "phantombuster"
import puppeteer from "puppeteer"
import Toolkit from "./lib-Toolkit"
import Phantom from "./lib-Phantom"
import { IObject } from "./lib-my-store"

const buster = new Buster()
const tk = new Toolkit(buster)
const phantom = new Phantom(buster)

interface IPhantomParams extends IObject {
	accessToken: string
	access: string
	refreshToken: string
}
// }

const loginInPayfit = async (page: puppeteer.Page, accessToken: string, access: string, refreshToken: string): Promise<string> => {
	const loginCSSpath = "div[data-testid*=Avatar] h5"

	try {
		await page.setCookie({
			name: "accessToken",
			value: accessToken,
			domain: ".payfit.com",
			httpOnly: true,
			secure: true,
		}, {
			name: "access",
			value: access,
			domain: ".payfit.com",
			httpOnly: true,
			secure: true,
		}, {
			name: "refreshToken",
			value: refreshToken,
			domain: ".payfit.com",
			httpOnly: true,
			secure: true
		})
		await page.goto("https://app.payfit.com")
		await page.waitForSelector(loginCSSpath)
	} catch (err) {
		Toolkit.log("debug", err)
		throw new Error("Error while connecting to Payfit")
	}
	return page.evaluate<string>((sel: string) => {
		const el = document.querySelector(sel)
		if (!el) {
			throw new Error("CSS selector " + sel + " not found while checking login")
		}
		return el.textContent ? el.textContent.trim() : ""
	}, loginCSSpath)
}

(async () => {
	const args = tk.validateArguments()
	const {
		access,
		accessToken,
		refreshToken,
	} = args as IPhantomParams

	const { browser, page } = await phantom.initBrowser()

	Toolkit.log("loading", "Connecting to Payfit...")
	const username = await loginInPayfit(page, accessToken, access, refreshToken)
	Toolkit.logf("done", "Successfuly connected as %s", username)
	await phantom.snapshot(page, `${Date.now()}-login`)
	await page.close()
	await browser.close()
	process.exit(0)
})()
.catch((err: Error) => {
	Toolkit.logf("error", "Fatal Phantom execution error: '%s'\nStacktrace:\n", err.message, err.stack || "no stacktrace available")
	process.exit(1)
})
