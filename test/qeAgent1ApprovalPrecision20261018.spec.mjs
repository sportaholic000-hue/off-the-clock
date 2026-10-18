import {approvalPrecisionCases,roofMinimumCases} from '../verification/qe-agent1-core-accuracy-20261018/f16-approval-cases.mjs';

// This field is already classified as discrete in Agent1's standalone tree.
// The same cases exercise pipeJackEach against A2's exact precision dependency
// through verification/.../f16-with-agent2.spec.mjs, without copying its policy.
approvalPrecisionCases('deckingPerSheet');
roofMinimumCases();
