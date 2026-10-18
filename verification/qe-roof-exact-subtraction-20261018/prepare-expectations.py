"""Independent synthetic oracle. Fractions over decimal text; no application imports."""
from fractions import Fraction as F
import json
from pathlib import Path
D=Path(__file__).parent
cases=[]
def add(id,customer=None,pricing=None): cases.append(dict(id=id,customer=customer or {},pricing=pricing or {}))
add('story-1.15',pricing={'storyMultiplier':{'1':1.15,'2':1.1,'3':1.2}})
add('shape-1.15',pricing={'complexityLaborMultiplier':{'simple':1.15,'moderate':1.2,'complex':1.4}})
add('separate-line-control',pricing={'laborPerSquare':{'asphalt_shingle':1},'tearOffPerSquare':{'asphalt_shingle':2},'storyMultiplier':{'1':1.5,'2':1.1,'3':1.2},'complexityLaborMultiplier':{'simple':1.5,'moderate':1.2,'complex':1.4}})
for kind in ['story','shape']:
 for label,factor in [('below-half',1.14999999),('above-half',1.15000001),('neutral',1),('exact-quarter',1.25),('small-positive',1.00000001),('upper-bound',5)]:
  p={'storyMultiplier':{'1':factor,'2':1.1,'3':1.2}} if kind=='story' else {'complexityLaborMultiplier':{'simple':factor,'moderate':1.2,'complex':1.4}}
  add(kind+'-'+label,pricing=p)
for label,factor in [('below',1.14999999),('tie',1.15),('above',1.15000001)]:
 add('additional-layers-'+label,{'existingLayers':3,'stories':2},{'storyMultiplier':{'1':1,'2':factor,'3':1.2},'additionalLayerRemovalFactor':.5})
for label,customer in [('fractional-area',{'roofSizeInput':150.5}),('partial-measured',{'roofSizeInput':1000,'serviceScope':'partial','partialAreaSqft':150.5}),('partial-percent',{'roofSizeInput':301,'serviceScope':'partial','partialPercent':50})]:
 add(label,customer,{'laborPerSquare':{'asphalt_shingle':10.25},'tearOffPerSquare':{'asphalt_shingle':7.5},'storyMultiplier':{'1':1.15,'2':1.1,'3':1.2},'complexityLaborMultiplier':{'simple':1.15,'moderate':1.2,'complex':1.4}})
for label,c in [('full',{}),('partial',{'roofSizeInput':200,'serviceScope':'partial','partialAreaSqft':100})]:
 add('mixed-pitch-'+label,{**c,'pitchMethod':'area_by_pitch','pitchAreaUpTo6Sqft':25,'pitchArea7To9Sqft':25,'pitchArea10To12Sqft':25,'pitchAreaOver12Sqft':25,'existingLayers':3},{'storyMultiplier':{'1':1.15,'2':1.1,'3':1.2},'complexityLaborMultiplier':{'simple':1.15,'moderate':1.2,'complex':1.4}})
add('positive-market-scale',{'roofSizeInput':1000,'pitchBand':'ten_to_twelve','stories':2,'existingLayers':3},{'laborPerSquare':{'asphalt_shingle':20000},'materialCostPerSquare':{'asphalt_shingle':10000},'tearOffPerSquare':{'asphalt_shingle':6000},'underlaymentPerSquare':{'asphalt_shingle':100},'disposalPerSquare':2000})
add('all-zero-opt-ins',{'pitchBand':'over_twelve','stories':2,'existingLayers':3},{'pitchInstallationAdderOverTwelve':0,'pitchRemovalAdderOverTwelve':0,'additionalLayerRemovalFactor':0,'storyMultiplier':{'1':1,'2':1.15,'3':1.2}})
add('additive-story-shape',pricing={'storyMultiplier':{'1':1.15,'2':1.1,'3':1.2},'complexityLaborMultiplier':{'simple':1.15,'moderate':1.2,'complex':1.4}})
base={'laborPerSquare':{'asphalt_shingle':10},'materialCostPerSquare':{'asphalt_shingle':1},'tearOffPerSquare':{'asphalt_shingle':10},'underlaymentPerSquare':{'asphalt_shingle':1},'disposalPerSquare':1,'storyMultiplier':{'1':1,'2':1.1,'3':1.2},'complexityLaborMultiplier':{'simple':1,'moderate':1.2,'complex':1.4},'additionalLayerRemovalFactor':.7,'pitchInstallationAdderOverTwelve':.5,'pitchRemovalAdderOverTwelve':.6}
def frac(v):return F(str(v))
def evidence(v):return {'numerator':str(v.numerator),'denominator':str(v.denominator)}
def rnd(v):return (2*v.numerator+v.denominator)//(2*v.denominator)
for r in cases:
 c={'roofSizeInput':100,'serviceScope':'full','stories':1,'existingLayers':1,'roofComplexity':'simple','pitchMethod':'whole_roof','pitchBand':'up_to_six',**r['customer']}; p={**base,**r['pricing']}
 area=frac(c['roofSizeInput'])
 if c['serviceScope']=='partial': area=frac(c['partialAreaSqft']) if 'partialAreaSqft'in c else area*frac(c['partialPercent'])/100
 q=area/100;L=frac(p['laborPerSquare']['asphalt_shingle']);R=frac(p['tearOffPerSquare']['asphalt_shingle']);D=frac(p['disposalPerSquare']);s=frac(p['storyMultiplier'][str(c['stories'])])-1;h=frac(p['complexityLaborMultiplier'][c['roofComplexity']])-1;e=frac(p['additionalLayerRemovalFactor']);extra=c['existingLayers']-1
 lines=[]
 def line(name,v,delta=None):lines.append({'name':name,'unrounded':evidence(v),'cents':rnd(v),**({'delta':evidence(delta)}if delta is not None else {})})
 line('Roofing labor',q*L)
 if s:line('Story labor adjustment',q*L*s,s)
 if h:line('Roof-shape labor adjustment',q*L*h,h)
 areas={'seven_to_nine':0,'ten_to_twelve':0,'over_twelve':0}
 if c['pitchMethod']=='area_by_pitch':areas=dict(zip(areas,[c['pitchArea7To9Sqft'],c['pitchArea10To12Sqft'],c['pitchAreaOver12Sqft']]))
 elif c['pitchBand'] in areas:areas[c['pitchBand']]=area
 for band,a in areas.items():
  if a:
   i,rem={'seven_to_nine':(.2,.26),'ten_to_twelve':(.31,.41),'over_twelve':(p['pitchInstallationAdderOverTwelve'],p['pitchRemovalAdderOverTwelve'])}[band]
   line('Steep-pitch installation',frac(a)/100*L*frac(i));line('Steep-pitch removal',frac(a)/100*(R+D)*frac(rem))
 line('Field materials',q*F('1.1')*frac(p['materialCostPerSquare']['asphalt_shingle']))
 line('Tear-off',q*R)
 if extra:line('Additional-layer tear-off',q*extra*R*e)
 if s:
  line('Story tear-off adjustment',q*R*s,s)
  if extra:line('Additional-layer story adjustment',q*extra*R*e*s,s)
 line('Underlayment',q*frac(p['underlaymentPerSquare']['asphalt_shingle']))
 line('Roofing disposal',q*c['existingLayers']*D)
 r.update(expectedCents=sum(x['cents'] for x in lines),lines=lines)
assert [r['expectedCents']for r in cases[:3]]==[27,25,9]
Path(__file__).with_name('expected-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(json.dumps([{'id':r['id'],'expectedCents':r['expectedCents']}for r in cases],indent=2))
