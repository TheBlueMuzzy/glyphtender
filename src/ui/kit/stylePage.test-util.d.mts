// Types for stylePage.test-util.mjs (the kit's look tests' browser page).
import type { Browser, Page } from 'playwright'

export function openBrowser(): Promise<Browser>
export function showInStyle(page: Page, preset: string, markup: string): Promise<void>
export function sizesOf(page: Page, selector: string): Promise<string[]>
