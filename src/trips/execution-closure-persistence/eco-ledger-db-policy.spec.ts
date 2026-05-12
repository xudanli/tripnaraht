import { isEcoLedgerDbPersistenceSkipped } from './eco-ledger-db-policy';

describe('eco-ledger-db-policy', () => {
  const prev = process.env.TRIP_ECO_LEDGER_DB_SKIP;

  afterEach(() => {
    process.env.TRIP_ECO_LEDGER_DB_SKIP = prev;
  });

  it('skips when TRIP_ECO_LEDGER_DB_SKIP=1', () => {
    process.env.TRIP_ECO_LEDGER_DB_SKIP = '1';
    expect(isEcoLedgerDbPersistenceSkipped()).toBe(true);
  });
});
