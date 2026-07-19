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

migrate();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/schema', (_req, res) => res.json({ createTableStatements: CREATE_TABLE_STATEMENTS }));

app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/reset-password', resetPassword);
app.get('/api/auth/verify-email', verifyEmail);
app.post('/api/admin/login', adminLogin);

app.get('/api/dashboard', requireAuth(['owner', 'staff']), (req, res) => {
  res.json({ ownerId: req.ownerId, shell: 'dashboard', sections: ['Home', 'Calls', 'Leads', 'Quotes', 'Customers', 'Price Book', 'Calendar', 'Settings'] });
});

app.get('/api/admin', requireAuth(['admin']), (_req, res) => {
  res.json({ shell: 'admin', sections: ['Accounts list', 'Provisioning failures', 'A2P status', 'Platform metrics', 'Global kill switches', 'Support impersonation placeholder'] });
});

app.listen(port, () => {
  console.log(`Off The Clock AI server listening on ${port}`);
});

export default app;
