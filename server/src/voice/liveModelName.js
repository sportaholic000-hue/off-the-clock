// Startup, readiness and the provider boundary must accept the same names.
const LIVE_MODEL=/^[A-Za-z0-9][A-Za-z0-9._/-]*live[A-Za-z0-9._/-]*$/i;
export const validLiveModelName=value=>typeof value==='string'&&value.length<=128&&LIVE_MODEL.test(value);
