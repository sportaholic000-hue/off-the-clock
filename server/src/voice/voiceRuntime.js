// Composition root for live phone calls: Twilio webhook → signed one-time stream URL →
// Twilio Media Streams WebSocket → Gemini Live, with the business's compiled instructions
// and server-authoritative tools. Installed only when VOICE_RUNTIME_ENABLED=true.
import fs from 'node:fs';
import twilio from 'twilio';
import { GoogleGenAI } from '@google/genai';
import { installVoiceRuntimeRoutes, createVoiceWebSocketSessionCoordinator } from '../voiceRuntimeRoutes.js';
import { createVoiceWebSocketServer } from '../voiceWebSocketServer.js';
import { createTwilioRequestValidator } from './twilioValidation.js';
import { createVoiceTenantResolver } from './tenantResolver.js';
import { createVoiceSessionNonceService } from './sessionNonceService.js';
import { createVoiceNonceRepository, createVoiceSessionStore, findVoiceTenantsByNumber, loadVoiceAccountContext } from './voicePersistence.js';
import { createGeminiMediaBridge } from './geminiMediaBridge.js';
import { createGoogleGenAiLiveSessionOpener } from './googleGenAiLiveAdapter.js';
import { compileVoiceSystemInstruction } from './voicePromptCompiler.js';
import { VOICE_TOOL_DECLARATIONS } from './toolSchemas.js';
import { createVoiceToolRuntime } from './voiceToolRuntime.js';
import { createVoiceToolDispatcher } from './toolDispatcher.js';
import { hasOperatorAccess, trialVoiceCapDecision } from '../planAccess.js';
import { loadPricebook } from '../../priceBookService.js';
import { applicationStatus, applicationServiceName } from '../quoteDoneBridge.js';

export const GREETING_TURN = '[SYSTEM] The call has just connected. Say the greeting from the locked call rules now.';
const GUIDE_PATH = new URL('../../../specs/voice_quote_flows.md', import.meta.url);

// Customer-safe description of the services this business has live for quoting.
export function liveServicesForPrompt(book) {
  const services = Array.isArray(book?.services) ? book.services : [];
  const out = [];
  for (const service of services) {
    if (!service || service.active !== true) continue;
    let status;
    try { status = applicationStatus(service, book); } catch { continue; }
    if (status?.status !== 'QUOTING LIVE' || status?.approvalCurrent === false) continue;
    let label;
    try { label = applicationServiceName(service); } catch { continue; }
    out.push({ serviceType: service.serviceType, serviceLabel: String(label || service.serviceType), active: true, status: 'QUOTING LIVE', offerings: [] });
  }
  return out;
}

export function buildCallInstruction({ database, ownerId, guideText, loadBook = loadPricebook }) {
  const owner = database.prepare("SELECT businessName FROM users WHERE id = ? AND role = 'owner'").get(ownerId);
  const profile = database.prepare('SELECT agentName FROM businessProfiles WHERE ownerId = ?').get(ownerId);
  const book = loadBook(ownerId);
  return compileVoiceSystemInstruction({
    guideText,
    business: { businessName: owner?.businessName || 'the business', agentName: profile?.agentName || 'Nova' },
    services: liveServicesForPrompt(book),
  });
}

