// Decides whether a caller's answer to "Am I speaking with <name>?" (or "Have
// you called us before from this number?") confirms who they are.
//
// An answer confirms only when it says this person is the caller: it must be
// made only of confirmation words ("yes", "speaking", "it's me", "this is
// <name>") and courtesies ("no problem", "ma'am"). Anything else reveals
// nothing: any question, any other words (someone else, the person away, a
// negation, another name, or even the caller's own reason for calling, since
// other words cannot be checked for someone else). When in doubt, no saved
// history is revealed. The receptionist asks once: an answer that is not a
// plain confirmation makes the caller a new caller for the rest of the call.
const phrases=list=>list.map(phrase=>phrase.split(' '));
const FILLER=phrases(['uh','um','umm','uhm','er','erm','ah','oh','hi','hello','hey','well','so','okay','ok','hmm','hm','hi there','hello there',
  'good morning','good afternoon','good evening']);
// "no problem" and "no worries" are courtesies, not denials.
const COURTESY=phrases(['no problem','no problems','not a problem','no worries','not to worry','of course','please','thanks','thank you',
  'ma am','maam','sir']);
const AFFIRM=phrases(['yes','yeah','yep','yup','yea','ya','yah','mhm','mhmm','mm hmm','mm hm','mmhmm','uh huh','correct','right','that s right',
  'that is right','that s correct','that is correct','sure','sure is','sure thing','indeed','absolutely','definitely','you bet','it is']);
const SELF=phrases(['that s me','that is me','it s me','it is me','this is me','that would be me','that ll be me','speaking','this is she',
  'this is he','this is her','this is him','you got her','you got him','you got me','you ve got her','you ve got him','you ve got me',
  // "Am I speaking with John?" "Yes, I am." / "You are." / "Yes, this is." / "Sure am." / "Yessir."
  'i am','i m','you are','you re','this is','sure am','yessir','yes sir','yes maam','yes ma am']);
// The saved name may follow these: "Yes it's me, John", "Speaking, John Synthetic".
const SELF_THEN_NAME=phrases(['that s me','that is me','it s me','it is me','this is me','speaking','i am','i m','this is','you got me','you ve got me']);
// Only for "Have you called us before from this number?".
const CALLED_BEFORE=phrases(['i have','i did','i have before','a few times','a couple times','a couple of times','many times','once','twice']);
const words=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const startsWith=(tokens,at,phrase)=>phrase.every((word,index)=>tokens[at+index]===word);

export function confirmsIdentity(answer,firstName,fullName){
  if(typeof answer!=='string'||!answer.trim())return false;
  return onlyConfirmation(answer,firstName,fullName);
}

function onlyConfirmation(answer,firstName,fullName){
  // Any question, wherever it is, reveals nothing ("Sure, who is calling?").
  if(/[?¿？]/.test(answer))return false;
  const name=typeof firstName==='string'?words(firstName).split(' ').filter(Boolean):[];
  const full=typeof fullName==='string'?words(fullName).split(' ').filter(Boolean):[];
  // "this is Sally" or "this is Sally Synthetic", never "this is Mary".
  const named=name.length?[...name,...(startsWith(full,0,name)?full.slice(name.length):[])]:[];
  const self=name.length?[...SELF,...['this is','i m','i am','it s','its','it is','my name is'].map(lead=>[...lead.split(' '),...name]),
    [...name,'here'],[...name,'speaking']]:SELF;
  const confirmations=[...AFFIRM,...self,...(name.length?[]:CALLED_BEFORE)];
  const tokens=words(answer).split(' ').filter(Boolean);
  let at=0,confirmed=false;
  for(;;){
    let best=null,kind=null;
    for(const [list,type] of [[FILLER,'filler'],[COURTESY,'courtesy'],[confirmations,'confirm']])
      for(const phrase of list)if((!best||phrase.length>best.length)&&startsWith(tokens,at,phrase)){best=phrase;kind=type;}
    if(!best)break;
    at+=best.length;
    // "Yes, this is Sally Synthetic": the rest of the saved name belongs to the confirmation.
    if(kind==='confirm'&&name.length&&startsWith(best,best.length-name.length,name)&&startsWith(tokens,at,named.slice(name.length)))at+=named.length-name.length;
    if(kind==='confirm')confirmed=true;
    // "Yes it's me, John": the saved name right after the caller says it is them.
    if(kind==='confirm'&&name.length&&SELF_THEN_NAME.some(phrase=>phrase.length===best.length&&startsWith(best,0,phrase))&&startsWith(tokens,at,name)){
      at+=name.length;if(startsWith(tokens,at,named.slice(name.length)))at+=named.length-name.length;
    }
  }
  // Every word must belong to a confirmation, a courtesy or a filler.
  return confirmed&&at===tokens.length;
}

