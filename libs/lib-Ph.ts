import {IObject} from "./lib-my-store"

/**
 * @classdesc phantombuster module successor
 * This class aims to give the same (with a better implementation) module API
 */
export default class Phantombuster {
	/**
	 * phantombuster module readonly
	 * mostly found in program argument
	 */
	public static readonly apiServer: string = process.argv[2] || ""
	public static readonly apiKey: string = process.argv[3] || ""
	public static readonly argument: string = process.argv[4] || "" // Raw string
	public static readonly agentId: number = Number.parseInt(process.argv[5] as string)
	public static readonly containerId: number = Number.parseInt(process.argv[6] as string)
	public static readonly proxyAddress: string = process.argv[7] || ""
	public static readonly retryCount: number = Number.parseInt(process.argv[8] as string)
	public static readonly maxRetries: number = Number.parseInt(process.argv[9] as string)

	/**
	 * internal fields used for argument inflaters
	 */
	private static schema: IObject | undefined = undefined
	private static schemaRead: boolean = false
	private static parsedArguments: IObject | undefined = undefined

	// HACK: it's gross to ignore this error
	// but phantombuster has an arguments property...
	// @ts-ignore
	public static get arguments(): IObject {
		if (typeof Phantombuster.parsedArguments === "undefined") {
			try {
				Phantombuster.parsedArguments = JSON.parse(Phantombuster.argument)
			} catch (err) {
				Phantombuster.parsedArguments = {}
			}
		}
		return Phantombuster.parsedArguments as IObject
	}

	public static get argumentSchema(): IObject|undefined {
		if (!Phantombuster.schemaRead) {
			try {
				if (typeof process.argv[10] === "string") {
					Phantombuster.schema = JSON.parse(process.argv[10] as string)
				}
			} catch (err) {
				// ...
			}
			Phantombuster.schemaRead
		}
		return Phantombuster.schema
	}
}
