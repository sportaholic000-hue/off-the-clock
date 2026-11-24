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
  'good morning','good afternoon','good evening',
  'bonjour','bonsoir','salut','allô','allo','euh','ben','bah','eh bien',
  'hola','buenos días','buenos dias','buenas tardes','buenas noches','bueno','pues','este','eh']);
// "no problem" and "no worries" are courtesies, not denials.
const COURTESY=phrases(['no problem','no problems','not a problem','no worries','not to worry','of course','please','thanks','thank you',
  'ma am','maam','sir',
  'pas de problème','pas de probleme','sans problème','sans probleme','aucun problème','aucun probleme','merci','s il vous plaît','s il vous plait','monsieur','madame','bien sûr','bien sur',
  'no hay problema','sin problema','por supuesto','claro','gracias','por favor','señor','senor','señora','senora']);
const AFFIRM=phrases(['yes','yeah','yep','yup','yea','ya','yah','mhm','mhmm','mm hmm','mm hm','mmhmm','uh huh','correct','right','that s right',
  'that is right','that s correct','that is correct','sure','sure is','sure thing','indeed','absolutely','definitely','you bet','it is',
  'oui','ouais','exact','exactement','tout à fait','tout a fait','absolument','effectivement','d accord','bien sûr','bien sur','c est exact','c est ça','c est ca',
  'sí','si','claro','correcto','exacto','así es','asi es','por supuesto','ajá','aja','efectivamente','seguro']);
const SELF=phrases(['that s me','that is me','it s me','it is me','this is me','that would be me','that ll be me','speaking','this is she',
  'this is he','this is her','this is him','you got her','you got him','you got me','you ve got her','you ve got him','you ve got me',
  // "Am I speaking with John?" "Yes, I am." / "You are." / "Yes, this is." / "Sure am." / "Yessir."
  'i am','i m','you are','you re','this is','sure am','yessir','yes sir','yes maam','yes ma am',
  'c est moi','c est bien moi','moi même','moi meme','à l appareil','a l appareil','je vous écoute','je vous ecoute','c est lui','c est elle','lui même','lui meme','elle même','elle meme',
  'soy yo','con él','con el','con ella','él mismo','el mismo','la misma','hablando','a la orden','al habla']);
// The saved name may follow these: "Yes it's me, John", "Speaking, John Synthetic".
const SELF_THEN_NAME=phrases(['that s me','that is me','it s me','it is me','this is me','speaking','i am','i m','this is','you got me','you ve got me',
  'c est moi','c est bien moi','à l appareil','a l appareil','soy yo','hablando']);
// Only for "Have you called us before from this number?".
const CALLED_BEFORE=phrases(['i have','i did','i have before','a few times','a couple times','a couple of times','many times','once','twice',
  'j ai déjà appelé','j ai deja appele','quelques fois','une fois','deux fois',
  'he llamado','he llamado antes','ya llamé','ya llame','un par de veces','varias veces','una vez','dos veces']);
const NAMED_LEADS=['this is','i m','i am','it s','its','it is','my name is',
  'c est','je suis','je m appelle','ici',
  'soy','habla','me llamo','aquí','aqui'];
const words=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const startsWith=(tokens,at,phrase)=>phrase.every((word,index)=>tokens[at+index]===word);

// Owner ruling 2026-11-19: an answer that starts with a yes recognises the caller,
// whatever follows ("Yes, I'm calling about the deck", "Yes, I got your message"),
// unless it is a clear no ("Yes, but I'm not Sally", "Yeah, no", "Yes, she's not
// here"). Every plain confirmation is recognised as before. An answer that neither
// starts with a yes nor is a plain confirmation ("It's Mary", "Who's asking?",
// "Maybe") is not.
export function confirmsIdentity(answer,firstName,fullName){
  if(typeof answer!=='string'||!answer.trim())return false;
  if(onlyConfirmation(answer,firstName,fullName))return true;
  const tokens=words(answer).split(' ').filter(Boolean);
  const name=typeof firstName==='string'?words(firstName).split(' ').filter(Boolean):[];
  return startsWithYes(tokens,name)&&!clearNo(tokens,name);
}

// A yes at the start, after any greeting or filler ("Uh, yeah", "Oh hi, yes", "Mhm").
// "I'm ...", "This is ..." and "You are ..." are not a yes unless they name the
// saved person ("This is Sally, I need a roof quote"); "Sally's husband" is not.
const YES_START=phrases(['yes','yeah','yep','yup','yea','ya','yah','yessir','yes sir','yes maam','yes ma am','mhm','mhmm','mm hmm','mm hm',
  'mmhmm','uh huh','correct','right','that s right','that is right','that s correct','that is correct','sure','sure is','sure am','sure thing',
  'indeed','absolutely','definitely','you bet','that s me','that is me','it s me','it is me','this is me','that would be me','that ll be me',
  'speaking','this is she','this is he','you got me','you ve got me',
  'oui','ouais','exact','exactement','tout à fait','tout a fait','absolument','effectivement','bien sûr','bien sur','c est exact','c est ça','c est ca',
  'c est moi','c est bien moi','moi même','moi meme','à l appareil','a l appareil','c est lui','c est elle','lui même','lui meme','elle même','elle meme',
  'sí','si','claro','correcto','exacto','así es','asi es','por supuesto','ajá','aja','seguro',
  'soy yo','con él','con el','con ella','él mismo','el mismo','la misma','hablando','al habla']);
