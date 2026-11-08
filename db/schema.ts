import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const reviews = sqliteTable('reviews', {
 userId: text('user_id').notNull(), month: text('month').notNull(), currency: text('currency').notNull(),
 revision: text('revision').notNull().default(''), deletedAt: text('deleted_at'),
 target: integer('target').notNull(), data: text('data').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [primaryKey({columns:[table.userId,table.month,table.currency]})]);

// Sandbox-only billing state. Scope identifies one configured Stripe sandbox.
// Never reuse a scope with a different merchant/sandbox.
export const billingAccounts = sqliteTable('billing_accounts', {
 scope: text('scope').notNull(), userId: text('user_id').notNull(),
 reference: text('reference').notNull().unique(),
 customerId: text('customer_id'), customerKey: text('customer_key').notNull().unique(),
 customerRequestedAt: integer('customer_requested_at'),
 lockToken: text('lock_token'), lockUntil: integer('lock_until').notNull().default(0),
}, table => [primaryKey({columns:[table.scope,table.userId]}),
 uniqueIndex('billing_customer_owner').on(table.scope,table.customerId)]);

export const billingCheckouts = sqliteTable('billing_checkouts', {
 requestKey: text('request_key').primaryKey(),
 accountReference: text('account_reference').notNull().references(()=>billingAccounts.reference),
 createdAt: integer('created_at').notNull(), sessionId: text('session_id').unique(),
 state: text('state').notNull().default('pending'), expiresAt: integer('expires_at'),
}, table => [uniqueIndex('billing_active_checkout').on(table.accountReference)
 .where(sql`${table.state} != 'expired'`)]);
