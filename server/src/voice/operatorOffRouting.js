const E164=/^\+[1-9]\d{7,14}$/;

// Shared evidence for the dashboard and the existing inbound fallback. This
// describes routing; it does not enable coverage or mutate carrier settings.
export function operatorOffRouting({profile,coverage,destinationNumber}) {
  if(profile?.operatorEnabled!==0)return null;
  const number=profile.existingPhoneNumber;
  const confirmed=profile.carrierSetupStatus==='updated'&&(!coverage||coverage.confirmedEnabled===0&&coverage.phase==='idle');
  return {mode:confirmed&&E164.test(number||'')&&number!==destinationNumber?'forward':'message',number,message:'The operator is off. Please call the business directly.'};
}
