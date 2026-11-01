// Types for e2e.mjs (a game's TypeScript test scripts may import it too). `page` = a Playwright Page.
type PageLike = { locator: (selector: string) => { count: () => Promise<number>; first: () => { getAttribute: (name: string, options?: { timeout?: number }) => Promise<string | null> } } }

export declare const META_SELECTOR: 'meta[name="app-version"]'
export declare function expectedVersion(gameDir?: string, env?: Record<string, string | undefined>): string
export declare function staleMessage(shown: string | null, want: string): string
export declare function checkVersion(page: PageLike, want?: string): Promise<string>
export declare function builtVersion(distDir?: string): string | null
export declare function versionInHtml(html: string): string | null
