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

const BEFORE={
  starter:{
    none:['26ab4834e89f24ccef6f60c9534c771e472af940531460119c0523a23afb07a1','23ba4a2b44ac47f09530292f41233b8005d1b57b42dc34b573b57f142acffc81','42fdd57322a8137b9e7970420047003ac0db29feea861d9d3747616031026317','9c0977e7bbf2d2d69f4affba8123b519ab41aa511a1739268fe8556de2101b62'],
    fencing:['a42f01e6ff2d4ecd94b365d1f9fe47c4847c8a3b99bfc560861ebe76f614fa6c','3065c660c97e7dea1e50081c93290df553fc1422250b98aabd5c963090b0a7a0','5a504ea6bf5bced3a27ac356e6789718c84fb17112f174505a033fd9a0317b8f','4ff781353f2b34091a1db0d0e49ef06df7a05dfea3d7f5adf4511f063d2aa8af'],
    concrete:['95653cdd9f8de740388409993be46bce4c873ee9997833b20e0a51637473fda5','7beb9438313c07cb8e2b598e22e23156e342fa8946bdf12da23cc970e3f46fb8','06bbc1deea27408eb815811b3573f3cace877b99355102bd62cca863cfd1718e','5f5d716b792c66f72c2e2aa25693238778981f78598280fdcf7a93dc1e9eb328'],
    roofing:['cfd67204c6eaa07ceea092926cd4c59795b4d9d124282f1eddfcc8760002bf0e','813d0a40939f5e15d4abf0b73dfe49a716c198f18bfa3c8aa7bb99f395e5e637','37f7216f3e91dd18125871e94c9e35c636472e5a353e1629c553b08a411913d3','d1e0b69010b99e2bf12543167ac79bf374331dcd3536acefaa9dcadcdf90d47d'],
    landscapingOther:['3ee8b66b7420e6528d04e9416102e4a6451c5c5a30a35cfb7b9261a12a30e5d4','7268e2b6ed012bc646bcdf73ead3d8a796a6909bdd84ed6bfeb76f1197df3256','81b5d4e46e7d7843097dbcce78de2b2168c0e5f8d58b3aa8a75df4112f0706d8','bf71bd5c50775dbba687cba72d36c4ba178d8577da27e7c247fea4858f3274c4'],
    custom:['90e688570bb46497753a386eb5733c6d0108c2a840a132fd7cbf599f138b64f7','b0333ce1afb2949baaeb49170336cd8c06a6cf010377a8f834d8694e245d588a','a2e1179fbcb05b7f9bf5afc96c39dafce74033081c42d577d4eaf4ad626680d0','6fb272e936e7e7dc11a5b32d46f92d00461f8e35271cf1888d48caebe2c73aff'],
    all:['1d3ef9d0826c35f21a12e22a0a2dc72d15a6e2f17ded03a7c359eb02c7e02d0e','74c25e9fe9df2fd21eeb25e0ab211d4e1f83f565d4aa61efa8c9de11b05f918b','6078d294cdf13f07842f0eea23203e72067c71ca81339c77eaa62ac7c63b217d','92256a0e84da22f7632cd0d74e69cddc2dfe8a129bd835c3039f603d6373b772'],
    sod:['94c6fd98c8bc78a9c2bd3903e3d3930e7a7924d4ab57279c12ae3d75f0202282','a72b6dd21b9495c486e6435f393ee97df3b9a507a2247713717ec672a6cf5a9c','8df76458779beaa948cbf4ba1c29dd2797f6e271ed680497c2ae6dd241d8bbc4','ebaa4bee22c83155c7ac9c9f1209b6b45cadbd3c6c7c7db0e965adde222ccf7c'],
    planting:['c83c3419840db170c2fa707391f79212aec9c21e6e2ecc7c8cdfd90d1a50012e','8076efcf5ed43eb90cc5422be1c4e8cff7b0b82a6c3033bd531eb5bdc69b1b60','647335df396765b319acc9fbeb3fca65012aaa1f88376b164aeb1f5159680707','af04de5af032e43340805c9317c2d74a7280e0a006632409cafad39e159226a7'],
    roofRepair:['9751b12b27ceba79d332e757342f3b031ede9cc448503eb7059f318ef6698161','e09f396af4edd7d1e942e9f7cebe83564d0aa1310b1455f9bb17d4854b60cc6a','fd94e4ad1674be2b78732f9b7d7e2b5ac1e77f89ec273c89d174d35bc9811caa','d6386d842f55c9f36134d11334e08640fd953edf117618e58f92b83e0367f77c'],
    flatRepair:['03b93c1ef8255e8db32dea889fddea9f95a6493479b15b93741679a09185b602','29565fb6f91d00ad3c33658de82d036208c95be09c9df21af335bff9bcb0b630','c19a06e782ba5b8c893a4bdbf294a6cc5cdd9c9b5e7b74d58796d638589a5a3c','8476ca1ed15c1c842863a351b2b67d1f4e787a2f9131897940dc218998fe7977'],
    sidingRepair:['7c9aeddf31fe8d6eb3cbc72c627ab781e0d19ee69ba62da8bc5913e897ff1b8f','009e7888f87e31a91a0b7c7b4e19a6cdf5c7f1388c28f438c3c9025a71860651','cfb044d08a6335312aa8788ebc87f90b4e5596c94bef85ef5397db6b8354e6f5','1f215bc1587ec8627885c1bf4c9a1e1e3a73374741e2d1fadbf80163a17e3575'],
    interiorPainting:['2864cd58fff7e99467284fb6dbfa58dff400f18d370ab6069d26c53e3443c72c','fe3a4758e5730e5cf7b98120ba6f8fbba27b73534e8c9839dec36514b3b471c8','609cd6f4667c32136d1b6ed7829af9a834ebb19b306a3553bf4efbd7297a7a61','b973a4b68ae87995703597fe728192b6de373ad0661142088a4809e0d3194845'],
    exteriorPainting:['aec5195e2cd8d586090e559cf180bc0648f88575aafa85e7573a8871307d98db','1f575d0b9359ab2c40a96ba4d8ac65dff4caed139df24f4469f454416e0678db','2eed7c252e7bf4694a48879d557c13c2b80f4c41b478c463bde2d11236b78513','8cf1cec2345610253e43273baad7f77c549c57ef1fb36598df895c1256c3ded7'],
    siding:['2fc609fcf5804ec5ca9bd9e457062f2d1f7bc9f304d6f6b618e1426d8fa4eb48','bbb47f61d54bb078dc8acc04c617956714c3bef45ab0df668fc3be1be70f9cf3','f926ee63e4ac73e6df9d4a81c79dc4dba84cd68da9e35fb1847060a4dd1cfeec','07666c857633d91853daa2ae347bf1c90c25dad08121662013ed6e8222086d1d'],
    flooringInstall:['0aa645c104a366673ac42b5036bf5770c2c9f17e65ca1acb4c2ed841582cf44a','cc40bcf32e76b865c6d15b5d996535ec75400e098d476fb4f9497de0376d3bc6','a11cd51adf9dcca6305ecbe1cb92956ab580860bba5d5a8b0b7dc5238aa35153','543964cc9ee5e64a75e310ad91b7eb77bdc0e7e5a72b7230a2405f2ac4a3d9d2'],
    flooringReplacement:['d2cae762b4c2f3dad643349127047028fc5b0e4a5f60811780ce19c11dc0a407','0a5eeb2a3cc89e664ac64b022e2dddc707dcd753fb18826bbcb67ffec24c3dc9','2f32278f0ee52a0dfef6db2330065c1440f23a35e19e902a00f3577858edf8f1','c55c1f5b539d927c436f8ca9835a001388aab56a87860f73ca28b8e342a96775'],
    mixed:['cf6af846800ba99859c1736bcc22930214dbd0e2e789d49c9e653f68a3f6ad2c','d9b8c17b6ab7ab5a02e98efc840e9490b7fe7b43d152d5b4a0496503c49e5dd4','683c531c6aa983bd00ebee25830f33ca1470fc1da1c1d6c9f86fa8d1b7571b32','5ef5121473782279c851c6f747269c1ba161243bec064143aecb9dff786b4179'],
  },
  operator:{
    none:['833c57ccf1d2ab92bc803938505b0366d2fab5e4b3455a5c66eb1a762195d9b9','3e26fd959619ba6afe130685a785ba44c9610fc7e1cae5a4755f72d126778e06','4126736a3d92f77486e0d53e9b4d55f573aa38a862ee6aa2561f80b1959cdef1','8ad5a5a5340a6896e27d78d915ad7dd6a2ff1b20c37e5ccf3cbe50f5f7dc9642'],
    fencing:['bf06f1f727a15434a4c4171f33c7df1d5649e460e68e682b02f80dafcf245a62','c961a99d213ee886acb07952a67f264c267ca554c8c54a838d92b258b5c89ccb','59aa322b25019ac27461354f4c520b2d46cd22af386e9bd46d38e0da0315845e','7e38d00f52da3ec76022c556401b923a4b3f147243350a798a93baa968345887'],
    concrete:['7f5c7b0494d96aff080f4c7bed3e33d4982cfb785e107fd984388ba77e95b6c3','3a2dd9d3fae27f8ee550dec2b304f5a1ca9d12a411a093264c195b9a82773209','090193c36e7a419dd823d44517e90279484cbda3acb05924a7fac728ff7e5b76','132c8cd40332a390c7fec7414784ced62da7e49bbb1c6f535b05f243fad04e24'],
    roofing:['bf1e257781d9dcf25efb9cb153930e325c177ac180893fb019a842cb545968c4','f4ed6517a8a5947d6daf11e86536b5acc1cfac39c8874692588e2143368133bb','abddc58357ee14357b9030886423c7d95073dc43e897de253224a9d86629ee56','053bf4a9501d712a27a8536349bcb19833615974318658065960245e3eeff6c9'],
    landscapingOther:['d7d79128f93dc58dd99f929d2704c847b003e320db041b9a9c91d9ef019bcfe8','87a04578dcbc09b0fd32d806e5f94dc7ae24a783d3733c86d11ff8f4051360f2','ed2d617c752dac59c46da0c9b2414f751574885eed8e9158907273450ba4f6ab','860fc4ff49bf7a242ee61468f947d49d027820ae62342457ab417ad73c29df13'],
    custom:['1cfc01002eeb8f35aa8b6d4c1edad719235640e24b0bd9b7de941b5fa919085d','4f775822af653c4a83694d9642e792c805e5df7d9c682fb64ea0d0c964058af0','debced23fadda1124125a3ac68071f7fc1d164153197b9be5efa1c1147969dac','1cf50f903171d1f1c0393fac723a5ed4b61cfe17f3e13e5cf1d8ec338526e97d'],
    all:['30743b016ed1abfc48f077cc7290be80e9cf5ba5fdf9123a00d31f9774cc05ef','d6cd133a6b2a2579c53531aa5178a0d826a1344d58b6903c92c579e166fdc9e2','50965618e5f1e2801f7e0d7b1906de25fa4fd86a495e23cbe3ba10ad0cd9c9e1','14eeb7c9e21f72baa46188bf075661e93aa477ccdbd2322e45a8bb6ba9473326'],
    sod:['8426402d370695363e1adc789b9ff7b88a15e401a9c1d31d8d0655949c523572','1dd81d146d7e23dd67535f0f81e74126da35208a37031809a61bc23510db0f15','8308bad1fe82010bc88cc8095eef37a16776b8e98da56d05cbdcda1af81a5671','0af3e0d023c79ac6b2f5d353e883c6c6360feb8abddaa31a0d620d5db1708c89'],
    planting:['3ec062bc11e0d6e5608a04d737cd1fac43d4010c8b848e327f4815bfdb710829','7809fdf5da153c83360ee7ee8ed372d8024aa632df4834754d30249749093ffd','9e257a03970d0f5e3349b67c75baed36637fccf6986ca5bca91850f3d3237ac9','1fc6b13b10af8a010b4d1247550efc7541a2f31cdaa0f8a77e7a63cccbc02113'],
    roofRepair:['e030f5b8dd2226b388bbc27c903af4deb88d5d2433352ae13855dd87d8434f6d','19d7339e59fff1a06e9dbbaca224f6a23b00daaae573d6255fccf0a355b813ad','80853dd663a3b1c96f5208026fa820b180bea110bd2fbdae5fe346a220020d5d','875b315df7e7182eabacf2d9487c509ffdbaf10f808aa59a63e02c99bc838c1d'],
    flatRepair:['09fcf3407e26de56c8ce0866d1422573e8858166dfb9399385618b8324f76c0f','2a6295645697ae4854858560b47f549d3b420038899f62eccf0e3cb29270dea7','ae1c886ee692426085bbcf0abef500fa61ec4ae04db3942d14490801f9761be3','160cf5bc1de4ab021032f50c9be49696b51e1cd7f93159121e4f5218835bd2e3'],
    sidingRepair:['40e9cd6a0c3345195c0c5bfe0c6ceaaaa7d1e58354332fe60a76a8428f974098','a8ebc1dc5a0472260be7340676aaec6a132f06f867f3db51216dbd82a37d6e9e','513ab84ac8bb8174488887497e10e09199cbdb286706738604ea874cc236bb01','3f5732d3595f2310e3f030118a1b91d69d0e208e8ac0374e249b882a6d96bdf9'],
    interiorPainting:['654673d3f3105cbf322961736d4c07fd4c797665360b55e5dc434e897f22d2a2','8353108e60c9c906a1737715d76f03593b48c758c790452f36ab81e97eab2804','b66e17b8f68bdd8f63837565222c154d08ca1eee204cafe12d7253bac661ab7d','f7b69be53e96bc3c4a2b2787142518a1135bee3eb226820081ab35f85c797224'],
    exteriorPainting:['5eb7567e3894d5dccbbfb525555216479431cb8574e737334d1cce4ab193df95','5c7d4e1cad4e33fec80f387df19e80af2bf69085345a8d5b66542462274bbf1e','5612e3a2393e7d22df0f8200ed80e2f153c5d9f91c4d487836815aa3d8427245','a2387ccad9bfe795cce22f3f78436dc870cc5168101039dbb5beb71ee908275a'],
    siding:['481f72ab1f97b8da125f8663d4a20c69669e32c7bdfc526f7ff6b335233fb3fa','f29e2a6842a8dc4f7f48b2be6ca256c890e9c6ea5e954e5cafe99e26f7be500f','496365c0b5aa4329319ccfce1448849784517980f02e3f633f40d1f6859f03e0','3c7aad9b3403a5e436e09ce8b121aa15c1ad44c4014d4eb1ca2a0d549baa51f4'],
    flooringInstall:['717d1ee712877a1ccbf434ad112366f91d20d99dceeae094415e9fae690b2a0d','82575ab4a1e5a022a44e1ebf587b69380b9405659200be0f373af18f81506f13','a24ac1e5c2229be9e416d565b9c873e960b314012b4c398b384bf228696dcaba','bb36500ba494b47b8beb85641894019d6c4161f04e5a7bdd9d4f14be7b86055d'],
    flooringReplacement:['cf8b4a6d444ed4e42225712b43f3d6e93b61284b4a7d0977629f2c3e881953ca','02cb701a75deefca387838029fcac3520194ab7b04a92ea1cfd5bae55dc8dc03','a425a73932f1dc78556eb633ec650843b86c666eac38d78284ab2f5517c6b1f1','69e474c6b62281d75e68adeb2c46e396e2821df2481eda2a15edc25ac719b524'],
    mixed:['9faf4da98d2960da2530a6968cd0196e9e8a86892c9e081d26301f6899f21401','15520941af6d671b954f8290ad782952d1644da6549ea20f6e6a20fe75cc3ecb','2d32dc775f96becf11b83a31dc915612ffa225b4740e214f7e955b8053ba7809','4bdea30ca4f735983e180305a3cce3ee7cdf6eebd9fe8c846d2290a48c5d93a4'],
  },
  quoteDone:{
    none:['4474d5ae7bb0bfab7f03581b915fc6c337412c8f9cfbeaa7aac7accb8ce20301','9b350c4eb1c8351a2fde6f730a1bb6ba99523ba857e15736de13d1658e598fbe','712f788e9fafb86b954bf6d074ca2ccd997035bec323551ea3ca21777436f583','7b2e53156d3f778ce7c534f9fa3170fa206b34879b4a15fa7b7c713aebcded17'],
    fencing:['b93c2d011d4b387375b9076cd905f04f6c0a2f51d3bdb303a0b03c2d6286f538','6ea781e6a088d09ae453312774221662c333d1dc60156659d2ef81feb13c0658','8a2d9776036dc3b5b7f549cc03e93216b537dcae6ee1b0ff502bfd85ff52125f','505457c372384807bfdba80f7d8142e1ab9e0eee55f04a3b3038bfb76a26320b'],
    concrete:['e779be08905a83aa4e2e57cabb3a3f1fdc211925bc6d7829bf5e03293bf60f9c','1849f01159ef669a1c61dde1f170079015cf9b75c15130f2d9afe7cf35a63d89','0d5b2681b2a0c5c9309565d10ab32634c8e23532dbcff795090ccc12333aa08a','6de70e5bbeb5a7269c73eb4c930c901a7f7eaeb0f466f3dcab9d8ef05c332a3d'],
    roofing:['b0f91fe1e1596c9370ffedd0b8ae246062e1dbb5885f888445581d988bdd649a','97aa60c16f84f33cff588f6ea8761aa8712bef3214f53f4683b5ccb8b23f7a4c','31a99a6e280acef4fc3ba45015edc93e4c31060b7e84e0872a37a9dd0dc31449','ec373fa0cc79db3a4c46bdffe8ae08e12cf50a8de6193ffbd48d3d9b30fd73a8'],
    landscapingOther:['a2a23db1d067a814c817ca4fe2c6eda00e5803e8b05b90291eabd62bf6432500','1b7949894d6f12498fda890a8d69e2b77141a006fbfa19e4f962cede9632a7aa','505d87f85c819ceef21f26ff4525be673aa31262bcfa9d2031d93a25d9c850af','eb30d2ac6cf7d637762e8044c5db8e6d585b1882272448d7fe8f517b66b961c2'],
    custom:['a291032079d98dd72edc5e217eebd0c490282ecc0af62251f0dbea2d549728b9','5555e40e71ab59a9e23f142a74e225da1773987d1e7375be2acaa3ea660bd4b9','eb0cfff206c9e3fa3ca9fd9893845e0da62dfccd26b89cb9f19040973fd0a244','9fcfc3b14eeab363f0cebd4ed815951f691ebe6ff1731a19560de858725ab257'],
  }
};

