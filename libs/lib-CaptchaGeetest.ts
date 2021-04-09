import {
	unlinkSync,
	writeFileSync,
} from "fs"
import puppeteer from "puppeteer-core"
import Jimp from "jimp"
import pixelmatch from "pixelmatch"
import { cv } from "opencv-wasm"

import Toolkit from "./lib-Toolkit"

export default class GeetestSolver {

	public static readonly CATPCHA_FILE: string = "/tmp/captcha.png"
	public static readonly PUZZLE_FILE: string = "/tmp/puzzle.png"
	public static readonly ORIGINAL_FILE: string = "/tmp/ogirinal.png"
	public static readonly DIFF_FILE: string = "/tmp/diff.png"

	public static async solve(page: puppeteer.Page): Promise<void> {
		const xPathOpenChallenge = "//*[contains(text(), \"Click to verify\")]"
		const frames = page.frames()
		const f = frames[frames.length -1] as puppeteer.Frame

		await f.waitForXPath(xPathOpenChallenge)
		const els = await page.$x(xPathOpenChallenge)
		if (els.length < 1) {
			throw new Error("Not able to open the geetest captcha challenge")
		}
		await (els[0] as puppeteer.ElementHandle).click()
		await f.waitForSelector(".geetest_canvas_img canvas", { visible: true })
		await Toolkit.wait(1000)

		Toolkit.log("info", "Saving challenge images...")
		await GeetestSolver.saveChallengeImages(f)
		Toolkit.log("info", "Saving challenge diff image...")
		await GeetestSolver.saveChallengeDiffImage()

		await Toolkit.wait(1000)

		const [ cx, cy ] = await GeetestSolver.findDiffPosition()
		Toolkit.logf("debug", "Diff position: %d,%d", cx, cy)

		const slider = await f.$(".geetest_slider_button") as puppeteer.ElementHandle
		const handle = await slider.boundingBox() as puppeteer.BoundingBox

		let xPos = handle.x + handle.width / 2
		let yPos = handle.y + handle.height / 2

		Toolkit.logf("debug", "Moving cursor to: %d,%d", xPos, yPos)
		await page.mouse.move(xPos, yPos)
		await page.mouse.down()
		xPos = handle.x + (cx as number) - handle.width / 2
		yPos = handle.y + handle.height / 3

		Toolkit.logf("debug", "Moving cursor to: %d,%d", xPos, yPos)
		await page.mouse.move(xPos, yPos, { steps: 25 })
		await Toolkit.wait(1000)

		const [ cxPuzzle, cyPuzzle ] = await GeetestSolver.findPuzzlePosition(f)
		Toolkit.logf("debug", "Puzzle position: %d,%d", cxPuzzle, cyPuzzle)
		xPos = xPos + (cx as number) - (cxPuzzle as number)
		yPos = yPos + handle.height / 2
		Toolkit.logf("debug", "Moving cursor to: %d,%d", xPos, yPos)
		await page.mouse.move(xPos, yPos, { steps: 5 })
		// await Toolkit.wait(1000)
		await page.mouse.up()
		GeetestSolver.cleanupFiles()
	}

	private static cleanupFiles(): void {
		unlinkSync(GeetestSolver.CATPCHA_FILE)
		unlinkSync(GeetestSolver.PUZZLE_FILE)
		unlinkSync(GeetestSolver.ORIGINAL_FILE)
		unlinkSync(GeetestSolver.DIFF_FILE)
	}

	private static async findDiffPosition(): Promise<number[]> {
		const srcImg = await Jimp.read(GeetestSolver.DIFF_FILE)
		const src = cv.matFromImageData(srcImg.bitmap)
		const dst = new cv.Mat()
		const k = cv.Mat.ones(5, 5, cv.CV_8UC1)
		const a = new cv.Point(-1, -1)

		cv.threshold(src, dst, 127, 255, cv.THRESH_BINARY)
		cv.erode(dst, dst, k, a, 1)
		cv.dilate(dst, dst, k, a, 1)
		cv.erode(dst, dst, k, a, 1)
		cv.dilate(dst, dst, k, a, 1)

		cv.cvtColor(dst, dst, cv.COLOR_BGR2GRAY)
		cv.threshold(dst, dst, 150, 255, cv.THRESH_BINARY_INV)

		const contours = new cv.MatVector()
		const hierarchy = new cv.Mat()

		cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

		const countor = contours.get(0)
		const moment = cv.moments(countor)
		return [Math.floor(moment.m10 / moment.m00), Math.floor(moment.m01 / moment.m00)]
	}

	private static async findPuzzlePosition(page: puppeteer.Page|puppeteer.Frame): Promise<number[]> {
		const images = await page.$$eval(".geetest_canvas_img canvas", (canvas) => {
			return canvas.map((c) => (c as HTMLCanvasElement).toDataURL().replace(/^data:image\/png;base64,/, ""))
		})
		writeFileSync(GeetestSolver.PUZZLE_FILE, images[1] || "", "base64")

		const srcPuzzleImg = await Jimp.read(GeetestSolver.PUZZLE_FILE)
		const srcPuzzle = cv.matFromImageData(srcPuzzleImg.bitmap)
		const dstPuzzle = new cv.Mat()

		cv.cvtColor(srcPuzzle, srcPuzzle, cv.COLOR_BGR2GRAY)
		cv.threshold(srcPuzzle, dstPuzzle, 127, 255, cv.THRESH_BINARY)

		const k = cv.Mat.ones(5, 5, cv.CV_8UC1)
		const a = new cv.Point(-1, -1)
		const contours = new cv.MatVector()
		const hierarchy = new cv.Mat()

		cv.dilate(dstPuzzle, dstPuzzle, k, a, 1)
		cv.erode(dstPuzzle, dstPuzzle, k, a, 1)
		cv.findContours(dstPuzzle, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

		const countor = contours.get(0)
		const moment = cv.moments(countor)
		return [Math.floor(moment.m10 / moment.m00), Math.floor(moment.m01 / moment.m00)]
	}

	private static async saveChallengeImages(page: puppeteer.Page|puppeteer.Frame): Promise<void> {
		const images = await page.$$eval(".geetest_canvas_img canvas", (canvas) => {
			return canvas.map((c) => (c as HTMLCanvasElement).toDataURL().replace(/^data:image\/png;base64,/, ""))
		})
		writeFileSync(GeetestSolver.CATPCHA_FILE, images[0] || "", "base64")
		writeFileSync(GeetestSolver.PUZZLE_FILE, images[1] || "", "base64")
		writeFileSync(GeetestSolver.ORIGINAL_FILE, images[2] || "", "base64")
	}

	private static async saveChallengeDiffImage(): Promise<void> {
		const orgImg = await Jimp.read(GeetestSolver.ORIGINAL_FILE)
		const chalImg = await Jimp.read(GeetestSolver.CATPCHA_FILE)

		const { width, height } = orgImg.bitmap
		const diffImg = new Jimp(width, height)
		const diffOpts: pixelmatch.PixelmatchOptions = { includeAA: true, threshold: 0.2 }
		pixelmatch(orgImg.bitmap.data, chalImg.bitmap.data, diffImg.bitmap.data, width, height, diffOpts)
		diffImg.write(GeetestSolver.DIFF_FILE)
	}

}
