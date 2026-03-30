export const logger = {
  info: (msg: string) => console.log(`[info] ${msg}`),
  warn: (msg: string) => console.log(`[warn] ${msg}`),
  error: (msg: string) => console.log(`[error] ${msg}`),
  debug: (msg: string, enabled = false) => {
    if (enabled) console.log(`[debug] ${msg}`);
  },
};
