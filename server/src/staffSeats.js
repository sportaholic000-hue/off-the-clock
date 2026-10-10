// One owner login remains available on every plan; these are additional seats.
export function staffLimit(plan) {
  if (plan === 'Scale') return Infinity;
  if (plan === 'Operator' || plan === 'QuoteDone') return 1;
  return 0; // Starter, unknown and future plans require an explicit seat ruling.
}
