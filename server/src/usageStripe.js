import { VOICE_USAGE_POLICY } from './usagePolicy.js';

export function loadUsageBillingConfig(env, basePriceIds, { production }) {
  const enabled = String(env.STRIPE_USAGE_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    if (production) throw new Error('STRIPE_USAGE_ENABLED=true is required for production Stripe billing');
    return null;
  }
  const priceId = env.STRIPE_OVERAGE_MONTHLY_PRICE_ID, meterId = env.STRIPE_USAGE_METER_ID, eventName = env.STRIPE_USAGE_EVENT_NAME;
  if (typeof priceId !== 'string' || !/^price_[A-Za-z0-9_]+$/.test(priceId)) throw new Error('STRIPE_OVERAGE_MONTHLY_PRICE_ID is required');
  if (typeof meterId !== 'string' || !/^mtr_[A-Za-z0-9_]+$/.test(meterId)) throw new Error('STRIPE_USAGE_METER_ID is required');
  if (typeof eventName !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(eventName)) throw new Error('STRIPE_USAGE_EVENT_NAME is required');
  const basePrices = {};
  for (const [plan,intervals] of Object.entries(basePriceIds)) {
    for (const [interval,id] of Object.entries(intervals)) {
      if (priceId === id) throw new Error('Overage and base Price IDs must be distinct');
      basePrices[id] = { plan,interval };
    }
  }
  return Object.freeze({ priceId,meterId,eventName,basePrices:Object.freeze(basePrices),livemode:/^(?:sk|rk)_live_/.test(env.STRIPE_SECRET_KEY) });
}

export async function verifyUsageBillingCatalog(stripe, config) {
  if (!config) return;
  const [price,meter,...bases] = await Promise.all([
    stripe.prices.retrieve(config.priceId),stripe.billing.meters.retrieve(config.meterId),
    ...Object.keys(config.basePrices).map(id=>stripe.prices.retrieve(id))
  ]);
  const reference = value => typeof value === 'string' ? value : value?.id;
  if (price.id !== config.priceId || !price.active || price.livemode !== config.livemode ||
      price.type !== 'recurring' || price.billing_scheme !== 'per_unit' || price.unit_amount !== VOICE_USAGE_POLICY.overageUnitCents ||
      price.unit_amount_decimal !== undefined && price.unit_amount_decimal !== null && price.unit_amount_decimal !== '35' ||
      price.transform_quantity || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 ||
      price.recurring?.usage_type !== 'metered' || reference(price.recurring?.meter) !== config.meterId) {
    throw new Error('Unsafe Stripe usage price: require an active monthly metered price at exactly 35 cents/minute');
  }
  if (meter.id !== config.meterId || meter.status !== 'active' || meter.livemode !== config.livemode ||
      meter.event_name !== config.eventName || meter.default_aggregation?.formula !== 'sum' || meter.event_time_window ||
      meter.customer_mapping?.type !== 'by_id' || meter.customer_mapping?.event_payload_key !== 'stripe_customer_id' ||
      meter.value_settings?.event_payload_key !== 'value') throw new Error('Unsafe Stripe usage meter configuration');
  for (const base of bases) {
    const selection = config.basePrices[base.id];
    const amount = selection?.plan === 'Operator' ? 11900 : selection?.plan === 'QuoteDone' ? 27900 : null;
    if (!selection || !base.active || base.livemode !== config.livemode || base.currency !== price.currency ||
        base.unit_amount !== amount * (selection.interval === 'annual' ? 10 : 1) ||
        base.billing_scheme !== 'per_unit' || base.transform_quantity ||
        base.recurring?.interval !== (selection.interval === 'annual' ? 'year' : 'month') ||
        base.recurring?.interval_count !== 1 || base.recurring?.usage_type !== 'licensed') throw new Error('Unsafe Stripe base plan price');
  }
}
