// Decides whether a caller's answer to "Am I speaking with <name>?" (or "Have
// you called us before from this number?") confirms who they are.
//
// An answer confirms only when it says this person is the caller: it must be
// made only of confirmation words ("yes", "speaking", "it's me", "this is
// <name>") and courtesies ("no problem", "ma'am"). Anything else reveals
// nothing: any question, any other words (someone else, the person away, a
// negation, another name, or even the caller's own reason for calling, since
// other words cannot be checked for someone else). When in doubt, no saved
// history is revealed.
//
// identityVerdict also tells a denial from any other refused answer. A denial
// begins with "no" ("No", "Nope, wrong number") or is a plain denial ("Not me",
// "That's not me", "I'm not John", "It is not", "Wrong number", "Yeah, no"); it
// ends identity checks for the call. An answer that mentions another person
// ("Yes, I'm his wife", "Yeah, he's out", "This is Mary", "John's not in",
// "I'll take a message") also ends them: the caller is someone else. Any other
// refused answer ("Yes, I'm calling about the deck", "Who's asking?") may be
// asked about once more.
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
const NO=new Set(['no','nope','nah','negative']);
const DENIALS=phrases(['not me','not him','not her','not them','wrong number','wrong person','wrong guy','wrong man','wrong lady','wrong woman',
  'wrong one','wrong house','i m not','i am not','it s not','it is not','it isn t','that s not','that is not','that isn t','this is not',
  'this isn t','isn t me','is not me','am not','are not','nobody by that name','no one by that name','never heard of']);
// Words that mean another person is involved.
const OTHER_PEOPLE=new Set(['he','she','him','her','his','hers','himself','herself','they','them','their','theirs','themselves','wife','husband',
  'partner','spouse','son','daughter','kid','kids','child','children','mom','mother','mum','dad','father','brother','sister','family','cousin',
  'nephew','niece','aunt','uncle','grandson','granddaughter','grandmother','grandfather','grandma','grandpa','grandkid','grandkids','girlfriend',
  'boyfriend','fiance','fiancee','friend','roommate','neighbor','neighbour','tenant','landlord','boss','colleague','coworker','secretary',
  'assistant','receptionist','office','manager','employer','employee','staff','caregiver','nurse','lawyer','agent','babysitter','nanny',
  'behalf','message','messages']);
// After these, a word that is not the saved name and not an ordinary word is someone's name: "This is Mary", "I'm Peter".
const INTRODUCTIONS=phrases(['this is','i m','i am','my name is','name s','you re speaking with','you are speaking with',
  'you re talking to','you are talking to']);
// The saved name is about someone else when it follows or precedes these: "calling for John", "John's not in".
// Ordinary words that start a sentence with a capital letter.
const SENTENCE_WORDS=new Set(['i','it','its','this','that','these','those','there','here','the','a','an','we','you','my','our','your','yes','yeah',
  'yep','yup','sure','right','correct','okay','ok','hi','hello','hey','oh','uh','um','well','so','and','but','or','what','who','why','where','when',
  'how','which','can','could','would','should','will','is','are','was','were','do','does','did','just','maybe','please','thanks','thank','sorry',
  'actually','also','mhm','speaking','not','no','nope','one','all','some','any','every','everything','nothing','something','anything','today',
  'tomorrow','yesterday','tonight','now','then','still','already','again','because','if','about','for','on','in','at','to','from','with']);
const CALENDAR_WORDS=new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday','january','february','march','april',
  'may','june','july','august','september','october','november','december','christmas','easter','thanksgiving']);
const NAME_ABOUT_BEFORE=new Set(['for','to','with','tell','get','reach','about','ask','give','put','and','of','let']);
const NAME_ABOUT_AFTER=new Set(['s','is','was','isn','wasn','isnt','wasnt','passed','died','left','moved','went','can','cannot','will','won',
  'does','doesn','did','didn','has','hasn','had','should','would','might','may','just','already','still','stepped','works','lives','asked',
  'told','said','wants','wanted','needs','and']);
