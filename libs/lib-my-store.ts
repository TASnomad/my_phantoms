declare module "puppeteer" {
	class FrameBase {
		// eslint:disable-next-line:no-any
		public evaluate<T>(fn: EvaluateFn, ...args: any[]): Promise<T>
	}
}

export interface IObject { [k: string]: unknown }

export function isEmptyObject(o: object): o is IObject {
	return typeof o === "object" && o !== null && Object.keys(o).length < 1
}