test('Starter and Operator compiled instructions are byte-identical to before (every setup, with and without knowledge and notice)',()=>{
  for(const plan of ['starter','operator'])for(const [name,types] of Object.entries(SETS))VARIANTS.forEach(([knowledge,notice],index)=>{
    assert.equal(sha(compile(plan,types,knowledge,notice)),BEFORE[plan][name][index],`${plan} ${name} knowledge=${knowledge} notice=${notice}`);
  });
});

test('QuoteDone instructions for setups without the changed flows are byte-identical to before',()=>{
  for(const [name,digests] of Object.entries(BEFORE.quoteDone))VARIANTS.forEach(([knowledge,notice],index)=>{
    assert.equal(sha(compile('quoteDone',SETS[name],knowledge,notice)),digests[index],`quoteDone ${name} knowledge=${knowledge} notice=${notice}`);
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
  sod:'The returned topsoil allowance and import-depth wording stays in the written copy; never say it on the call.',
  repair:'The returned on-site line stays in the written copy; never say it on the call.',
  painting:'Unpriced requested extras are excluded and need a separate estimate; quote the priced work. Say the excluded extras only as spokenQuote.spokenExclusions, exactly as written; never read exclusions from the written copy.',
  sidingExclusion:'Requested unpriced soffit/fascia is excluded and needs its own estimate while the rest is quoted. Say the excluded items only as spokenQuote.spokenExclusions, exactly as written; never read exclusions from the written copy.',
  siding:"Accept and confirm the caller's own approximate numbers and set callerMeasurementsEstimated=true. The returned on-site measurement line stays in the written copy; never say it on the call.",
  carpet:"Read back these dimensions as the caller's estimate. The returned on-site measurement line and carpet seaming-diagram qualification stay in the written copy; never say them on the call.",
  leveling:'quote the rest. The returned additional-work confirmation wording stays in the written copy; never say it on the call.',
  addon:'(material grade is the natural tier) → spokenQuote.spokenExclusions if any add-on is skipped → book.',
  subfloor:'YES → ask for measured [subfloorRepairAreaSqft] before quoting; the returned subfloor disclosure stays in the written copy; never say it on the call.'
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
