// Local durable lifecycle transitions only; no provider operations or emails.
export function startBillingLifecycleWorker({service, intervalMs=60_000, onError=()=>{}, setTimer=setInterval, clearTimer=clearInterval}={}) {
  if (!service || typeof service.suspendExpiredGracePeriods !== 'function') throw new TypeError('Billing lifecycle service required.');
  let stopped=false;
  const tick=()=>{if(stopped)return;try {service.suspendExpiredGracePeriods({limit:100});} catch {onError('BILLING_GRACE_SWEEP_FAILED');}};
  tick(); // Replay after restart; SQLite commits transition and outbox together.
  const timer=setTimer(tick,intervalMs);timer?.unref?.();
  return ()=>{stopped=true;clearTimer(timer);};
}
