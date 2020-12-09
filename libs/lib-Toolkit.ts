import { createHash } from "crypto"
import { URL } from "url"
import { format } from "util"
import needle from "needle"
import Buster from "phantombuster"
import validator from "is-my-json-valid"
import { IObject, isEmptyObject } from "./lib-my-store"
import * as Papa from "papaparse"

type LogType = "error" | "warning" | "info" | "loading" | "done" | "debug"

type LogTypeLookup = { [k in LogType]: string }

interface IRemainingTimeDTO {
	timeLeft: boolean
	message: string|number
	timeValue?: number
}

interface IProxyDTO extends IProxy {
	proxy: "http" | "pool" | "none" // FIXME: check if the endpoint can return "value"
}

export interface IProxy {
	address: string
	username?: string
	password?: string
}

export class Downloader {

	public static readonly gDocsUrlPattern = "https://docs.google.com/spreadsheets/d/"
	public static readonly gDriveUrlPattern = "https://drive.google.com/uc?id="

	public static downloadCsv(url: string): Promise<string> {
		return new Promise((resolve, reject) => {
			// eslint-disable-next-line prefer-const
			let hasTimeout = false

			const h = needle.get(url, { follow_max: 5, follow_set_cookie: true }, (err, r) => {
				if (err) {
					reject(err)
				}

				if (hasTimeout) {
					reject("Can't download CSV due to a socket hang up with HTTP code: " + r.statusCode || -1)
				}

				if (r && r.statusCode && r.statusCode >= 400) {
					reject(url + "is not available due to HTTP code: " + r.statusCode || -1)
				}

				if (r) {
					resolve(r.raw.toString())
				}
				reject("No HTTP response found")
			})

			h.on("timeout", () => { hasTimeout = true })
		})
	}

	public static async downloadCsvFromGoogle(url: string): Promise<string> {
		const u = new URL(url)
		let downloadUrl = ""

		if (u.hostname === "docs.google.com") {
			let gid = ""
			let docId = u.pathname.split("/edit").pop()

			docId = docId?.endsWith("/edit") ? docId.split("/edit").shift() : docId
			docId = docId?.endsWith("/") ? docId.slice(0, -1) : docId

			if (u.hash && u.hash.indexOf("gid=") > -1) {
				gid = u.hash.split("gid=").pop() || ""
			}

			downloadUrl = Downloader.gDocsUrlPattern + docId + "/export?format=csv"
			if (gid) {
				downloadUrl += "&gid=" + gid
			}
		} else if (u.hostname === "drive.google.com") {
			if (u.pathname === "open" && u.searchParams.get("id")) {
				let docId = u.searchParams.get("id")

				docId = docId?.endsWith("/") ? docId?.slice(0, -1) : ""
				downloadUrl = Downloader.gDriveUrlPattern + docId + "&export=download"
			} else if (u.pathname.startsWith("file/d/")) {
				let docId = u.pathname.replace("file/d", "")

				docId = docId.indexOf("/") > -1 ? docId.split("/").shift() || "" : docId
				downloadUrl = await Downloader.getGDriveSecureLink(Downloader.gDriveUrlPattern + docId + "&export=download")
			}
		}

		if (!downloadUrl) {
			throw new Error("Can't download URL: " + url)
		}
		return Downloader.downloadCsv(downloadUrl)
	}

	private static getGDriveSecureLink(url: string): Promise<string> {
		return new Promise((resolve, reject) => {
			needle.get(url, (err, resp) => {
				if (err) {
					reject(err)
				}
				if (resp.statusCode && resp.statusCode === 302) {
					resolve(resp.headers.location as string)
				}
				reject(url + "is not a valid CSV")
			})
		})
	}
}

export default class Toolkit {

	public static readonly logTypes: LogTypeLookup = {
		debug: "\u{1F41B}",
		done: "\u2705",
		error: "\u274C",
		loading: "\u{1F504}",
		info: "\u2139\uFE0F",
		warning: "\u26A0\uFE0F",
	};

	private buster: Buster
	private static readonly phantombusterServerUrl: string = process.argv[2] || ""
	private static readonly phantombusterProxyPoolEndpoint = "api/v1/proxies/pools.json"
	private static verbose = true
	private minTimeLeftBeforeExit = -1

