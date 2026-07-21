export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'STAF_DAPUR';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin: string; // 4-digit PIN for quick access in kitchen
}

export interface StockBatch {
  id: string; // e.g. BATCH-timestamp
  quantity: number; // remaining stock in this batch
  initialQuantity: number; // original quantity added
  receivedDate: string; // ISO timestamp
  expiryDate?: string; // YYYY-MM-DD
}

export interface Ingredient {
  id: string; // Barcode or auto-generated ID
  name: string;
  category: 'Sembako' | 'Sayur & Buah' | 'Daging & Ikan' | 'Bumbu & Rempah' | 'Bahan Kering' | 'Susu & Olahan' | 'Lainnya';
  currentStock: number;
  unit: 'kg' | 'gr' | 'liter' | 'ml' | 'pcs' | 'pack' | 'ikat' | 'butir';
  expiryDate?: string; // YYYY-MM-DD (now optional)
  location: string; // e.g., 'Kulkas Utama', 'Rak Kering A'
  lastUpdated: string;
  notes?: string;
  batches?: StockBatch[]; // FIFO/FEFO batches
}

export type TransactionType = 'MASUK' | 'KELUAR' | 'OPNAME_ADJUST';

export interface StockLog {
  id: string;
  timestamp: string;
  ingredientId: string;
  ingredientName: string;
  type: TransactionType;
  quantity: number; // For OPNAME_ADJUST, this represents the correction delta (New - Old)
  prevStock: number;
  newStock: number;
  user: string;
  notes?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  day: string; // Monday, Tuesday, etc. or Date string YYYY-MM-DD
  ingredients: {
    ingredientId: string;
    name: string;
    quantityRequired: number;
    unit: string;
  }[];
}

export interface SheetConfig {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  isSynced: boolean;
  lastSyncedAt: string | null;
}
