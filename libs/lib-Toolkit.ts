import { URL } from "url"
import needle from "needle"
import Buster from "phantombuster"
import validator from "is-my-json-valid"
import { IObject } from "./lib-my-store"

type LogType = "error" | "warning" | "info" | "loading" | "done" | "debug"

type LogTypeLookup = { [k in LogType]: string }

interface IRemainingTimeDTO {
	timeLeft: boolean
	message: string|number
	timeValue?: number
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
	private static verbose: boolean = true
	private minTimeLeftBeforeExit: number = -1

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

	public static toggleVerbose() {
		Toolkit.verbose = !Toolkit.verbose
	}

	public static log(type: LogType, ...args: unknown[]) {
		if (!Toolkit.verbose) {
			console.log("%s:", Toolkit.logTypes[type], ...args)
		}
	}

	public static logf(type: LogType, fmt: string, ...args: unknown[]) {
		if (!Toolkit.verbose) {
			console.log(`${Toolkit.logTypes[type]} ${fmt}`, ...args)
		}
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
}