export function installVoiceRuntime(app, { database, env = process.env, genAiClient, now = () => Date.now(), onError = () => {} } = {}) {
  const guideText = fs.readFileSync(GUIDE_PATH, 'utf8');
  const publicBaseUrl = env.PUBLIC_BASE_URL;
  const accountSids = [env.TWILIO_ACCOUNT_SID];
  const twilioValidator = createTwilioRequestValidator({ validateRequest: twilio.validateRequest, authToken: env.TWILIO_AUTH_TOKEN, publicBaseUrl, allowedAccountSids: accountSids });
  const tenantResolver = createVoiceTenantResolver({ findByTwilioNumber: number => findVoiceTenantsByNumber(database, number) });
  const nonceService = createVoiceSessionNonceService({ repository: createVoiceNonceRepository({ database }) });
  const sessions = createVoiceSessionStore({ database });

  installVoiceRuntimeRoutes(app, {
    twilioValidator, tenantResolver, nonceService, allowedAccountSids: accountSids, publicBaseUrl, runtimeEnabled: true,
    // Under the forwarding model the owner turns answering on and off from their phone; any call that
    // reaches this number is answered when the account's plan allows it.
    checkOperatorEligibility: async ({ context, tenant } = {}) => {
      const { account } = loadVoiceAccountContext(database, context?.ownerId ?? tenant?.ownerId);
      return Boolean(account) && hasOperatorAccess(account, { now: now() });
    },
    checkVoiceCap: async ({ context, tenant } = {}) => {
      const { account, minutesUsed } = loadVoiceAccountContext(database, context?.ownerId ?? tenant?.ownerId);
      return trialVoiceCapDecision(account, { now: now(), minutesUsed: Number(minutesUsed) || 0 });
    },
    createSession: input => sessions.createSession(input),
    recordFallback: input => sessions.recordFallback(input),
  });

  const client = genAiClient || new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const openAdapter = createGoogleGenAiLiveSessionOpener({
    client, model: env.GEMINI_MODEL, toolDeclarations: VOICE_TOOL_DECLARATIONS, voiceName: env.VOICE_DEFAULT_VOICE || undefined,
    systemInstruction: ({ context }) => buildCallInstruction({ database, ownerId: context.ownerId, guideText }),
  });
  const calls = new Map(); // callSid -> { dispatcher, startedAt, transcript }

  function callState(context) {
    let state = calls.get(context.callSid);
    if (!state) {
      const runtime = createVoiceToolRuntime({ database, callContext: context });
      state = { dispatcher: createVoiceToolDispatcher({ handlers: runtime.handlers, callContext: runtime.context, idempotencyStore: runtime.idempotencyStore }), startedAt: now(), transcript: [] };
      calls.set(context.callSid, state);
    }
    return state;
  }

  const bridge = createGeminiMediaBridge({
    async openGeminiSession(args) {
      try {
        callState(args.context);
        const session = await openAdapter(args);
        await session.sendText(GREETING_TURN);
        return session;
      } catch (error) {
        onError(`VOICE_SESSION_OPEN_FAILED:${typeof error?.code === 'string' ? error.code : 'UNKNOWN'}`);
        throw error;
      }
    },
    async onTranscript({ context, transcript }) {
      if (!transcript?.final || !transcript.text) return;
      const state = callState(context);
      state.transcript.push({ role: transcript.role === 'user' ? 'caller' : 'agent', text: transcript.text, at: new Date(now()).toISOString() });
      database.prepare('UPDATE calls SET transcriptJson = ?, updatedAt = ? WHERE ownerId = ? AND callSid = ?')
        .run(JSON.stringify(state.transcript), new Date(now()).toISOString(), context.ownerId, context.callSid);
    },
    async onToolCall({ context, toolCall }) {
      const state = callState(context);
      try {
        return await state.dispatcher.dispatch({ name: toolCall.name, toolCallId: toolCall.toolCallId, args: toolCall.args });
      } catch {
        return { status: 'error', message: 'That action could not be completed. Offer to take a message for the business.' };
      }
    },
    async onSessionEnd({ context, outcome }) {
      const state = calls.get(context.callSid); calls.delete(context.callSid);
      const ended = new Date(now()).toISOString();
      const seconds = state ? Math.max(0, Math.round((now() - state.startedAt) / 1000)) : null;
      const code = typeof outcome === 'string' ? outcome : typeof outcome?.code === 'string' ? outcome.code : typeof outcome?.reason === 'string' ? outcome.reason : 'COMPLETED';
      database.prepare("UPDATE calls SET completedAt = ?, duration = COALESCE(?, duration), status = 'COMPLETED', outcome = ?, updatedAt = ? WHERE ownerId = ? AND callSid = ?")
        .run(ended, seconds, code.slice(0, 64), ended, context.ownerId, context.callSid);
    },
  });

  const coordinator = createVoiceWebSocketSessionCoordinator({
    twilioValidator, nonceService,
    loadSessionByNonceHash: input => sessions.loadSessionByNonceHash(input),
    startMediaSession: input => bridge.startMediaSession(input),
  });
  // Routes are registered now; the media WebSocket attaches once the HTTP server exists.
  return { attach: httpServer => createVoiceWebSocketServer({ httpServer, coordinator, onError }) };
}
