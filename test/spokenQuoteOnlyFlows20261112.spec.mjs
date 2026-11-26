import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileVoiceSystemInstruction,transcriptionNoticeKind,VOICE_GUIDE_SERVICE_TYPES} from '../server/src/voice/voicePromptCompiler.js';
import {fixture as voiceFixture,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {fixture as quoteFixture,flooring,siding,flatRepair} from '../verification/engine-independent/fixtures.mjs';
import {sodFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {approveApplicationService,bookRevision} from '../server/src/quoteDoneBridge.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {beforeEmergencyChange} from './helpers/receptionistBefore20261119.mjs';

// Owner request 2026-11-12: on a QuoteDone call the receptionist says only what
// the code supplies in spokenQuote (price, exclusions, notes, and drivers if
// asked). Sod topsoil, repairs, painting exclusions, siding and flooring follow
// the same rule; everything else stays in the written copy. Starter and
// Operator instructions stay byte for byte the same.
// Every expected value below was written before this file was run. Hashes are
// SHA-256 of the instructions compiled at 8c05586f, before this change.
// Synthetic price books only; nothing calls the live voice or the website demo.
const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const PLANS={starter:{booking:false,transfer:false,phoneQuoting:false},operator:{booking:true,transfer:true,phoneQuoting:false},quoteDone:{booking:true,transfer:true,phoneQuoting:true}};
const svc=type=>({serviceType:type,serviceLabel:'[SYNTHETIC] '+type.toLowerCase().replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]});
const KNOWLEDGE={about:'[SYNTHETIC] We install sod, floors, siding and paint.',hours:'[SYNTHETIC] Weekdays 8 to 5.',prices:'[SYNTHETIC] Sod pallet pickup: $250 per pallet.'};
const SETS={none:[],fencing:['FENCING_INSTALL','FENCING_REPLACEMENT'],concrete:['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB'],roofing:['ROOFING_REPLACEMENT','FLAT_ROOF_REPLACEMENT'],landscapingOther:['LANDSCAPING_CLEANUP','LANDSCAPING_MULCH','LANDSCAPING_MOWING'],custom:['CUSTOM'],all:VOICE_GUIDE_SERVICE_TYPES,sod:['LANDSCAPING_SOD'],planting:['LANDSCAPING_PLANTING'],roofRepair:['ROOFING_REPAIR'],flatRepair:['FLAT_ROOF_REPAIR'],sidingRepair:['SIDING_REPAIR'],interiorPainting:['INTERIOR_PAINTING'],exteriorPainting:['EXTERIOR_PAINTING'],siding:['SIDING_REPLACEMENT'],flooringInstall:['FLOORING_INSTALL'],flooringReplacement:['FLOORING_REPLACEMENT'],mixed:['LANDSCAPING_SOD','ROOFING_REPAIR','INTERIOR_PAINTING','SIDING_REPLACEMENT','SIDING_REPAIR','FLOORING_REPLACEMENT']};
// Order inside each array: [no knowledge, no notice], [no knowledge, notice], [knowledge, no notice], [knowledge, notice].
const VARIANTS=[[false,false],[false,true],[true,false],[true,true]];
const compile=(plan,types,knowledge=false,notice=false)=>compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Harbour Services',agentName:'Nova'},services:types.map(svc),capabilities:PLANS[plan],transcriptionNotice:transcriptionNoticeKind(notice,PLANS[plan]),...(knowledge?{knowledge:KNOWLEDGE}:{})});
const sha=text=>createHash('sha256').update(text).digest('hex');
const flat=text=>text.replace(/\s+/g,' ');

// Re-pinned November 26, 2026, when the price-book branch was merged. Its wording
// for fencing, repairs and roof pitch (every plan) and for the work month (QuoteDone)
// changed the digests of the setups that include those lines. A comparison of every
// plan and service, compiled before and after the merge, showed no other line differs.
const BEFORE={
  starter:{
    none:['26ab4834e89f24ccef6f60c9534c771e472af940531460119c0523a23afb07a1','23ba4a2b44ac47f09530292f41233b8005d1b57b42dc34b573b57f142acffc81','42fdd57322a8137b9e7970420047003ac0db29feea861d9d3747616031026317','9c0977e7bbf2d2d69f4affba8123b519ab41aa511a1739268fe8556de2101b62'],
    fencing:['be8ea47e3f47915d59262a4238f580757618005e86ebccfeb0fec8fe0bfdd3c0','148c580e2a11287a118b6e653be163007da67f941815da15275c76cc8b03f814','dbfb0176e63d168e563ae3eaef238c0db1b0e0993df154dc30889af3c9852162','1d9f82905f22fbb9ca42497a41c52d279ef97f0e6a69332cb6e059e49ddcc033'],
    concrete:['95653cdd9f8de740388409993be46bce4c873ee9997833b20e0a51637473fda5','7beb9438313c07cb8e2b598e22e23156e342fa8946bdf12da23cc970e3f46fb8','06bbc1deea27408eb815811b3573f3cace877b99355102bd62cca863cfd1718e','5f5d716b792c66f72c2e2aa25693238778981f78598280fdcf7a93dc1e9eb328'],
    roofing:['da849f9ec8e5c0d7d9165ede77b9fe186b2efa15fc8a9127dd5a095144141276','9cd2c9c18e81cd365b7c1bdaa29d8f732f4de13acc6bb8086801fd5d015579f6','b590aa5117951c61046a7e63c7cf8aae45e369ccbd907ff0f30b479126f8a170','1bb8f11a47eeb445f350205fabaa0246be5ce6e49d11c1a69fe020ff8f3959aa'],
    landscapingOther:['3ee8b66b7420e6528d04e9416102e4a6451c5c5a30a35cfb7b9261a12a30e5d4','7268e2b6ed012bc646bcdf73ead3d8a796a6909bdd84ed6bfeb76f1197df3256','81b5d4e46e7d7843097dbcce78de2b2168c0e5f8d58b3aa8a75df4112f0706d8','bf71bd5c50775dbba687cba72d36c4ba178d8577da27e7c247fea4858f3274c4'],
    custom:['90e688570bb46497753a386eb5733c6d0108c2a840a132fd7cbf599f138b64f7','b0333ce1afb2949baaeb49170336cd8c06a6cf010377a8f834d8694e245d588a','a2e1179fbcb05b7f9bf5afc96c39dafce74033081c42d577d4eaf4ad626680d0','6fb272e936e7e7dc11a5b32d46f92d00461f8e35271cf1888d48caebe2c73aff'],
    all:['b5291f9ddd6cac5697be285af601bf77e8ddc9dbda51ac242665b0761904e3be','646ee8f5a0139485adab2f00f69cd80ec4967fd8843494b49e3c55bf65d92e89','f95ffb1fa92e43fe6dd7549f847acd44879454ec2028cc6c877308370420fd09','5570aeeb6ba5b3bd7ffa2c34c648bcc3bcccbf42faa8d1a5ec4bc1f6fc46f736'],
    sod:['94c6fd98c8bc78a9c2bd3903e3d3930e7a7924d4ab57279c12ae3d75f0202282','a72b6dd21b9495c486e6435f393ee97df3b9a507a2247713717ec672a6cf5a9c','8df76458779beaa948cbf4ba1c29dd2797f6e271ed680497c2ae6dd241d8bbc4','ebaa4bee22c83155c7ac9c9f1209b6b45cadbd3c6c7c7db0e965adde222ccf7c'],
    planting:['c83c3419840db170c2fa707391f79212aec9c21e6e2ecc7c8cdfd90d1a50012e','8076efcf5ed43eb90cc5422be1c4e8cff7b0b82a6c3033bd531eb5bdc69b1b60','647335df396765b319acc9fbeb3fca65012aaa1f88376b164aeb1f5159680707','af04de5af032e43340805c9317c2d74a7280e0a006632409cafad39e159226a7'],
    roofRepair:['9bcfc63d2f4989d9d09fd6428e5f9f201878bc18eb38a556a3d50d8176ee7e36','3f44accf91ab61b24f7c45f5d278508512b38137c3ec66df957eabd33c3c5d6a','759863d8c8d9c69d0c98fb3472567f183b0dae2fcd76472f7f95118a296de00b','cc50033fb1aaf27199e6533d07759d394d2b649f0ceebf358683eeeceb234932'],
    flatRepair:['8589a46fdf6300f9698155d214862c91973315687196eb39b6628463133ccedb','9faec7c6a464b274a19d6a7d6ef73bf140714211a6da5539cc2d90c3dece1ac5','8eeba6df4e77b2cd6fa571fbf72f8df359b6279beb5485b9609a24596b4b8776','5ae57f5d7d612d4268cbb969dc808e694abba6dd48781476127c39105f60bdd3'],
    sidingRepair:['5abbeaa7d935f180350f59a386876bdfddbbe7a7985f224ad74b284729f228f4','1d51421df124faa1998b2400e0701736799ef7762dfd3877439e93248449a402','f6cb3854455a953504c8d2ac135418204deab187504f0ca1e20d4d3d58fc73b0','be3908b769a03a76f6b77221ae8071bd536c76ecb19aa866f3d6a28bff4cfe67'],
    interiorPainting:['2864cd58fff7e99467284fb6dbfa58dff400f18d370ab6069d26c53e3443c72c','fe3a4758e5730e5cf7b98120ba6f8fbba27b73534e8c9839dec36514b3b471c8','609cd6f4667c32136d1b6ed7829af9a834ebb19b306a3553bf4efbd7297a7a61','b973a4b68ae87995703597fe728192b6de373ad0661142088a4809e0d3194845'],
    exteriorPainting:['aec5195e2cd8d586090e559cf180bc0648f88575aafa85e7573a8871307d98db','1f575d0b9359ab2c40a96ba4d8ac65dff4caed139df24f4469f454416e0678db','2eed7c252e7bf4694a48879d557c13c2b80f4c41b478c463bde2d11236b78513','8cf1cec2345610253e43273baad7f77c549c57ef1fb36598df895c1256c3ded7'],
    siding:['2fc609fcf5804ec5ca9bd9e457062f2d1f7bc9f304d6f6b618e1426d8fa4eb48','bbb47f61d54bb078dc8acc04c617956714c3bef45ab0df668fc3be1be70f9cf3','f926ee63e4ac73e6df9d4a81c79dc4dba84cd68da9e35fb1847060a4dd1cfeec','07666c857633d91853daa2ae347bf1c90c25dad08121662013ed6e8222086d1d'],
    flooringInstall:['0aa645c104a366673ac42b5036bf5770c2c9f17e65ca1acb4c2ed841582cf44a','cc40bcf32e76b865c6d15b5d996535ec75400e098d476fb4f9497de0376d3bc6','a11cd51adf9dcca6305ecbe1cb92956ab580860bba5d5a8b0b7dc5238aa35153','543964cc9ee5e64a75e310ad91b7eb77bdc0e7e5a72b7230a2405f2ac4a3d9d2'],
    flooringReplacement:['d2cae762b4c2f3dad643349127047028fc5b0e4a5f60811780ce19c11dc0a407','0a5eeb2a3cc89e664ac64b022e2dddc707dcd753fb18826bbcb67ffec24c3dc9','2f32278f0ee52a0dfef6db2330065c1440f23a35e19e902a00f3577858edf8f1','c55c1f5b539d927c436f8ca9835a001388aab56a87860f73ca28b8e342a96775'],
    mixed:['f9180b40ac8d5ef7d0822eee181959109bd77885499373cb8f4cf20a612d2f07','394f2702d4325b416e888e0318489dc0b566b98e9cb4b6fbe6013d55a33a2353','f1ae2f912e8aece26e4e6c04aaa9ab3c75edbdc10f22bcf3200b398435040d47','86a6c4d5be3bdc6d92d1b1e9d77268fc7ca5b78e430c535687fbffcc3ef2aa1e'],
  },
  operator:{
    none:['833c57ccf1d2ab92bc803938505b0366d2fab5e4b3455a5c66eb1a762195d9b9','3e26fd959619ba6afe130685a785ba44c9610fc7e1cae5a4755f72d126778e06','4126736a3d92f77486e0d53e9b4d55f573aa38a862ee6aa2561f80b1959cdef1','8ad5a5a5340a6896e27d78d915ad7dd6a2ff1b20c37e5ccf3cbe50f5f7dc9642'],
    fencing:['04630e58d74067c88610bd7afeae5660bed9de05744d837653d3982cd99d55ba','2a5fba287c951120b312f4b6000dd018b3633f303b7fda6e75e130808160fbb0','1a1f0c4b52db469d0d16651404b345997e7aff2917cebb4b6c52743b43a8ccd9','1492c000402c5aa7a7a21be9eafdd545127825220e00d18b74e770648b4e7e1d'],
    concrete:['7f5c7b0494d96aff080f4c7bed3e33d4982cfb785e107fd984388ba77e95b6c3','3a2dd9d3fae27f8ee550dec2b304f5a1ca9d12a411a093264c195b9a82773209','090193c36e7a419dd823d44517e90279484cbda3acb05924a7fac728ff7e5b76','132c8cd40332a390c7fec7414784ced62da7e49bbb1c6f535b05f243fad04e24'],
    roofing:['b74f75f0d5a9613a9e03417fc2a93acf84a9408a1a981872e264f5a219b550e3','cae868b2849284ff469b9baa950ecfe62dbafdca75888c4cd3579e4e6029fdb4','ac62b52e6660ab94b44cc3ce2e974bb99eef765505377f50ee8af1934a013d02','bd88667a57916b6cdb00833f27a5e0cb947c29eb4c17743c57b2d00a5a4e7884'],
    landscapingOther:['d7d79128f93dc58dd99f929d2704c847b003e320db041b9a9c91d9ef019bcfe8','87a04578dcbc09b0fd32d806e5f94dc7ae24a783d3733c86d11ff8f4051360f2','ed2d617c752dac59c46da0c9b2414f751574885eed8e9158907273450ba4f6ab','860fc4ff49bf7a242ee61468f947d49d027820ae62342457ab417ad73c29df13'],
    custom:['1cfc01002eeb8f35aa8b6d4c1edad719235640e24b0bd9b7de941b5fa919085d','4f775822af653c4a83694d9642e792c805e5df7d9c682fb64ea0d0c964058af0','debced23fadda1124125a3ac68071f7fc1d164153197b9be5efa1c1147969dac','1cf50f903171d1f1c0393fac723a5ed4b61cfe17f3e13e5cf1d8ec338526e97d'],
    all:['0087b826789fc9752fe50f09c85542971696b7efcb471022850e84ce6898af83','a3c24f32e370f8b274cd24535e7fd36d63c3e59086345865be9be742aa78f940','5e9d204a5e04ca83d8ec0349fc8f9f39b5fa4b3ab0ae96ae7e635af333c8b9a7','eb7ec179eeb8adc829a566d59163378b06b4b42a6ee161837a64011df4ac5b99'],
    sod:['8426402d370695363e1adc789b9ff7b88a15e401a9c1d31d8d0655949c523572','1dd81d146d7e23dd67535f0f81e74126da35208a37031809a61bc23510db0f15','8308bad1fe82010bc88cc8095eef37a16776b8e98da56d05cbdcda1af81a5671','0af3e0d023c79ac6b2f5d353e883c6c6360feb8abddaa31a0d620d5db1708c89'],
    planting:['3ec062bc11e0d6e5608a04d737cd1fac43d4010c8b848e327f4815bfdb710829','7809fdf5da153c83360ee7ee8ed372d8024aa632df4834754d30249749093ffd','9e257a03970d0f5e3349b67c75baed36637fccf6986ca5bca91850f3d3237ac9','1fc6b13b10af8a010b4d1247550efc7541a2f31cdaa0f8a77e7a63cccbc02113'],
    roofRepair:['746f7563a7334b65e8466f37e7d7cfd48a7e386c4ebb56dec9ec0176f2ceef9e','c5300dbb507a16621b45542f95fd86359f2e5696a8f43a3af9da42b2700a1c61','cd357db0d089fb4e7399593adc8c7092beea2ba1131af2feac2ab59171055f9b','3afb3497458ddaec3c6aa4d6eefd82a185ab206b5f1762e357f00205f7154206'],
    flatRepair:['94d2da2f30e37849c579af269955cd9217285fde83116593bef151ed5d4ba585','f7667f9c3d493a46d35de50a451a18dba4ba945cf2985f7bec2f76fa17bbdb86','242fec8ff7a7507e606f562530cf1816a2ead2ac9cf3066e6f4e241a68f93d1f','482e6b0bc995584169bc39aa64777aab7b00249658065156eba0e71fd23dfd90'],
    sidingRepair:['92d0a05fd12ba8917827e71d3060d03623ef485235f30412755b3e842d0b843c','e5ae0f0d8d7d75f5176cdebc78879a8d25b58483f2ac5a873946589ee137696c','c2f62ec223017c77d43825407e1a4e425fdfcaa67d7c0c6cb2217a980def0d95','327419cf8b60be098d85e60b7b73ab613bac25627b071850fbead4dcaa409d72'],
    interiorPainting:['654673d3f3105cbf322961736d4c07fd4c797665360b55e5dc434e897f22d2a2','8353108e60c9c906a1737715d76f03593b48c758c790452f36ab81e97eab2804','b66e17b8f68bdd8f63837565222c154d08ca1eee204cafe12d7253bac661ab7d','f7b69be53e96bc3c4a2b2787142518a1135bee3eb226820081ab35f85c797224'],
    exteriorPainting:['5eb7567e3894d5dccbbfb525555216479431cb8574e737334d1cce4ab193df95','5c7d4e1cad4e33fec80f387df19e80af2bf69085345a8d5b66542462274bbf1e','5612e3a2393e7d22df0f8200ed80e2f153c5d9f91c4d487836815aa3d8427245','a2387ccad9bfe795cce22f3f78436dc870cc5168101039dbb5beb71ee908275a'],
    siding:['481f72ab1f97b8da125f8663d4a20c69669e32c7bdfc526f7ff6b335233fb3fa','f29e2a6842a8dc4f7f48b2be6ca256c890e9c6ea5e954e5cafe99e26f7be500f','496365c0b5aa4329319ccfce1448849784517980f02e3f633f40d1f6859f03e0','3c7aad9b3403a5e436e09ce8b121aa15c1ad44c4014d4eb1ca2a0d549baa51f4'],
    flooringInstall:['717d1ee712877a1ccbf434ad112366f91d20d99dceeae094415e9fae690b2a0d','82575ab4a1e5a022a44e1ebf587b69380b9405659200be0f373af18f81506f13','a24ac1e5c2229be9e416d565b9c873e960b314012b4c398b384bf228696dcaba','bb36500ba494b47b8beb85641894019d6c4161f04e5a7bdd9d4f14be7b86055d'],
    flooringReplacement:['cf8b4a6d444ed4e42225712b43f3d6e93b61284b4a7d0977629f2c3e881953ca','02cb701a75deefca387838029fcac3520194ab7b04a92ea1cfd5bae55dc8dc03','a425a73932f1dc78556eb633ec650843b86c666eac38d78284ab2f5517c6b1f1','69e474c6b62281d75e68adeb2c46e396e2821df2481eda2a15edc25ac719b524'],
    mixed:['15cf7b8f1c23e2518282a2b7672a807c3e0f541a958577b1f67109a38c7c720b','6c526bf6a8b791056faa39dd39d5a832e2073f0e722b097a2aec6bd3d391ca1c','e85a166c5a1f76dee9d2def0f39662c499edca44ac9da9a6d2d45771231cb93c','6fdadcb22a051771dac7b0761fb11d6f66be9175f8a5699352c2bb77b7005ac1'],
  },
  quoteDone:{
    none:['73bb2b5056609a250ceb9d5ab729007d7d2882721399939a7678fbcaa4fcf60d','6b97dc20950c8966601d03ecd3284d6f52b942110a1ebbda047863be28a6e7bd','9115cf8f4d51d0ebefbb322acbefe654cbdf4ccbdee417893004e0206d765dd0','ceafd8a56f3570d61851981a9cdcf2f8d50eb32f4d418ce7fd352348340ff728'],
    fencing:['a2012599844a38e2d3d2e5cfb6940f8132a68a1471df76d56deebea53f01bfda','a9b336c9bfd573267d1078d22c58fd38309239f81cd4f53e5931402af63dfe74','201ea9964c66d5bbf64c9b829111525f2da06751e7cf2514608f35bf953484d7','4156fa9a19adf1e3b3618588c5c2b3a58c3e8a8fd0d7a01f7fb2fac331610798'],
    concrete:['c569d9543b890fad440a119d2fba0f9d6290711ae386a3ddb4d8248dfb8b3088','90eae94a1ba8b330f60bbb8fd937e25816f29d951fa348f07e91584be5189e7c','e135c9b082ebae3cba18593c3ed6f9f528e570524cfa91a85832e15ea0c40977','91a4cf520517b9f61e1fa59138948fe6bbf0bae2af13a06cb4c5ee0957d9d9c8'],
    roofing:['6e574be3321cd4bfc3ea6e289c809a4f329f50848ad38eacd5e1b939e9cac210','81fb7f6e3a52be315082b2ce84a35b561ceadb4b4d7e0dc95dba73d6e97e0f20','4383b1a5f55812ba6317d786446148387bb79ec382cf27a745ba3a0fe59afd8e','9feb6b6ff91dfa91661efb4a869a5e00dd00fbc41b0b99fb994b34c57623c704'],
    landscapingOther:['4c28cb1cfcf8f6a841303f9db222dd1abab7c36c3ab8fa256cfe645d016a37c4','7543c79b1ccbe854fc52503af1f98c7602e5c2b289f1b9bf09a51ec6dd475c41','99a277688c51e47c8f362a84788f5cd9e02ae1a4c29ec24daf83fde7e5f9ec71','df1bbd336c76f8f3a5a3b76097a310a5d14d0a4bf69dd6d09c6b41d350292972'],
    custom:['db49e806cf5e96379fb20f292f730530c8524abd7fe1135e79782b485b9e3276','fa3b9913e300a195831e84bef1b1df9f66ecc83aa857cd1ec97a903ed42c3d6b','fc317ab83928472cfeec14a8350097062c178ddd04aecccefea0cae503e069ce','6735d45f0395b3060c2641ba237e2867294cdc35788c01dc6ed8ec910192fafb'],
  }
};

test('Starter and Operator compiled instructions are byte-identical to before (every setup, with and without knowledge and notice)',()=>{
  for(const plan of ['starter','operator'])for(const [name,types] of Object.entries(SETS))VARIANTS.forEach(([knowledge,notice],index)=>{
  // 2026-11-19: the emergency/end-call rules changed for every plan; compare the rest.
    assert.equal(sha(beforeEmergencyChange(compile(plan,types,knowledge,notice))),BEFORE[plan][name][index],`${plan} ${name} knowledge=${knowledge} notice=${notice}`);
  });
});

test('QuoteDone instructions for setups without the changed flows are byte-identical to before',()=>{
  for(const [name,digests] of Object.entries(BEFORE.quoteDone))VARIANTS.forEach(([knowledge,notice],index)=>{
    assert.equal(sha(beforeEmergencyChange(compile('quoteDone',SETS[name],knowledge,notice))),digests[index],`quoteDone ${name} knowledge=${knowledge} notice=${notice}`);
  });
});

// The instructions that told the receptionist to read or state the written quote.
const OLD={
  sod:'Read the returned topsoil allowance and import-depth wording.',
  repair:'Read the returned on-site line: "This price is based on the measurements you gave us. The business will confirm them on site."',
  painting:'quote the priced work and read every returned exclusion.',
  siding:"Accept and confirm the caller's own approximate numbers, set callerMeasurementsEstimated=true, and retain the on-site measurement line.",
  carpet:"retain the returned on-site measurement line and carpet seaming-diagram qualification.",
  leveling:'quote the rest and read the returned additional-work confirmation wording.',
  addon:"addon disclosure if any skipped (\"that doesn't include [skipped item] — [owner] can price that on site\")",
  subfloor:'state only the returned disclosure.'
};
const NEW={
  // 2026-11-13: the topsoil and subfloor allowances are said as fixed spokenQuote.spokenNotes sentences.
  sod:'The returned topsoil allowance and import-depth wording stays in the written copy; never read it on the call. When spokenQuote.spokenNotes is present, say it exactly as written right after the price and any spokenExclusions.',
  repair:'The returned on-site line stays in the written copy; never say it on the call.',
  painting:'Unpriced requested extras are excluded and need a separate estimate; quote the priced work. Say the excluded extras only as spokenQuote.spokenExclusions, exactly as written; never read exclusions from the written copy.',
  sidingExclusion:'Requested unpriced soffit/fascia is excluded and needs its own estimate while the rest is quoted. Say the excluded items only as spokenQuote.spokenExclusions, exactly as written; never read exclusions from the written copy.',
  siding:"Accept and confirm the caller's own approximate numbers and set callerMeasurementsEstimated=true. The returned on-site measurement line stays in the written copy; never say it on the call.",
  carpet:"Read back these dimensions as the caller's estimate. The returned on-site measurement line and carpet seaming-diagram qualification stay in the written copy; never say them on the call.",
  leveling:'quote the rest. The returned additional-work confirmation wording stays in the written copy; never say it on the call.',
  addon:'(material grade is the natural tier) → spokenQuote.spokenExclusions if any add-on is skipped → book.',
  subfloor:'YES → ask for measured [subfloorRepairAreaSqft] before quoting; the returned subfloor disclosure stays in the written copy; never read it on the call. When spokenQuote.spokenNotes is present, say it exactly as written right after the price and any spokenExclusions.'
};
const FLOWS={
  sod:{old:['sod'],new:['sod']},planting:{old:['sod'],new:['sod']},
  roofRepair:{old:['repair'],new:['repair']},flatRepair:{old:['repair'],new:['repair']},sidingRepair:{old:['repair'],new:['repair']},
  interiorPainting:{old:['painting'],new:['painting']},exteriorPainting:{old:['painting'],new:['painting']},
  siding:{old:['siding'],new:['sidingExclusion','siding']},
  flooringInstall:{old:['carpet','leveling','addon'],new:['carpet','leveling','addon']},
  flooringReplacement:{old:['carpet','addon','subfloor'],new:['carpet','addon','subfloor']}
};

for(const [name,{old,new:added}] of Object.entries(FLOWS))test(`QuoteDone ${name}: no instruction to read the written quote; the spokenQuote-only wording is present`,()=>{
  VARIANTS.forEach(([knowledge,notice])=>{
    const text=flat(compile('quoteDone',SETS[name],knowledge,notice));
    for(const key of old)assert.equal(text.includes(OLD[key]),false,`${name}: still contains ${OLD[key]}`);
    for(const key of added)assert.ok(text.includes(NEW[key]),`${name}: missing ${NEW[key]}`);
  });
});

test('QuoteDone flooring: the changed lines appear in each flooring flow exactly where the old ones were',()=>{
  const install=flat(compile('quoteDone',SETS.flooringInstall));
  // Once for FLOORING_INSTALL; with replacement active, also in its shared FLOORING_INSTALL steps.
  for(const key of ['carpet','leveling','addon'])assert.equal(install.split(NEW[key]).length-1,1,key);
  const replacement=flat(compile('quoteDone',SETS.flooringReplacement));
  for(const key of ['carpet','leveling','addon','subfloor'])assert.equal(replacement.split(NEW[key]).length-1,1,key);
  const both=flat(compile('quoteDone',['FLOORING_INSTALL','FLOORING_REPLACEMENT']));
  for(const key of ['carpet','leveling','addon'])assert.equal(both.split(NEW[key]).length-1,2,key);
});

// Positive "read / state / retain" of returned or written quote text. These
// read-backs are not the written quote: the email spelling, the booking date,
// time and address, and a calculated area before quoting.
const ALLOWED=new Set([
  'If the caller wants the written copy you offer after the price, or asks for a written quote, collect an email address, use prepareQuoteEmail, read its spelling back, correct it if necessary, and sendQuoteEmail only after confirmation of the latest read-back.',
  'Read the returned readBack to the caller, including spelling.',
  'Read back the returned area and obtain confirmation.',
  'Use calculateVoiceArea for an area question, then read the returned area back before quoting.',
  'Then read the returned date, time and address back.'
]);
const QUOTE_TEXT=/\b(returned|written|disclosures?|qualifications?|wording|exclusions?|on-site)\b/i;
function positiveReads(text){
  return flat(text).split(/(?<=[.!?]["”]?)\s+/).filter(sentence=>QUOTE_TEXT.test(sentence)&&[...sentence.matchAll(/\b(read|state|retain)\b/gi)].some(match=>!/\bnever\s+$/i.test(sentence.slice(0,match.index))));
}
test('QuoteDone: no compiled instruction tells the receptionist both to read the written quote and never to read quoteNarration aloud',()=>{
  for(const [name,types] of Object.entries(SETS))VARIANTS.forEach(([knowledge,notice])=>{
    const text=compile('quoteDone',types,knowledge,notice);
    assert.ok(flat(text).includes('Never read quoteNarration aloud; it is the written copy.'),name);
    const reads=positiveReads(text).filter(sentence=>!ALLOWED.has(sentence));
    assert.deepEqual(reads,[],`${name} knowledge=${knowledge} notice=${notice}`);
  });
});

// Real engine through the real voice tool runtime: the exclusions a caller hears
// today come from spokenQuote.spokenExclusions, and the written-only wording is
// in quoteNarration (the written copy), not in spokenQuote.
const MEASURED="That's based on the measurements you gave me, and it gets confirmed on site before any work starts.";
async function phoneQuote(t,f,{estimated=true,confirm=[]}={}){
  const h=voiceFixture(t),c=h.context();
  f.ownerPricing.priceBasisByCategory.material='sell_price';delete f.ownerPricing.origin;
  savePricebook(c.ownerId,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
  const book=loadPricebook(c.ownerId);approveApplicationService(c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
  process.env.JWT_SECRET='SYNTHETIC_SPOKEN_ONLY_KEY_NEVER_LIVE'.padEnd(64,'x');
  const runtime=createVoiceToolRuntime({database:h.db,callContext:c,handleSecret:secret,clock:()=>new Date(at)});
  const invoke=async(name,args)=>projectVoiceToolResult(name,await runtime.handlers[name]({context:c,args}));
  const matched=await invoke('matchService',{query:f.ownerPricing.service});assert.ok(matched.serviceHandle);
  const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
  const args={serviceHandle:matched.serviceHandle,customerInputs:inputs,customerConfirmed:true,productConfirmations:Object.fromEntries(confirm.map(field=>[field,true])),...(estimated?{callerMeasurementsEstimated:true}:{})};
  let result=await invoke('getQuote',args);
  const tokens=result.questionContract?.fields?.filter(field=>field.confirmationToken)||[];
  if(tokens.length){args.scopeConfirmations=Object.fromEntries(tokens.map(field=>[field.field,field.confirmationToken]));for(const field of tokens)args.customerInputs[field.field]=true;result=await invoke('getQuote',args);}
  assert.equal(result.status,'quoted',JSON.stringify(result));
  return result;
}
const spokenText=result=>Object.values(result.spokenQuote).join(' ');

test('painting: unpriced door sides and windows are still said, from spokenExclusions',async t=>{
  const f=quoteFixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,surfaceOptionalItems:['doorSides','windows']});
  const result=await phoneQuote(t,f);
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(result.midEstimate,988.44);
  assert.equal(result.spokenQuote.spokenExclusions,"Just so you know, that doesn't include door sides and windows.");
  assert.ok(result.spokenQuote.spokenPrice.endsWith(MEASURED));
  assert.ok(result.quoteNarration.includes('Separately unpriced work: Door sides; Windows.'));
});

test('siding: unpriced soffit and fascia are still said, from spokenExclusions',async t=>{
  const f=siding();f.customerInputs.surfaceOptionalItems=['soffit','fascia'];
  const result=await phoneQuote(t,f);
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
  assert.equal(result.spokenQuote.spokenExclusions,"Just so you know, that doesn't include soffit and fascia.");
  assert.ok(result.spokenQuote.spokenPrice.endsWith(MEASURED));
  assert.ok(result.quoteNarration.includes('Separately unpriced work: Soffit; Fascia.'));
  assert.ok(result.voiceSummary.includes('This price is based on the measurements you gave us. The business will confirm them on site.'));
});

test('sod: unpriced grading and topsoil are still said, from spokenExclusions',async t=>{
  const f=sodFixture();Object.assign(f.ownerPricing.pricing,{sodRemovalPerSqft:50});delete f.ownerPricing.pricing.groundPrepPerSqft;
  const result=await phoneQuote(t,f);
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
  assert.equal(result.spokenQuote.spokenExclusions,"Just so you know, that doesn't include sod grading and imported topsoil.");
  assert.ok(result.quoteNarration.includes('Excluded ground preparation: grading, imported topsoil. Any required excluded work needs a separate on-site estimate.'));
});

test('sod: the topsoil allowance and import-depth wording is in the written copy only',async t=>{
  const f=sodFixture();Object.assign(f.ownerPricing.pricing,{sodRemovalPerSqft:50,sodGradingPerSqft:20,topsoilPerCubicYard:4000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2});delete f.ownerPricing.pricing.groundPrepPerSqft;
  f.customerInputs.usableTopsoilDepthInches='unknown';
  const result=await phoneQuote(t,f);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(Object.hasOwn(result.spokenQuote,'spokenExclusions'),false);
  for(const sentence of ['Topsoil import depth: 2 inches.','Imported topsoil is an allowance using the business’s typical import depth and will be confirmed on site.']){
    assert.ok(result.quoteNarration.includes(sentence),sentence);
    assert.equal(spokenText(result).includes(sentence),false,sentence);
  }
  assert.ok(result.spokenQuote.spokenPrice.endsWith(MEASURED));
});

test('flooring: an unpriced add-on and unknown-area leveling are still said, from spokenExclusions',async t=>{
  const moving=flooring('tile',200);moving.customerInputs.furnitureMovingRoomCount=2;
  const movingResult=await phoneQuote(t,moving);
  assert.equal(movingResult.spokenQuote.spokenExclusions,"Just so you know, that doesn't include furniture moving.");
  const leveling=flooring('tile',200);Object.assign(leveling.ownerPricing.pricing,{floorLevelingPerSqft:400,floorLevelingMaxDepthInches:0.25});Object.assign(leveling.customerInputs,{floorLevelingNeeded:true,floorLevelingSqft:'unknown'});
  const levelingResult=await phoneQuote(t,leveling);
  assert.equal(levelingResult.spokenQuote.spokenExclusions,"Just so you know, that doesn't include floor leveling.");
  const note='Floor leveling is additional work; the business will confirm its area and price on site.';
  assert.ok(levelingResult.quoteNarration.includes(note));assert.equal(spokenText(levelingResult).includes(note),false);
});

test('flooring: the carpet seaming-diagram line and the subfloor disclosure are in the written copy only',async t=>{
  const rooms=carpet([{lengthFt:13,widthFt:14}]);delete rooms.customerInputs.sqft;
  const carpetResult=await phoneQuote(t,rooms);
  const seaming='The carpet quantity is confirmed on site from the seaming diagram.';
  assert.ok(carpetResult.quoteNarration.includes(seaming));assert.equal(spokenText(carpetResult).includes(seaming),false);
  assert.ok(carpetResult.spokenQuote.spokenPrice.endsWith(MEASURED));
  const base=flooring('tile',200);
  const replacement=quoteFixture('FLOORING_REPLACEMENT',{...base.ownerPricing.pricing,subfloorAllowancePerSqft:300,removalPerSqft:{carpet:100}},{...base.customerInputs,existingFloorType:'carpet',removalNeeded:true,removalAreaSqft:200,subfloorIssues:true,subfloorRepairAreaSqft:40});
  const subfloorResult=await phoneQuote(t,replacement,{confirm:['existingFloorType']});
  const subfloor='Subfloor repair allowance covers only the measured affected area and is confirmed after opening the floor.';
  assert.ok(subfloorResult.quoteNarration.includes(subfloor));assert.equal(spokenText(subfloorResult).includes(subfloor),false);
});

test('repairs: spokenPrice carries the measurement and on-site confirmation for every repair type',async t=>{
  const roof=quoteFixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:8}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:4000,medium:8000,large:16000}}}},{repairType:'shingle_patch',affectedArea:60,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false});
  const sidingRepair=quoteFixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:5000,medium:10000,large:15000}}}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:40,stories:1});
  for(const [f,confirm] of [[roof,['repairType','roofType']],[flatRepair(),['repairType','membraneType']],[sidingRepair,['damageLevel']]])for(const estimated of [true,false]){
    const result=await phoneQuote(t,f,{estimated,confirm});
    assert.ok(result.spokenQuote.spokenPrice.endsWith(MEASURED),f.serviceType+' estimated='+estimated);
    assert.equal(spokenText(result).includes('This price is based on the measurements you gave us.'),false);
    assert.equal(result.voiceSummary.includes('This price is based on the measurements you gave us. The business will confirm them on site.'),estimated);
  }
});
