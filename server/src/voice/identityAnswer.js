// Decides whether a caller's answer to "Am I speaking with <name>?" (or "Have
// you called us before from this number?") confirms who they are. Ordinary
// confirmations count; a denial, someone else, a question, "Maybe" or an
// unclear answer never does. When in doubt, no saved history is revealed.
const FILLERS=new Set(['uh','um','umm','uhm','er','erm','ah','oh','hi','hello','hey','well','so','okay','ok','hmm','hm']);
const AFFIRMATIONS=['yes','yeah','yep','yup','yea','ya','yah','mhm','mm hmm','mm hm','mmhmm','uh huh','correct','right','that s right','that is right',
  'that s correct','that is correct','that s me','that is me','it s me','it is me','it is','this is me','that would be me','speaking','sure','sure is',
  'you got her','you got him','you got me','indeed','absolutely','of course'];
// "no problem" and "no worries" are courtesies, not denials.
const COURTESY=new Set(['problem','problems','worries','worry','doubt','question','rush']);
const RELATIONS='wife|husband|partner|son|daughter|mom|mother|dad|father|brother|sister|friend|boss|colleague|coworker|assistant|roommate|neighbor|neighbour|tenant|landlord|kid|child|kids|children';
const SOMEONE_ELSE=new RegExp(`\\b(?:wrong number|wrong person|not me|isn t me|is not me|not her|not him|(?:his|her|their|my) (?:${RELATIONS})|on (?:his|her|their) behalf|behalf of|calling for|speaking for|answering for|take a message|not here|isn t here|is not here|not available|(?:she|he) s not|(?:she|he) is not|(?:she|he) isn t)\\b`);
const words=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function confirmsIdentity(answer,firstName){
  if(typeof answer!=='string')return false;
  const name=typeof firstName==='string'?words(firstName):'';
  // Clauses keep their ending punctuation, so "Yes?" stays a question.
  const clauses=[];
  for(const [,text,end] of answer.matchAll(/([^.,;:!?…]+)([.,;:!?…]*)/g)){
    const list=words(text).split(' ').filter(Boolean);
    while(list.length&&FILLERS.has(list[0])&&!(list[0]==='uh'&&list[1]==='huh'))list.shift();
    if(list.length)clauses.push({text:list.join(' '),question:end.includes('?')});
  }
  if(!clauses.length)return false;
  const all=' '+clauses.map(clause=>clause.text).join(' ')+' ';
  const tokens=all.trim().split(' ');
  // Any "no", "nope" or "nah" (other than a courtesy) is a denial.
  if(tokens.some((token,index)=>['no','nope','nah','negative'].includes(token)&&!COURTESY.has(tokens[index+1])))return false;
  if(SOMEONE_ELSE.test(all))return false;
  if(name&&new RegExp(`\\b(?:not|isn t|is not|isnt) ${escape(name)}\\b`).test(all))return false;
  const first=clauses[0];
  if(first.question)return false;
  const starts=phrase=>first.text===phrase||first.text.startsWith(phrase+' ');
  if(AFFIRMATIONS.some(starts))return true;
  if(!name)return false;
  return new RegExp(`^(?:(?:this is|i m|i am|it s|its|it is) ${escape(name)}|${escape(name)} (?:here|speaking))(?: |$)`).test(first.text);
}
