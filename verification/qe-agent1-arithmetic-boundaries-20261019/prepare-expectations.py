from fractions import Fraction as F
from decimal import Decimal as D, localcontext, ROUND_HALF_UP, ROUND_CEILING
import json, pathlib, hashlib
root=pathlib.Path(__file__).parent
cases=[]
def r(x):
 x=F(x); return (2*x.numerator+x.denominator)//(2*x.denominator)
def ceil(x):
 x=F(x); return -(-x.numerator//x.denominator)
def add(family,params,lines,**extra):
 cases.append(dict(id=f'{family}-{len(cases)+1:04}',family=family,params=params,expected={'totalCents':sum(lines.values()),'lines':lines,**extra}))
for typ in ['FLOORING_INSTALL','FLOORING_REPLACEMENT']:
 for rate in ['100.49','100.5','100.51']:
  add('floor-half',dict(type=typ,rate=rate),{'Flooring labor':r(rate),'Flooring materials':r(rate)})
 for area in ['19.9999','20','20.0001']:
  add('floor-carton',dict(type=typ,area=area),{'Flooring labor':r(F(area)*100),'Flooring materials':r(ceil(F(area)/20)*20*F('123.45'))})
 for area in ['149.9999','150','150.0001','163.6363','163.6364','299.9999','300','300.0001','329.9999','330','330.0001']:
  a=F(area); factor=F('1.2') if a<=150 else F('1.1') if a<=300 else F(1)
  labor=max([a*factor]+([F(180)] if a>150 else [])+([F(330)] if a>300 else []))
  add('floor-room',dict(type=typ,area=area),{'Flooring labor':r(labor*100),'Flooring materials':r(a*100)})
for typ in ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY']:
 for rate in ['1.4999','1.5','1.5001']:
  add('concrete-line',dict(type=typ,rate=rate),{'Concrete labor':r(rate)+r(F(rate)/2),'Ready-mix concrete':4,'Formwork':400})
 for area in ['80.9999','81','81.0001']:
  a=F(area); yards=ceil(a*4/324)
  lines={'Concrete labor':r(a),'Ready-mix concrete':yards*18000,'Formwork':r(2*(a+1)*100),'Pump placement by volume':yards*1000}
  if yards<2:lines['Supplier short-load charge']=(2-yards)*2000
  add('concrete-increment',dict(type=typ,area=area),lines)
 for length in ['9.9999','10','10.0001']:
  a=F(length)*10;j=(ceil(F(length)/10)-1)*10
  add('concrete-joint',dict(type=typ,length=length),{'Concrete labor':r(a),'Ready-mix concrete':r(a*4),'Formwork':r(2*(F(length)+10)*100),**({'Saw-cut control joints':j*100} if j else {})})
 for area in ['99.9999','99.99999999999999','100','100.00000000000001','100.0001','399.99999999999994','400','400.00000000000006']:
  with localcontext() as ctx:
   ctx.prec=80; side=D(area).sqrt(); n=int((side/10).to_integral_value(rounding=ROUND_CEILING)); joints=((n-1)*side*2).quantize(D('.01'),rounding=ROUND_HALF_UP)
  a=F(area); lines={'Concrete labor':r(a),'Ready-mix concrete':r(a*4),'Formwork':10000}
  if joints:lines['Saw-cut control joints']=r(F(str(joints))*100)
  add('concrete-square-joint',dict(type=typ,area=area),lines,jointLF=str(joints))
for existing in ['3.9999','4','4.0001']:
 q=max(F(0),4-F(existing));add('sod-depth',dict(existing=existing),{'Sod material':32400,'Sod installation labor':32400,**({'Imported topsoil':r(q*5000)} if q else {})})
for area in ['107.9999','108','108.0001']:
 q=F(area)/108;order=F(ceil(q*F('1.15')/F('.25')),4)
 add('mulch-increment',dict(area=area),{'Mulch material':r(order*5000),'Mulch installation labor':r(q*3000)})
for qty in ['.9999','1','1.0001']:
 q=F(qty);add('mulch-stated',dict(qty=qty),{'Mulch material':r(F(ceil(q/F('.25')),4)*5000),'Mulch installation labor':r(q*3000)})
for area in ['1999.9999','2000','2000.0001']:
 add('cleanup-load',dict(area=area),{'Cleanup labor':r(area),'Debris disposal':max(10000,ceil(F(area)/2000)*12000)})
for typ in ['FENCING_INSTALL','FENCING_REPLACEMENT']:
 for length in ['7.9999','8','8.0001']:
  q=F(length);posts=ceil(q/8)+1;lines={'Fence infill installation labor':r(q*1000),'Fence infill materials':r(q*2000),'Separately priced post materials':posts*2000,'Post-hole and footing labor':posts*400,'Footing materials':posts*600}
  add('fence-span',dict(type=typ,length=length),lines)
for side in ['11.4999','11.5','11.5001']:
 a=F(side)**2; bought=ceil((F(side)+F('.5'))/12)*12*(F(side)+F('.5'))
 add('carpet-cut',dict(side=side),{'Flooring labor':r(a*100),'Flooring materials':r(bought*300),'carpet underlayment':r(a)},purchasedSqft=str(bought))
for rate in ['1.1249','1.125','1.1251']:
 add('paint-coats',dict(rate=rate),{'Wall labor — first coat':r(F(rate)*F(4,3)),'Wall labor — additional coats':r(F(rate)*F(2,3)),'Wall materials':20})
for typ in ['INTERIOR_PAINTING','EXTERIOR_PAINTING']:
 for area in ['99.9999','100','100.0001']:
  a=F(area);base={'Wall installation labor':r(a*2*100),'Wall materials':r(a*2*30),'Surface preparation labor':r(a*100),'Surface preparation materials':r(a*20),'Primer labor':r(a*50),'Primer materials':r(a*20)}
  add('paint-package',dict(type=typ,area=area),{'__total':r(a*2*100)+r(a*100)+r(a*50)+ceil(a*2/200)*4000+ceil(a/200)*2000+ceil(a/200)*1000})
for area in ['100.4999','100.5','100.5001']:
 a=F(area);add('siding-half',dict(area=area),{'Siding labor':r(a),'Siding materials':r(a)})
for typ in ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR']:
 for area in ['9.9999','10','10.0001','10.004974','10.004975124378109','10.004976','10.9999','11','11.0001']:
  extra=max(F(0),F(area)-10)
  add('repair-area',dict(type=typ,area=area),{'__total':25000+r(extra*F('100.5'))})
 for rate in ['99.9999','100','100.0001']:
  add('repair-hour',dict(type=typ,rate=rate),{'__total':r(F(rate)*F('1.005'))+1000})
for pct in ['33.329999','33.33','33.330001']:
 a=F('300.03')*F(pct)/100;add('flat-partial',dict(pct=pct),{'Flat roof labor':r(a*F('100.5')),'Membrane':r(a*F('200.25')*F('1.1')),'Tear-off':r(a*2*F('50.125'))})
for size in [12,24,60,120,600,1200,6000,12000]:
 for offset in ['.059999','.06','.060001']:
  foot=F(size)+F(offset);area=F(r(foot*F(13,12)*100),100)
  add('roof-footprint',dict(footprint=str(float(foot)),rise=5),{'Roofing labor':r(area*100),'Field materials':r(area),'Tear-off':r(area),'Underlayment':r(area),'Roofing disposal':r(area)},surfaceSqft=str(area))
for cnt in [1,2,3]:
 add('plant-count',dict(count=cnt),{'Small plant installation labor':cnt*4500,'Small plant material allowance':cnt*3000})
for rate in ['100.49','100.5','100.51']:
 for mode in ['TAX_NONE','TAX_ALL','TAX_MATERIALS']:
  for markup in ['markup','margin']:
   for minimum in [0,144,145,146,200]:
    labor=r(rate);bag=r(F(labor,10));peak=r(F(labor,10));cost=labor+bag+peak
    mark=r(F(cost,5)) if markup=='markup' else r(F(cost,4));pre=max(minimum,cost+mark)
    taxable=bag+(r(F(bag,5)) if markup=='markup' else r(F(bag,4)))
    tax=r(F(pre if mode=='TAX_ALL' else taxable,10)) if mode!='TAX_NONE' else 0
    add('mow-pipeline',dict(rate=rate,taxMode=mode,markupMode=markup,minimum=minimum),{'__total':pre+tax})
for amount in [10000,10001,10002]:
 for share in ['0','33.33','50','100']:
  mat=F(amount)*F(share)/100;labor=amount-mat
  add('custom-split',dict(amount=amount,share=share),{'__total':amount+r(mat/10)+r(labor/10)})
for qty in ['.9999','1','1.0001']:
 add('custom-measured',dict(qty=qty),{'Custom service':r(F(qty)*F('100.5'))})
(root/'expected-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(json.dumps({'cases':len(cases),'sha256':hashlib.sha256((root/'expected-cases.json').read_bytes()).hexdigest()}))
