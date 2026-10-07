// Keep startup, registration and password recovery on one supported contract.
export function passwordHashCost(environment = process.env) {
  const raw = environment.BCRYPT_COST;
  const cost = raw === undefined || raw === '' ? 12 : Number(raw);
  if (!Number.isInteger(cost) || cost < 12 || cost > 16) {
    throw new Error('BCRYPT_COST must be an integer from 12 through 16.');
  }
  return cost;
}
