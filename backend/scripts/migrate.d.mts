export function migrate(connectionString: string, opts?: { reset?: boolean; seed?: boolean; seedIfEmpty?: boolean; log?: (s: string) => void }): Promise<void>
