from fractions import Fraction as F
import json,pathlib,hashlib
root=pathlib.Path(__file__).parent
cases=json.loads((root/'expected-cases-first.json').read_text())
def r(x):
 x=F(x);return (2*x.numerator+x.denominator)//(2*x.denominator)
def ceil(x):return -(-x.numerator//x.denominator)
for row in cases:
 if row['family']=='paint-coats':row['expected']['lines']['Wall paint and materials']=row['expected']['lines'].pop('Wall materials')
 if row['family']=='roof-footprint' and F(row['params']['footprint'])<50:row['expected']={'review':True,'totalCents':None,'lines':{}}
 if row['family']=='repair-area':
  a=F(str(float(row['params']['area'])));row['expected']['totalCents']=25000+r(max(F(0),a-10)*F('100.5'));row['expected']['lines']['__total']=row['expected']['totalCents']
for base,coverage in [('184.62','100'),('1384.62','500'),('2584.62','400')]:
 for delta in ['-.000001','0','.000001']:
  footprint=F(base)+F(delta);surface=F(r(footprint*F(13,12)*100),100)
  lines={'Roofing labor':r(surface*100),'Field materials':r(surface),'Tear-off':r(surface),'Roofing disposal':r(surface),'Purchased materials: roof_roll':ceil(surface/F(coverage))*15000}
  cases.append({'id':f'roof-package-{len(cases)+1:04}','family':'roof-package','params':{'footprint':str(float(footprint)),'rise':5,'coverage':coverage},'expected':{'totalCents':sum(lines.values()),'lines':lines,'surfaceSqft':str(surface)}})
for typ in ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR']:
 for area in ['10.004975124378108','10.00497512437811']:
  total=25000+r((F(area)-10)*F('100.5'))
  cases.append({'id':f'repair-area-{len(cases)+1:04}','family':'repair-area','params':{'type':typ,'area':area},'expected':{'totalCents':total,'lines':{'__total':total}}})
(root/'expected-cases-final.json').write_text(json.dumps(cases,indent=2)+'\n')
print(json.dumps({'cases':len(cases),'sha256':hashlib.sha256((root/'expected-cases-final.json').read_bytes()).hexdigest()}))
