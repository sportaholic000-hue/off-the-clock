// Expected-value adjustments for the November 19, 2026 fixes (engine v37),
// shared by the geometry boundary, delivery and historical tests so every one
// applies the same independently worked values.
// C1 (Lane C, 2026-11-19): a slab given as area and perimeter lays its joints on
// the rectangle with that area and perimeter when one exists (length + width =
// perimeter / 2, length * width = area); the square of the same area is kept only
// when none exists. These rows use a 100 LF perimeter, so every area up to 625 sq ft
// is now a rectangle. The new joint length is worked here independently with
// 40-digit fixed-point decimals (BigInt), not the engine's exact comparisons:
// panel counts by the same NRMCA rule (ceil(side / spacing), raised until no
// panel is longer than 1.5 times its width), joints (a-1)*W + (b-1)*L, rounded
// once to 0.01 LF unless the sides are rational; the line is joints * 100 cents
// (the fixture's saw-cut rate), half up. Labor, ready-mix and formwork are unchanged.
const C1_SCALE=10n**40n;
const c1Rational=value=>{const [whole,fraction='']=String(value).split('.');return {n:BigInt(whole+fraction),d:10n**BigInt(fraction.length)};};
const c1Sqrt=n=>{if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));for(;;){const y=(x+n/x)/2n;if(y>=x)return x;x=y;}};
const c1Ceil=(a,b)=>(a+b-1n)/b;
function c1RectangleJoints(area,perimeter,spacing){
 const A=c1Rational(area),P=c1Rational(perimeter),S=c1Rational(spacing);
 // D = (P/2)^2 - 4A, scaled by SCALE^2; no rectangle when D < 0.
 const D=(P.n*P.n*A.d*C1_SCALE*C1_SCALE)/(4n*P.d*P.d*A.d)-(4n*A.n*C1_SCALE*C1_SCALE)/A.d;
 if(D<0n)return null;
 const root=c1Sqrt(D),exactRoot=root*root===D&&(P.n*P.n*A.d*C1_SCALE*C1_SCALE)%(4n*P.d*P.d*A.d)===0n&&(4n*A.n*C1_SCALE*C1_SCALE)%A.d===0n;
 const h=P.n*C1_SCALE/(2n*P.d),L2=h+root,W2=h-root,S2=2n*S.n*C1_SCALE/S.d;
 let a=c1Ceil(L2,S2),b=c1Ceil(W2,S2);if(a<1n)a=1n;if(b<1n)b=1n;
 for(;;){let nA=c1Ceil(2n*L2*b,3n*W2);if(nA<a)nA=a;let nB=c1Ceil(2n*W2*nA,3n*L2);if(nB<b)nB=b;if(nA===a&&nB===b)break;a=nA;b=nB;}
 const joints2=(a-1n)*W2+(b-1n)*L2;
 // Joint length as a rational n/d in feet, and its line at 100 cents per LF, half up.
 const n=exactRoot?joints2:(joints2*100n+C1_SCALE)/(2n*C1_SCALE),d=exactRoot?2n*C1_SCALE:100n;
 return {jointLF:Number(n)/Number(d)===0?0:Number((n*10n**12n)/d)/1e12,cents:Number((n*100n*2n+d)/(2n*d))};
}
export function c1Row(row){
 const square=row.family==='concrete-square-joint'||row.kind==='concrete'&&row.params.length===null;
 if(!square||row.expected.review)return row;
 const joints=c1RectangleJoints(row.params.area,100,row.params.spacing??10);
 if(!joints)return row;
 const lines={...row.expected.lines},before=lines['Saw-cut control joints']??0;
 delete lines['Saw-cut control joints'];if(joints.cents>0)lines['Saw-cut control joints']=joints.cents;
 return {...row,expected:{...row.expected,lines,totalCents:row.expected.totalCents-before+joints.cents,...(row.kind==='concrete'?{jointLF:joints.jointLF}:{})}};
}
// November 19, 2026 (v37, Lane B fix B8): a steep pitch makes removal slower,
// not the removed roofing heavier, so steep-pitch removal no longer adds a
// disposal line. The recorded line comes out of the expected lines and total;
// every other recorded line stands.
export function b8Row(row){
 if(row.kind!=='roof'||row.expected.review)return row;
 const lines={...row.expected.lines};let removed=0,found=false;
 for(const name of ['Steep-pitch disposal','Steep-pitch additional-layer disposal'])if(Object.hasOwn(lines,name)){found=true;removed+=lines[name];delete lines[name];}
 return found?{...row,expected:{...row.expected,lines,totalCents:row.expected.totalCents-removed}}:row;
}
