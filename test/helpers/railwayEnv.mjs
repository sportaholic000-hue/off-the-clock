import {randomBytes} from 'node:crypto';
export function productionEnv(volume,patch={}) {
  return {NODE_ENV:'production',APP_DATA_DIR:volume,RAILWAY_VOLUME_MOUNT_PATH:volume,
    TRUST_PROXY:'none',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'120',
    JWT_SECRET:randomBytes(48).toString('hex'),CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
    BOOKING_SLOT_TOKEN_SECRET:randomBytes(48).toString('hex'),
    PUBLIC_BASE_URL:'https://app.offtheclockai.com',CLIENT_URL:'https://app.offtheclockai.com',
    CORS_ALLOWED_ORIGINS:'https://app.offtheclockai.com',PORT:'3000',
    ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',
    EMAIL_DELIVERY_ENABLED:'false',OUTBOUND_WEBHOOKS_ENABLED:'false',DEMO_ENABLED:'false',...patch};
}
