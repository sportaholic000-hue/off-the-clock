// Default receptionist names, used until the owner picks their own.
export const DEFAULT_AGENT_NAMES=Object.freeze({female:'Nova',male:'Miles'});
export function defaultAgentName(voiceId){return DEFAULT_AGENT_NAMES[voiceId]||DEFAULT_AGENT_NAMES.female;}
