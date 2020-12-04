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
interface IApiParams extends IObject {
	url: string
}
// }

const goToPage = async (page: puppeteer.Page, url: string) => {
	await page.goto(url)

	await page.waitFor(5000)
	return phantom.snapshot(page, Date.now() + "-test-open")
}

(async () => {
	const args = tk.validateArguments()
	const { url } = args as IApiParams
	const { browser, page } = await phantom.initBrowser()

	Toolkit.logf("loading", "Loading %s...", url)
	const { html, image } = await goToPage(page, url)
	Toolkit.logf("done", "%s loaded, HTML dump saved at '%s' & JPG dump saved at '%s'", url, html, image)
	await page.close()
	await browser.close()
	process.exit(0)
})()
.catch((err: Error) => {
	Toolkit.logf("error", "Fatal Phantom execution error: '%s'\nStacktrace:\n", err.message, err.stack || "no stacktrace available")
	process.exit(1)
})
