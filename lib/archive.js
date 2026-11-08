import {validateReview} from './review.js';

export function validateArchive(input) {
  if (!input || input.format !== 'retainerlens-account-v1' || !Array.isArray(input.reviews) ||
      !Array.isArray(input.trash) || input.reviews.length + input.trash.length > 1200) {
    throw Error('Choose a RetainerLens account export or Mac document with up to 1,200 reviews.');
  }
  const keys = new Set();
  const clean = (record, trashed) => {
    const review = validateReview(record);
    const key = review.month + '|' + review.currency;
    if (keys.has(key)) throw Error('This archive has duplicate reviews for the same month and currency.');
    keys.add(key);
    if (!!record.deletedAt !== trashed) throw Error('This archive has inconsistent Trash records.');
    if (record.revision != null && (typeof record.revision !== 'string' || record.revision.length > 100)) throw Error('This archive has an invalid saved version.');
    for (const field of ['updatedAt', 'deletedAt']) {
      if (record[field] != null && (typeof record[field] !== 'string' || record[field].length > 40 || !Number.isFinite(Date.parse(record[field])))) {
        throw Error('This archive has an invalid review timestamp.');
      }
    }
    return {...review, revision: record.revision ?? null, updatedAt: record.updatedAt ?? null,
      deletedAt: record.deletedAt ?? null, localEdited: record.localEdited === true};
  };
  return {format: 'retainerlens-account-v1', reviews: input.reviews.map(r => clean(r, false)), trash: input.trash.map(r => clean(r, true))};
}

export function workingArchive(review, revision = null) {
  const clean = validateReview(review);
  return {format: 'retainerlens-account-v1', exportedAt: new Date().toISOString(),
    reviews: [{...clean, revision, updatedAt: null, deletedAt: null, localEdited: true}], trash: []};
}
