/**
 * Tiny classnames combinator — joins truthy class values, skips
 * falsy ones. No dependency needed for this small a job.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
 return classes.filter(Boolean).join(" ");
}