import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';

// Sod ground preparation with a combined price and separate prices together.
const BASE={sodMaterialPerSqft:55,sodInstallLaborPerSqft:60,minimumServiceCharge:0,sodPalletSizeSqft:450,partialPackagePricing:'whole_packages',
  topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2,groundPrepPerSqft:150,groundPrepLaborPercent:70};
const cases=[];
function add(id,pricing,customer={}){
  cases.push({id:'sod-20261121:'+id,input:structuredClone(fixture('LANDSCAPING_SOD',{...BASE,...pricing},
    {sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'flat',accessDifficulty:'easy',
      ...(pricing.topsoilPerCubicYard?{usableTopsoilDepthInches:2}:{}),...customer}))});
}
add('lawn-package-topsoil',{topsoilPerCubicYard:4000});
add('lawn-package-topsoil-not-sure',{topsoilPerCubicYard:4000},{usableTopsoilDepthInches:'unknown'});
add('lawn-package-removal',{sodRemovalPerSqft:75});
add('lawn-package-grading-topsoil',{sodGradingPerSqft:60,topsoilPerCubicYard:4000});
add('lawn-itemized-removal-grading',{sodRemovalPerSqft:75,sodGradingPerSqft:60});
add('lawn-itemized-all',{sodRemovalPerSqft:75,sodGradingPerSqft:60,topsoilPerCubicYard:4000});
add('bare-topsoil-only',{topsoilPerCubicYard:4000},{existingLawnToRemove:false});
add('lawn-package-topsoil-steep-difficult',{topsoilPerCubicYard:4000},{slope:'steep',accessDifficulty:'difficult'});
writeFileSync(new URL('./corpus-additions-20261121-sod.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
