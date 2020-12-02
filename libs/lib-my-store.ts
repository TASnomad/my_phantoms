declare module "puppeteer" {
	class FrameBase {
		// eslint:disable-next-line:no-any
		public evaluate<T>(fn: EvaluateFn, ...args: any[]): Promise<T>
	}
}

export interface IObject { [k: string]: unknown }
