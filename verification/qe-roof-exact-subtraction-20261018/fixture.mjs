import {roof} from '../qe-roof-zero-adjustments-20261018/fixture.mjs';
export function input(row){return roof({roofSizeInput:100,pitchBand:'up_to_six',...row.customer},{
 laborPerSquare:{asphalt_shingle:10},materialCostPerSquare:{asphalt_shingle:1},tearOffPerSquare:{asphalt_shingle:10},underlaymentPerSquare:{asphalt_shingle:1},disposalPerSquare:1,...row.pricing
});}
export const OLD='quote-engine-vnext-accuracy-20261018-v9';
export const CURRENT='quote-engine-vnext-accuracy-20261018-v10';
