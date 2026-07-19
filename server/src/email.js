export async function sendTransactionalEmail({ to, subject, text }) {
  const provider = process.env.EMAIL_PROVIDER || 'console';

  if (provider === 'console' || process.env.NODE_ENV !== 'production') {
    console.info('[email:console]', { to, subject, text });
    return { provider: 'console', accepted: true };
  }

  throw new Error(`EMAIL_PROVIDER ${provider} is not configured yet`);
}
