import { exactAdd, exactSubtract, exactMultiply, exactDivide, exactCompare } from './exactMath.js';
import { denseArrayIssue, snapshotPlainData } from './safeData.js';

// Explicitly closed, simple orthogonal outline; coordinates are measured feet.
// Curves, diagonal edges, holes, touching/crossing edges, and multiple regions require review.
export function measuredOutlineVNext(input) {
  const snapshot=snapshotPlainData({points:input},'outline');
  if(!snapshot.ok||snapshot.nonPlainPaths.length)throw new TypeError('Outline must be plain measured data.');
  const points=snapshot.value.points;
  if(!Array.isArray(points)||denseArrayIssue(points)||points.length<5||points.length>101)throw new TypeError('A closed outline requires 4 through 100 measured edges.');
  for(const p of points)if(!p||Array.isArray(p)||Object.keys(p).length!==2||!Object.hasOwn(p,'x')||!Object.hasOwn(p,'y')||[p.x,p.y].some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000))throw new TypeError('Each point requires finite x and y coordinates within 100,000 feet of the origin.');
  const last=points.length-1;
  if(points[0].x!==points[last].x||points[0].y!==points[last].y)throw new TypeError('Outline must explicitly close at its first measured point.');
  let twiceArea=exactMultiply(0),perimeter=exactMultiply(0);
  const edges=[];
  for(let i=0;i<last;i++){
    const a=points[i],b=points[i+1];
    if((a.x===b.x)===(a.y===b.y))throw new TypeError('Every edge must be nonzero and horizontal or vertical.');
    const dx=exactSubtract(a.x,b.x),dy=exactSubtract(a.y,b.y);
    perimeter=exactAdd(perimeter,exactCompare(dx,0)<0?exactMultiply(dx,-1):dx,exactCompare(dy,0)<0?exactMultiply(dy,-1):dy);
    twiceArea=exactAdd(twiceArea,exactSubtract(exactMultiply(a.x,b.y),exactMultiply(b.x,a.y)));
    edges.push({minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y),vertical:a.x===b.x});
  }
  for(let i=0;i<last;i++)for(let j=i+1;j<last;j++){
    const a=edges[i],b=edges[j],adjacent=j===i+1||(i===0&&j===last-1);
    const intersects=Math.max(a.minX,b.minX)<=Math.min(a.maxX,b.maxX)&&Math.max(a.minY,b.minY)<=Math.min(a.maxY,b.maxY);
    const collinearOverlap = a.vertical === b.vertical && (a.vertical
      ? Math.max(a.minY, b.minY) < Math.min(a.maxY, b.maxY)
      : Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX));
    if(intersects&&(!adjacent||collinearOverlap))throw new TypeError('Outline edges cannot overlap, touch nonadjacent edges, or cross.');
  }
  const area=exactDivide(exactCompare(twiceArea,0)<0?exactMultiply(twiceArea,-1):twiceArea,2);
  if(exactCompare(area,1)<0||exactCompare(area,10000000)>0||exactCompare(perimeter,0.1)<0||exactCompare(perimeter,1000000)>0)throw new TypeError('Derived outline area and perimeter must satisfy the direct measurement bounds.');
  return {exactAreaSqft:area,exactPerimeterLF:perimeter};
}