const NOT_A_NAME=new Set(['about','regarding','concerning','for','in','at','on','a','an','the','my','our','your','it','that','this','what','why',
  'how','just','really','calling','returning','following','looking','wondering','trying','hoping','interested','not','sure','fine','good','okay',
  'ok','here','back','with','from','still','also','actually','so','very','glad','happy','sorry','afraid','going','gonna','after','done','ready',
  'available','busy','me','you','we','us','uh','um','well','yes','yeah','right','correct','speaking','to','re','is','s','m','am','one','only',
  'the','new','old','a','again','already','home','out','away','in','away','free','late','early','called','asking','checking','reaching']);
const words=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const startsWith=(tokens,at,phrase)=>phrase.every((word,index)=>tokens[at+index]===word);

export function confirmsIdentity(answer,firstName,fullName){
  return identityVerdict(answer,firstName,fullName)==='confirmed';
}

// 'confirmed', 'denied' (a "no" anywhere other than a courtesy such as "no
// problem", or a plain denial), 'someone_else' (another person is mentioned),
// or 'unclear' for every other refused answer.
export function identityVerdict(answer,firstName,fullName){
  if(typeof answer!=='string'||!answer.trim())return 'unclear';
  if(onlyConfirmation(answer,firstName,fullName))return 'confirmed';
  const tokens=words(answer).split(' ').filter(Boolean);
  const name=typeof firstName==='string'?words(firstName).split(' ').filter(Boolean):[];
  // "no problem", "not a problem", "no worries" are courtesies, not denials.
  const courtesy=new Set();
  for(let at=0;at<tokens.length;at++)for(const phrase of COURTESY)if(startsWith(tokens,at,phrase))phrase.forEach((_,index)=>courtesy.add(at+index));
  const denials=[...DENIALS,...(name.length?[['not',...name],['isn','t',...name],['is','not',...name]]:[])];
  if(tokens.some((token,index)=>!courtesy.has(index)&&(NO.has(token)||denials.some(phrase=>startsWith(tokens,index,phrase)))))return 'denied';
  if(mentionsAnotherPerson(answer,tokens,name,courtesy))return 'someone_else';
  return 'unclear';
}

function mentionsAnotherPerson(answer,tokens,name,courtesy){
  // A pronoun or relation word for someone else ("I'm his wife", "she stepped out", "take a message").
  if(tokens.some((token,index)=>OTHER_PEOPLE.has(token)&&!courtesy.has(index)))return true;
  // The saved name used about someone: "John's not in", "John passed away", "I'm calling for John".
  if(name.length)for(let at=0;at<tokens.length;at++)if(startsWith(tokens,at,name)){
    const before=tokens[at-1],after=tokens[at+name.length];
    if(NAME_ABOUT_BEFORE.has(before)||NAME_ABOUT_AFTER.has(after))return true;
  }
  // Another person's name after an introduction: "This is Mary", "My name is Peter",
  // "You're speaking with Mary", or "I'm Peter" when the transcript capitalises it.
  for(let at=0;at<tokens.length;at++)for(const lead of INTRODUCTIONS)if(startsWith(tokens,at,lead)){
    const next=tokens[at+lead.length];
    if(!next||NOT_A_NAME.has(next)||!/^\p{L}+$/u.test(next)||(name.length&&startsWith(tokens,at+lead.length,name)))continue;
    if(lead[0]!=='i'||new RegExp(`\\bI(?:'|’|\\s+a)m\\s+${next[0].toUpperCase()}${next.slice(1)}\\b`,'u').test(answer))return true;
  }
  // Another capitalised name used about someone: "Mary is out", "Mary asked me to call", "Mary's phone".
  const saved=name.join(' ');
  for(const match of answer.matchAll(/(?<![\p{L}\p{N}'’])(\p{Lu}\p{Ll}+)(?:['’]s\b|\s+(\p{Ll}+))/gu)){
    const word=match[1].toLowerCase();
    if(word===saved||CALENDAR_WORDS.has(word)||NOT_A_NAME.has(word)||SENTENCE_WORDS.has(word))continue;
    if(match[2]===undefined||NAME_ABOUT_AFTER.has(match[2]))return true;
  }
  return false;
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