	constructor(buster: Buster) {
		this.buster = buster
	}

	public static isUrl(url: string): boolean {
		try {
			new URL(url)
		} catch (err) {
			return false
		}
		return true
	}

	public static async getIP(): Promise<string> {
		const res = await needle("get", "https://ipinfo.io/ip")
		if (res.statusCode === 200) {
			return res.raw.toString()
		}
		return ""
	}

	public static toggleVerbose(): void {
		Toolkit.verbose = !Toolkit.verbose
	}

	public static log(type: LogType, ...args: unknown[]): void {
		if (Toolkit.verbose) {
			console.log("%s", Toolkit.logTypes[type], ...args)
		}
	}

	public static logf(type: LogType, fmt: string, ...args: unknown[]): void {
		if (Toolkit.verbose) {
			console.log(`${Toolkit.logTypes[type]} ${fmt}`, ...args)
		}
	}

	public static dedupeArray(arr: IObject[]): IObject[] {
		const res: IObject[] = []
		const o: { [key: string]: IObject } = {}
		const len = arr.length

		for (let i = 0; i < len; i++) {
			const f = createHash("sha1").update(format("%o", arr[i])).digest("base64")
			o[f] = arr[i] as IObject

		}

		const keys = Object.keys(o)
		for (const k of keys) {
			res.push(o[k] as IObject)
		}
		return res
	}

	public static dedupeArrayByFieldName(arr: IObject[], field: string): IObject[] {
		const res: IObject[] = []
		const o: { [key: string]: IObject } = {}
		const len = arr.length

		for (let i = 0; i < len; i++) {
			const value = (arr[i] as IObject)[field] as string
			o[value] = arr[i] as IObject

		}

		const keys = Object.keys(o)
		for (const k of keys) {
			res.push(o[k] as IObject)
		}
		return res
	}

	public validateArguments(): IObject {
		if (this.buster.argumentSchema) {
			const validate = validator(this.buster.argumentSchema)
			if (!validate(this.buster.argument)) {
				let errMsg = "Error: the Phantom configuration is not valid due to:"
				for (const err of validate.errors) {
					errMsg += "\n\t-" + err.field.replace("data.", "") + " => " + err.message
				}
				Toolkit.logf("debug", "Arguments: %s", this.buster.arguments)
				throw new Error(errMsg)
			}
		}
		return this.buster.arguments as IObject
	}

	public async hasTimeLeft(): Promise<IRemainingTimeDTO> {
		let remainingTime: number

		try {
			remainingTime = await this.buster.getTimeLeft()
		} catch (err) {
			return { timeLeft: true, message: 1000 }
		}

		if (this.minTimeLeftBeforeExit < 0) {
			if (remainingTime > (15 * 60)) {
				this.minTimeLeftBeforeExit = 3 * 60 // Exits 3 mins before consuming all execution time
			} else {
				this.minTimeLeftBeforeExit = 30 // Exits 30 seconds before consuming all execution time
			}
		}
		if (remainingTime < 0) {
			return { timeLeft: false, message: "Aborted by the user" }
		} else if (remainingTime <= this.minTimeLeftBeforeExit) {
			return { timeLeft: false, message: "Less than " + this.minTimeLeftBeforeExit + " seconds left." }
		}
		return { timeLeft: true, message: remainingTime, timeValue: remainingTime }
	}

