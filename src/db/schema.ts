import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').default('staff'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ingredients = pgTable('ingredients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  currentStock: integer('current_stock').notNull().default(0),
  unit: text('unit').notNull(),
  minStock: integer('min_stock').notNull().default(5),
  location: text('location'),
  expiryDate: text('expiry_date'),
  notes: text('notes'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const stockLogs = pgTable('stock_logs', {
  id: serial('id').primaryKey(),
  ingredientId: integer('ingredient_id').references(() => ingredients.id),
  ingredientName: text('ingredient_name').notNull(),
  type: text('type').notNull(), // 'masuk' | 'keluar' | 'opname'
  quantity: integer('quantity').notNull(),
  unit: text('unit').notNull(),
  timestamp: text('timestamp').notNull(),
  user: text('user').notNull(),
  notes: text('notes'),
  supplier: text('supplier'),
  recipient: text('recipient'),
  createdAt: timestamp('created_at').defaultNow(),
});
