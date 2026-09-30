// These responses definitively reject this submission. A transport failure,
// server failure, or temporary rate limit keeps the immutable request for retry.
export const submissionCanBeEdited = status => [400,401,403,404,409,413,415,422].includes(status);
export const submissionTooLarge = submission => new TextEncoder().encode(JSON.stringify(submission)).length > 1024 * 1024;
