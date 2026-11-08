import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const reviews = sqliteTable('reviews', {
 userId: text('user_id').notNull(), month: text('month').notNull(), currency: text('currency').notNull(),
 revision: text('revision').notNull().default(''), deletedAt: text('deleted_at'),
 target: integer('target').notNull(), data: text('data').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({columns:[table.userId,table.month,table.currency]})]);
