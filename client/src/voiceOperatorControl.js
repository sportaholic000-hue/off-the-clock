// Saved routing intent and current readiness are different facts. A service
// interruption must never disable the owner's ability to switch routing off.
export function voiceOperatorControl(operator){
  const checked=Boolean(operator.configuredEnabled??operator.enabled);
  const live=Boolean(operator.enabled&&operator.eligible);
  return {checked,live,blocked:!operator.eligible&&!checked,
    title:live?'OPERATOR LIVE':'OPERATOR OFF',
    sub:live?'EVERY CALL FROM HERE ON IS COVERED':operator.eligible?'CALLERS CAN LEAVE A REQUEST':'VOICE SETUP NEEDS ATTENTION'};
}
