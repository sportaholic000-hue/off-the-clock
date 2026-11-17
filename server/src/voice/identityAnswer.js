// Decides whether a caller's answer to "Am I speaking with <name>?" (or "Have
// you called us before from this number?") confirms who they are.
//
// An answer confirms only when it says this person is the caller. It must be
// made of confirmation words ("yes", "speaking", "it's me", "this is <name>")
// and courtesies ("no problem", "ma'am"), optionally followed by the caller's
// own reason for calling ("I'm calling about the deck"). Anything else reveals
// nothing: any question, a mention of someone else (he, she, his, her, a
// relative, a secretary, another name), the saved name used about someone
// ("John's not in", "John passed away"), a negation, or words that are not one
// of those forms. When in doubt, no saved history is revealed.
const phrases=list=>list.map(phrase=>phrase.split(' '));
const FILLER=phrases(['uh','um','umm','uhm','er','erm','ah','oh','hi','hello','hey','well','so','okay','ok','hmm','hm','hi there','hello there',
  'good morning','good afternoon','good evening']);
// "no problem" and "no worries" are courtesies, not denials.
const COURTESY=phrases(['no problem','no problems','not a problem','no worries','not to worry','of course','please','thanks','thank you',
  'ma am','maam','sir']);
const AFFIRM=phrases(['yes','yeah','yep','yup','yea','ya','yah','mhm','mhmm','mm hmm','mm hm','mmhmm','uh huh','correct','right','that s right',
  'that is right','that s correct','that is correct','sure','sure is','sure thing','indeed','absolutely','definitely','you bet','it is']);
const SELF=phrases(['that s me','that is me','it s me','it is me','this is me','that would be me','that ll be me','speaking','this is she',
  'this is he','this is her','this is him','you got her','you got him','you got me','you ve got her','you ve got him','you ve got me']);
// Only for "Have you called us before from this number?".
const CALLED_BEFORE=phrases(['i have','i did','i have before','a few times','a couple times','a couple of times','many times','once','twice']);
// The caller's own reason for calling may follow a confirmation.
const OWN_REASON=phrases(['i m calling','i am calling','i was calling','i m just calling','i am just calling','just calling','calling about',
  'calling regarding','calling to','calling back','i m returning','i am returning','returning your call','i m looking','i am looking','i was looking',
  'i m wondering','i was wondering','i need','i just need','i d like','i would like','i want','i wanted','i just wanted','just wanted','i have a',
  'i ve got','i got a','i m interested','i am interested','i m following up','i am following up','following up','just following up','i called',
  'it s about','it is about','about the','about my','regarding the','regarding my']);
const RELATIONS=['wife','husband','partner','son','daughter','mom','mother','mum','dad','father','brother','sister','friend','boss','colleague',
  'coworker','assistant','secretary','receptionist','office','manager','employer','employee','roommate','neighbor','neighbour','tenant','landlord',
  'kid','child','kids','children','grandson','granddaughter','grandmother','grandfather','grandma','grandpa','aunt','uncle','cousin','nephew',
  'niece','fiance','fiancee','girlfriend','boyfriend','spouse','family','caregiver','nurse','lawyer','agent'];
// Words that never belong in the caller's own reason: someone else, a
// question, a negation, or the person being away.
const NOT_OWN_REASON=new Set(['he','she','him','her','his','hers','they','them','their','theirs','himself','herself','themselves',
  'who','what','why','where','when','how','which','whose','whom','no','not','nope','nah','never','t','isnt','dont','didnt','cant','wont',
  'wasnt','arent','behalf','message','wrong','away','passed','died','dead','deceased','gone','stepped','speaking','answering',...RELATIONS]);
const CALLING_FOR=new Set(['a','an','the','some','info','information','quote','quotes','estimate','estimates','help','service','pricing','price','prices']);
const words=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const startsWith=(tokens,at,phrase)=>phrase.every((word,index)=>tokens[at+index]===word);
const contains=(tokens,phrase)=>tokens.some((_,index)=>startsWith(tokens,index,phrase));

export function confirmsIdentity(answer,firstName,fullName){
  if(typeof answer!=='string'||!answer.trim())return false;
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
  }
  if(!confirmed)return false;
  const rest=tokens.slice(at);
  if(!rest.length)return true;
  return ownReason(rest,name);
}

function ownReason(tokens,name){
  if(!OWN_REASON.some(phrase=>startsWith(tokens,0,phrase)))return false;
  if(tokens.some(token=>NOT_OWN_REASON.has(token)))return false;
  // The saved name used about someone, another introduction, or "calling for Mary".
  if(name.length&&contains(tokens,name))return false;
  if(contains(tokens,['this','is'])||contains(tokens,['my','name'])||contains(tokens,['name','is'])||contains(tokens,['calling','from']))return false;
  return tokens.every((token,index)=>token!=='for'||tokens[index-1]!=='calling'||CALLING_FOR.has(tokens[index+1]));
}
