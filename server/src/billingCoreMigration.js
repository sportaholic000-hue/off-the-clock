// The only rebuilt table is billingCheckoutRequests. Stripe can return a closed
// session with url=null after response loss; a completed session is still durable
// evidence, even when no redirect URL was ever receipted locally.
export function migrateBillingCheckoutRecovery(db,createSql) {
  const current=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='billingCheckoutRequests'").get()?.sql;
  if (!current || !current.includes("status IN ('OPEN', 'EXPIRED')")) return;
  const work=()=>{
    const columns=db.prepare('PRAGMA table_info(billingCheckoutRequests)').all().map(row=>`"${row.name}"`).join(',');
    db.exec(createSql.replace('IF NOT EXISTS billingCheckoutRequests','billingCheckoutRequests_recovery'));
    db.exec(`INSERT INTO billingCheckoutRequests_recovery (${columns}) SELECT ${columns} FROM billingCheckoutRequests`);
    db.exec('DROP TABLE billingCheckoutRequests');
    db.exec('ALTER TABLE billingCheckoutRequests_recovery RENAME TO billingCheckoutRequests');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Billing Checkout migration foreign key failure.');
  };
  if (typeof db.transaction==='function') return db.transaction(work).immediate();
  db.exec('BEGIN IMMEDIATE');
  try {work();db.exec('COMMIT');} catch(error) {db.exec('ROLLBACK');throw error;}
}