function startsWithYes(tokens,name){
  let at=0;
  for(;;){
    const skip=[...FILLER,...COURTESY.filter(phrase=>!['no','not','pas','sans','aucun','sin'].includes(phrase[0]))].filter(phrase=>startsWith(tokens,at,phrase)).sort((a,b)=>b.length-a.length)[0];
    if(!skip)break;
    // A filler that is also the start of a yes ("uh huh") is the yes.
    if(YES_START.some(phrase=>phrase.length>skip.length&&startsWith(tokens,at,phrase)))break;
    at+=skip.length;
  }
  if(YES_START.some(phrase=>startsWith(tokens,at,phrase)))return true;
  if(!name.length)return false;
  const named=[...NAMED_LEADS.map(lead=>[...lead.split(' '),...name]),[...name,'here'],[...name,'speaking'],[...name,'à','l','appareil'],[...name,'a','l','appareil'],[...name,'hablando']];
  return named.some(phrase=>startsWith(tokens,at,phrase)&&tokens[at+phrase.length]!=='s');
}

// A clear no: "no", "nope", "nah" or "negative" anywhere other than a courtesy
// ("no problem", "no worries", "not a problem"), or a plain denial of being the
// person or of the person being there.
const NO_WORDS=new Set(['no','nope','nah','negative','non','jamais','nunca','tampoco']);
const DENIALS=phrases(['not me','not her','not him','not them','not that person','not the person','wrong number','wrong person','wrong guy',
  'wrong man','wrong lady','wrong woman','wrong one','wrong house','wrong name','i m not her','i m not him','i am not her','i am not him',
  'i m not that person','i am not that person','i m not the person','i am not the person','isn t me','is not me','it s not me','it is not me',
  'that s not me','that is not me','this isn t her','this isn t him','this is not her','this is not him','nobody by that name',
  'no one by that name','never heard of','you have the wrong','you ve got the wrong','you got the wrong','not here','not in','not home',
  'not available','not around','isn t here','isn t in','isn t home','isn t available','isn t around','passed away','stepped out',
  'she s out','he s out','she is out','he is out','she s away','he s away','she is away','he is away','she s at work','he s at work',
  'she is at work','he is at work','she s gone','he s gone','she s busy','he s busy','can t come to the phone','cannot come to the phone',
  'take a message',
  'pas moi','ce n est pas moi','c est pas moi','mauvais numéro','mauvais numero','erreur de numéro','erreur de numero','pas là','pas la',
  'n est pas là','n est pas la','absent','absente','occupé','occupe','occupée','occupee','je ne suis pas','prendre un message',
  'no soy yo','número equivocado','numero equivocado','equivocado','equivocada','no está','no esta','no se encuentra','salió','salio',
  'ocupado','ocupada','tomar un mensaje','dejar un recado']);
function clearNo(tokens,name){
  const courtesy=new Set();
  for(let at=0;at<tokens.length;at++)for(const phrase of COURTESY)if(startsWith(tokens,at,phrase))phrase.forEach((_,index)=>courtesy.add(at+index));
  const denials=[...DENIALS,...(name.length?[['not',...name],['i','m','not',...name],['i','am','not',...name],['isn','t',...name],['is','not',...name],
    ['this','isn','t',...name],['this','is','not',...name],['it','s','not',...name],['it','is','not',...name],
    ['pas',...name],['ce','n','est','pas',...name],['c','est','pas',...name],['je','ne','suis','pas',...name],
    ['no','soy',...name],['no','es',...name],
    ...['s out','is out','s away','is away','s at','is at','s gone','is gone','s busy','is busy','s not','is not','isn t','passed','died','can t','cannot',
      'n est pas','est absent','est absente','no está','no esta','salió','salio']
      .map(rest=>[...name,...rest.split(' ')])]:[])];
  // "It is not" / "It's not" / "That's not" said on its own, or at the end.
  const endings=[['it','is','not'],['it','s','not'],['that','s','not'],['that','is','not'],['i','m','not'],['i','am','not'],['sure','am','not']];
  if(endings.some(phrase=>phrase.length<=tokens.length&&startsWith(tokens,tokens.length-phrase.length,phrase)))return true;
  return tokens.some((token,index)=>!courtesy.has(index)&&(NO_WORDS.has(token)||denials.some(phrase=>startsWith(tokens,index,phrase))));
}

function onlyConfirmation(answer,firstName,fullName){
  // Any question, wherever it is, reveals nothing ("Sure, who is calling?").
  if(/[?¿？]/.test(answer))return false;
  const name=typeof firstName==='string'?words(firstName).split(' ').filter(Boolean):[];
  const full=typeof fullName==='string'?words(fullName).split(' ').filter(Boolean):[];
  // "this is Sally" or "this is Sally Synthetic", never "this is Mary".
  const named=name.length?[...name,...(startsWith(full,0,name)?full.slice(name.length):[])]:[];
  const self=name.length?[...SELF,...NAMED_LEADS.map(lead=>[...lead.split(' '),...name]),
    [...name,'here'],[...name,'speaking'],[...name,'à','l','appareil'],[...name,'a','l','appareil'],[...name,'hablando']]:SELF;
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

