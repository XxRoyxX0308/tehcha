export function startDevDb(opts?: { port?: number; dataDir?: string; database?: string; fresh?: boolean }): Promise<{ url: string; stop: () => Promise<void> }>
