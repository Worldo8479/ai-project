const key = review => review.month + '|' + review.currency;

// A working copy keeps the version it was loaded from. History refreshes must
// never silently rebase it onto a newer saved record.
export class WorkingVersion {
  constructor() { this.source = null; this.generation = 0; }
  load(review, revision = review.revision ?? null) {
    this.source = {key: key(review), revision};
    this.generation++;
  }
  reset() { this.source = null; this.generation++; }
  expected(review) { return this.source?.key === key(review) ? this.source.revision : null; }
  saved(savedReview, revision, generation, currentReview) {
    if (generation !== this.generation || key(savedReview) !== key(currentReview)) return false;
    this.source = {key: key(savedReview), revision};
    return true;
  }
}
