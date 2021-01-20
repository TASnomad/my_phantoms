// import { Downloader } from "./lib-Toolkit"

export interface IStateful {
	round: number
}

export abstract class Stateful {
	abstract getCurrentRoundByFile(filename: string): Promise<number>
}
