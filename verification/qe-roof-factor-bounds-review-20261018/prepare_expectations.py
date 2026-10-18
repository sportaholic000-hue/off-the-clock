"""Independent preparation only: builtins, Fraction, and the frozen fixture.

No engine, validator, production exact-math helper, or application import.
Signed half-cent values are recorded as algebra, NOT assigned a rounding policy.
"""
import copy,datetime,hashlib,json,math,pathlib
from fractions import Fraction as F

D=pathlib.Path(__file__).resolve().parent
base=json.loads((D/'fixture.json').read_text())
cases=[]
values=[-1,0,.099999,.1,.100001,.5,.999999,1,1.000001,1.2,5,5.000001,'0.5','@null','@undefined','@NaN','@Infinity']

def fraction(n):return F(str(n))
def ev(n):return {'numerator':str(n.numerator),'denominator':str(n.denominator)}
def round_nonnegative(n):
    assert n>=0
    return (2*n.numerator+n.denominator)//(2*n.denominator)
def rounded_signed_if_integral(n):
    if n>=0:return round_nonnegative(n)
    return int(n) if n.denominator==1 else None
def model(f):
    c=f['customerInputs'];p=f['ownerPricing']['pricing'];q=fraction(c['roofSizeInput'])/100
    s=fraction(p['storyMultiplier'][str(c['stories'])]);h=fraction(p['complexityLaborMultiplier'][c['roofComplexity']])
    l=fraction(p['laborPerSquare']['product_0']);t=fraction(p['tearOffPerSquare']['product_0']);d=fraction(p['disposalPerSquare']);n=c['existingLayers'];a=fraction(p['additionalLayerRemovalFactor'])
    material=q*(1+fraction(p['wasteFactorByComplexity'][c['roofComplexity']]))*fraction(p['materialCostPerSquare']['product_0'])
    under=q*fraction(p['underlaymentPerSquare']['product_0']);disposal=q*n*d
    if c.get('pitchMethod')=='area_by_pitch':
        areas={'up_to_six':fraction(c.get('pitchAreaUpTo6Sqft',0))/100,'seven_to_nine':fraction(c.get('pitchArea7To9Sqft',0))/100,'ten_to_twelve':fraction(c.get('pitchArea10To12Sqft',0))/100}
    else:areas={c.get('pitchBand','up_to_six'):q}
    install_parts=[q*l,q*l*(s-1),q*l*(h-1)]
    tear_parts=[q*t,q*(n-1)*t*a,q*t*(s-1),q*(n-1)*t*a*(s-1)]
    steep=[]
    for band,area in areas.items():
        if band=='up_to_six' or not area:continue
        install_parts.append(area*l*fraction(p['pitchInstallationAdder'][band]))
        steep.append(area*(t+d)*fraction(p['pitchRemovalAdder'][band]))
    legacy=f['ownerPricing'].get('startingValueAdoptions',{}).get('roofing_replacement_20261016',{}).get('mode')=='legacy'
    if legacy:
        pitch=fraction(p['pitchMultiplier'][c['pitch']]);install_parts=[q*l*s*pitch];tear_parts=[q*n*t*s*pitch];steep=[]
    installation=sum(install_parts,F(0));tear=sum(tear_parts,F(0));total=installation+tear+sum(steep,F(0))+material+under+disposal
    rounded=[rounded_signed_if_integral(x) for x in install_parts+tear_parts+steep+[material,under,disposal]]
    return {'installationExact':ev(installation),'tearOffExact':ev(tear),'grandTotalExact':ev(total),
        'separateTermRoundedTotalCents':sum(rounded) if all(x is not None for x in rounded) else None,
        'installationRoundedOnceCents':rounded_signed_if_integral(installation),
        'signedTermRoundingPolicyAssumed':False,
        'componentDomain':'negative' if installation<0 else 'zero' if installation==0 else 'positive',
        'grandTotalDomain':'negative' if total<0 else 'zero' if total==0 else 'positive',
        'note':'Formal existing additive algebra; negative charge eligibility is not inferred.'}
def add(id,changes=None,category='combination',expected_valid=True,literal=None):
    f=copy.deepcopy(base)
    if changes:changes(f)
    expectation=model(f) if expected_valid else None
    if literal is not None:assert expectation['separateTermRoundedTotalCents']==literal,(id,expectation,literal)
    cases.append({'id':id,'category':category,'input':f,'expectedClass2Valid':expected_valid,'independent':expectation,'literalExpectedCents':literal})

