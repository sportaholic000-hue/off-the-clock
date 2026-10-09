export const TEXT_AI_UNAVAILABLE_MESSAGE='AI drafting is unavailable because its text model is not configured. You can enter your business information and prices manually. Contact support@offtheclockai.com for help.';
export class TextAIConfigurationError extends Error {
  constructor(){super(TEXT_AI_UNAVAILABLE_MESSAGE);this.code='TEXT_AI_UNAVAILABLE';this.statusCode=503;this.retryable=false;}
}
export function geminiTextModel(env=process.env){
  const model=env.GEMINI_TEXT_MODEL;
  if(typeof model!=='string'||model.length>128||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model)||/live|audio|tts|embedding|image/i.test(model))throw new TextAIConfigurationError();
  return model;
}
export function textAIConfiguration(env=process.env){
  const missing=['GEMINI_API_KEY','GEMINI_TEXT_MODEL'].filter(key=>!String(env[key]||'').trim());
  return {enabled:missing.length===0,missing};
}
