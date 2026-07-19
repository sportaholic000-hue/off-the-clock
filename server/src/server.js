import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { adminLogin, forgotPassword, login, register, resetPassword, verifyEmail, requireAuth } from './auth.js';
import { CREATE_TABLE_STATEMENTS } from './schema.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const app = express();
const port = Number(process.env.PORT || 3000);

// Route any async handler error to the global error handler instead of
// crashing the process (Express 4 does not catch async throws).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

migrate();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/schema', (_req, res) => res.json({ createTableStatements: CREATE_TABLE_STATEMENTS }));
}

app.post('/api/auth/register', asyncHandler(register));
app.post('/api/auth/login', asyncHandler(login));
app.post('/api/auth/forgot-password', asyncHandler(forgotPassword));
app.post('/api/auth/reset-password', asyncHandler(resetPassword));
app.get('/api/auth/verify-email', verifyEmail);
app.post('/api/admin/login', asyncHandler(adminLogin));

app.get('/api/dashboard', requireAuth(['owner', 'staff']), (req, res) => {
  res.json({ ownerId: req.ownerId, shell: 'dashboard', sections: ['Home', 'Calls', 'Leads', 'Quotes', 'Customers', 'Price Book', 'Calendar', 'Settings'] });
});

app.get('/api/admin', requireAuth(['admin']), (_req, res) => {
  res.json({ shell: 'admin', sections: ['Accounts list', 'Provisioning failures', 'A2P status', 'Platform metrics', 'Global kill switches', 'Support impersonation placeholder'] });
});

// Global error handler — never let a request error kill the process.
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Off The Clock AI server listening on ${port}`);
});

export default app;