add('control',literal=391000)
for axis,keys in [('storyMultiplier',['1','2','3']),('complexityLaborMultiplier',['simple','moderate','complex'])]:
    for key in keys:
        for value in values:
            valid=isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and .1<=value<=5
            def change(f,axis=axis,key=key,value=value):
                f['ownerPricing']['pricing'][axis][key]=value
                f['customerInputs']['stories' if axis=='storyMultiplier' else 'roofComplexity']=int(key) if axis=='storyMultiplier' else key
            kind='number' if isinstance(value,(int,float)) else 'text-or-sentinel'
            add(f'boundary/{axis}/{key}/{kind}/{value}',change,'boundary',valid)

for name,s,h,band,n,literal in [
    ('story-half',.5,1,'up_to_six',1,261000),
    ('shape-half',1,.5,'up_to_six',1,291000),
    ('positive-combined',.5,.6,'up_to_six',1,181000),
    ('opposing-story-reduction',.5,1.6,'up_to_six',1,381000),
    ('opposing-shape-reduction',1.6,.5,'up_to_six',1,447000),
    ('zero-installation',.5,.5,'up_to_six',1,161000),
    ('negative-installation-positive-total',.4,.4,'up_to_six',1,115000),
    ('zero-grand-total',.1,.215,'up_to_six',1,0),
    ('negative-one-cent-grand-total',.1,.214995,'up_to_six',1,-1),
    ('positive-one-cent-grand-total',.1,.215005,'up_to_six',1,1),
    ('minimum-factors-negative-total',.1,.1,'up_to_six',1,-23000),
    ('upper-pitch-offset',.5,.5,'ten_to_twelve',1,255800),
    ('story-three-layers',.5,1,'up_to_six',3,343000),
    ('shape-three-layers',1,.5,'up_to_six',3,415000)
]:
    def change(f,s=s,h=h,band=band,n=n):
        f['ownerPricing']['pricing']['storyMultiplier']['1']=s;f['ownerPricing']['pricing']['complexityLaborMultiplier']['simple']=h
        f['customerInputs']['pitchBand']=band;f['customerInputs']['existingLayers']=n
    add(name,change,literal=literal)

for s in [.1,.4,.5,.6,.9,1,1.1,1.2,5]:
    for h in [.1,.4,.5,.6,.9,1,1.1,1.2,5]:
        def change(f,s=s,h=h):f['ownerPricing']['pricing']['storyMultiplier']['1']=s;f['ownerPricing']['pricing']['complexityLaborMultiplier']['simple']=h
        add(f'grid/{s}/{h}',change,'grid')

for name,s,h,literal in [('legacy-control',1,1,391000),('legacy-story-half',.5,1,261000),('legacy-shape-half',1,.5,391000),('legacy-both-minimum',.1,.1,157000)]:
    def change(f,s=s,h=h):
        f['ownerPricing']['startingValueAdoptions']['roofing_replacement_20261016']['mode']='legacy'
        f['ownerPricing']['pricing']['storyMultiplier']['1']=s;f['ownerPricing']['pricing']['complexityLaborMultiplier']['simple']=h
        f['customerInputs']['pitch']='low';f['customerInputs'].pop('pitchMethod',None);f['customerInputs'].pop('pitchBand',None)
    add(name,change,'legacy',literal=literal)

for name,s,h,l,t,literal in [('rounding-story-1.15',1.15,1,10,10,27),('rounding-shape-1.15',1,1.15,10,10,25),('rounding-grouping-counterexample',1.5,1.5,1,2,9)]:
    def change(f,s=s,h=h,l=l,t=t):
        p=f['ownerPricing']['pricing'];f['customerInputs']['roofSizeInput']=100
        p['storyMultiplier']['1']=s;p['complexityLaborMultiplier']['simple']=h
        p['laborPerSquare']['product_0']=l;p['tearOffPerSquare']['product_0']=t;p['materialCostPerSquare']['product_0']=1;p['underlaymentPerSquare']['product_0']=1;p['disposalPerSquare']=1
    add(name,change,'rounding',literal=literal)

result={'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':'1857b7779b83b70f7753b41b72c3677270cd4ffc','reference':'befc00358dfc82a864eaffeb229db7c386045051','engineCallsDuringPreparation':0,'cases':cases}
blob=json.dumps(result,indent=2,allow_nan=False)+'\n';(D/'expected-cases.json').write_text(blob)
(D/'expectations.sha256').write_text(hashlib.sha256(blob.encode()).hexdigest()+'  expected-cases.json\n')
print(json.dumps({'preparedAt':result['preparedAt'],'cases':len(cases),'sha256':hashlib.sha256(blob.encode()).hexdigest(),'engineCallsDuringPreparation':0}))
