import {accountStatus, resendVerification, resendVerificationPublic, verifyEmail} from './auth.js';

export function installAccountRoutes(app, {requireAuth, asyncHandler}) {
  const account = requireAuth(['owner', 'staff']);
  app.get('/api/auth/account', account, accountStatus);
  app.post('/api/auth/account/resend-verification', account, asyncHandler(resendVerification));
  app.post('/api/auth/resend-verification', asyncHandler(resendVerificationPublic));
  app.post('/api/auth/verify-email', verifyEmail);
}
