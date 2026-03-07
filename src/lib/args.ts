export function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

export function parseListFlag(args: string[], flag: string): string[] | undefined {
  const value = parseFlag(args, flag)
  if (!value) return undefined
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

export function parseIntFlag(args: string[], flag: string): number | undefined {
  const value = parseFlag(args, flag)
  if (!value) return undefined
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}