	public static async fetchCSV(url: string): Promise<IObject[][]> {
		const u = new URL(url)
		let rawContent = ""

		switch (u.hostname) {
		case "docs.google.com":
		case "drive.google.com":
			rawContent = await Downloader.downloadCsvFromGoogle(url)
			break
		default:
			rawContent = await Downloader.downloadCsv(url)
		}

		if (!rawContent) {
			throw new Error("Empty file!")
		}

		const raw = Papa.parse<IObject[]>(rawContent)
		const data: IObject[][] = raw.data

		if (raw.errors.find((err) => err.code === "MissingQuotes")) {
			throw new Error(url + " does not represent a CSV file")
		}

		const doctypePattern = "<!dcotype html"
		const downloadSub = rawContent.trim().substring(0, doctypePattern.length).toLowerCase()

		if (downloadSub === doctypePattern || downloadSub.match(/(<[^>]+)>)/ig)) {
			throw new Error(url + " does not represent a CSV file")
		}
		return data
	}

	// FIXME: yikes, let's try to rewrite this method in the TS way
	public static extractCsvRows<T>(csv: unknown[][], column: string | undefined | string[], fallbackColumnIndex: number): T[] {
		const rows: T[] = []

		if (typeof column === "string" && column) {
			let col = fallbackColumnIndex
			if (!csv[0]) {
				throw new Error("Empty header column")
			}
			const headers: string[] = (csv[0] as unknown[]) as string[]
			const idx = headers.findIndex((el) => el === column)
			if (idx < 0) {
				col = fallbackColumnIndex
			} else {
				csv.shift()
			}
			rows.push(...(csv as T[][]).map((l) => l[col] as T))
		} else if (Array.isArray(column)) {
			const columns = Object.assign([], column)
			const fieldsPos: Array<{ name: string, position: number }> = []

			if (!columns[0]) {
				fieldsPos.push({ name: "0", position: 0 })
				columns.shift()
			}

			for (const col of columns) {
				let idx = csv[0]?.findIndex((cell) => cell === col) || -1
				if (idx < 0) {
					idx = fallbackColumnIndex
				}
				fieldsPos.push({ name: col, position: idx })
			}

			if (!Toolkit.isUrl((csv[0] as string[])[0] as string)) {
				csv.shift()
			}

			rows.push(...csv.map((el) => {
				const cell: unknown = {}

				fieldsPos.forEach((f) => (cell as IObject)[f.name] = el[f.position])
				return cell as T
			}))
		} else {
			const col = fallbackColumnIndex || 0
			rows.push(...(csv as T[][]).map((l) => l[col] as T))
		}

		return rows
	}

	public static async fetchCSVColumn(url: string, columnName?: string): Promise<string[]> {
		const data = await Toolkit.fetchCSV(url)

		return Toolkit.extractCsvRows<string>(data, columnName, 0)
	}

	public async fetchConfiguredProxy(): Promise<IProxy> {
		const h: needle.NeedleOptions = { headers: { "X-Phantombuster-Key-1": this.buster.apiKey } }
		const resp = await needle("get", Toolkit.phantombusterServerUrl + "api/v1/agent" + this.buster.agentId, {}, h)
		const p = resp.body.data ? resp.body.data.proxy as IProxyDTO : {} as IProxyDTO

		if (!isEmptyObject(p) && p.proxy === "http") {
			return {
				address: p.address,
				username: p.username,
				password: p.password,
			}
		} else if (!isEmptyObject(p) && p.proxy === "pool") {
			const r = await needle("get", Toolkit.phantombusterServerUrl + Toolkit.phantombusterProxyPoolEndpoint, {}, h)
			const pools = r.body.data as IProxyDTO[]
			const p  = pools[Math.floor(Math.random() * pools.length)]
			return {
				address: p ? p.address || "" : "",
				username: p ? p.username : "",
				password: p ? p.password : "",
			}
		}
		return {} as IProxy
	}

	private static getCleanedFilenameForS3(filename: string): string {
		return filename.replace(/[%#+-?\\,|]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
	}

	public saveCSV(csv: IObject[][], headers?: string[], name = "result"): Promise<string> {
		const h = Array.isArray(headers) ? headers : Toolkit.getFieldsFromArray(csv)
		return this.buster.saveText(Papa.unparse({ fields: h, data: csv }), Toolkit.getCleanedFilenameForS3(name) + ".csv")
	}

	public saveJSON(json: IObject[][], name = "result"): Promise<string> {
		return this.buster.saveText(JSON.stringify(json), Toolkit.getCleanedFilenameForS3(name) + ".csv")
	}

	private static getFieldsFromArray(arr: IObject[][]): string[] {
		const fields: string[] = []

		for (const cell of arr) {
			if (!isEmptyObject(cell)) {
				for (const f of Object.keys(cell)) {
					if (fields.indexOf(f) < 0) {
						fields.push(f)
					}
				}
			}
		}
		return fields
	}
}
