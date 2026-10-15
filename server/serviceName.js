// Owner ruling, 2026-10-15: match the CUSTOM engine's original 80-character
// string limit. Use JavaScript string length, as that engine contract does.
export const SERVICE_NAME_LIMIT=80;
export const SERVICE_NAME_MESSAGE='Enter a service name of 1–80 characters.';
export function serviceNameProblem(value){
  return typeof value!=='string'||!value.trim()||value.length>SERVICE_NAME_LIMIT?SERVICE_NAME_MESSAGE:null;
}
export function validateServiceName(value){
  const message=serviceNameProblem(value);
  if(message)throw Object.assign(new Error(message),{statusCode:422,code:'INVALID_SERVICE_NAME'});
  return value;
}
