// Readiness reflects account and setup. Forwarding is controlled on the
// owner's business phone, never through the dashboard.
export function voiceOperatorControl(operator){
  const live=Boolean(operator.enabled&&operator.eligible);
  return {live,blocked:!operator.eligible,
    title:live?'RECEPTIONIST READY':'RECEPTIONIST SETUP NEEDED',
    sub:live?'FORWARDED CALLS ARE ANSWERED':'COMPLETE THE PHONE AND BUSINESS SETUP'};
}
