/** Skip Prisma hydrate/persist for tests or environments without DB ledger. */
export function isEcoLedgerDbPersistenceSkipped(): boolean {
  return typeof process !== 'undefined' && process.env.TRIP_ECO_LEDGER_DB_SKIP === '1';
}
