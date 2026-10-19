# Offline oracle: no production JavaScript imported. Run before comparisons.
from fractions import Fraction as F
from decimal import Decimal, localcontext
from math import isqrt
from pathlib import Path
import json, hashlib
root=Path(__file__).parent
rows=[]
def rounded(x):
 x=F(x);return (2*x.numerator+x.denominator)//(2*x.denominator)
def ceil(x):return -(-x.numerator//x.denominator)
def rootrounded(x):
 # Independent 100-digit decimal root; certify its half-up interval exactly.
 with localcontext() as ctx:
  ctx.prec=100
  value=(Decimal(x.numerator)/Decimal(x.denominator)).sqrt()
  result=int(value.to_integral_value(rounding='ROUND_HALF_UP'))
 lower=F(2*result-1,2);upper=F(2*result+1,2)
 assert (result==0 or lower*lower<=x) and x<upper*upper
 return result
def num(x):return float(x)
def roof(footprint,rise,pct=100,coverage=None,waste=0,bundles=None,both=False):
 fp=F(str(footprint));rise=F(str(rise));pct=F(str(pct));waste=F(str(waste))
 surface=F(rootrounded(fp*fp*(144+rise*rise)*10000/144),100)
 area=surface*pct/100
 material=area*(1+waste)
 if bundles:material=F(ceil(material*bundles/100)*100,bundles)
 lines={'Roofing labor':rounded(area*100),'Field materials':rounded(material),'Tear-off':rounded(area),'Roofing disposal':rounded(area)}
 if rise>6:lines.update({'Steep-pitch installation':rounded(area*25),'Steep-pitch removal':rounded(area)})
 if coverage:lines['Purchased materials: roof_roll']=ceil(area*(1+waste)/F(str(coverage)))*15000
 else:lines['Underlayment']=rounded(area)
 rows.append({'id':f'extended-roof-{len(rows)+1:03}','kind':'roof','params':{'footprint':num(fp),'rise':num(rise),'pct':num(pct),'coverage':coverage,'waste':num(waste),'bundles':bundles,'both':both},'expected':{'surface':num(surface),'area':num(area),'squares':num(area/100),'rolls':ceil(area*(1+waste)/F(str(coverage))) if coverage else None,'lines':lines,'totalCents':sum(lines.values())}})
for rise in [0,1,2.5,3,6,7,9,12,16,35,100]:
 for fp in ['600.059999','600.06','600.060001']:
  for pct in [100,50,33.3]:roof(fp,rise,pct)
# Exact half-hundredth ties and adjacent values, with and without partial scope,
# then package rounding at both zero and 10% waste.
for rise,fp in [(0,F('1000.005')),(5,F('2584.62')),(9,F('800.004')),(16,F('600.003'))]:
 for delta in [F('-0.000001'),F(0),F('0.000001')]:
  for pct in [100,50]:
   for waste in [0,F('0.1')]:
    surfaceBoundary=2800 if rise==5 else 1000
    roof(fp+delta,rise,pct,num(F(surfaceBoundary)*F(pct,100)*(1+waste)/2),waste)
# Contract must accept the partial measured area only when it equals the area
# derived from rounded surface, not from a prematurely rounded binary root.
for rise,fp in [(5,'600.06'),(9,'800.004'),(16,'600.003')]:
 roof(fp,rise,50,coverage=250,waste=F('.1'),both=True)
for fp in ['600.059999','600.06','600.060001']:roof(fp,5,33.3,coverage=100,waste=F('.1'),bundles=3)

def concrete(typ,area=None,spacing=10,thickness=4,length=None,width=10):
 rect=length is not None
 if rect:
  l,w=F(str(length)),F(str(width));a=l*w
  joint=max(0,ceil(l/F(str(spacing)))-1)*w+max(0,ceil(w/F(str(spacing)))-1)*l
  perimeter=2*(l+w)
 else:
  a=F(str(area));s=F(str(spacing));squared=a/(s*s)
  k=isqrt(squared.numerator//squared.denominator)
  spans=k+(k*k<squared)
  joint=F(rootrounded(a*(200*max(0,spans-1))**2),100);perimeter=F(100)
 lines={'Concrete labor':rounded(a),'Ready-mix concrete':rounded(a*F(str(thickness))),'Formwork':rounded(perimeter*100)}
 # Names are independently mapped to production vocabulary in test assertions.
 if joint:lines['Saw-cut control joints']=rounded(joint*100)
 rows.append({'id':f'extended-concrete-{len(rows)+1:03}','kind':'concrete','params':{'type':typ,'area':None if rect else num(a),'spacing':spacing,'thickness':thickness,'length':length,'width':width},'expected':{'jointLF':num(joint),'area':num(a),'lines':lines,'totalCents':sum(lines.values())}})
for typ in ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY']:
 for area in ['99.99999999999999','100','100.00000000000001','399.99999999999994','400','400.00000000000006','100.05000624999998','100.05000625','100.05000625000002','400.05000156249995','400.0500015625','400.05000156250006','600']:
  concrete(typ,area)
 for spacing,thickness,areas in [(12.5,5.5,['156.24999999999997','156.25','156.25000000000003']),(15,6,['224.99999999999997','225','225.00000000000003'])]:
  for area in areas:concrete(typ,area,spacing,thickness)
 for length in [9.999999999999998,10,10.000000000000002,19.999999999999996,20,20.000000000000004]:concrete(typ,length=length)
root.joinpath('extended-expectations.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'sha256':hashlib.sha256(root.joinpath('extended-expectations.json').read_bytes()).hexdigest()}))
