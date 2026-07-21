import { Ingredient, StockLog, MenuItem, UserProfile, TransactionType, UserRole } from '../types';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// Helper to make fetch calls to Google Sheets API
async function sheetsFetch(url: string, token: string, options: RequestInit = {}) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody?.error?.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
}

// 1. Create a new Spreadsheet
export async function createOpnameSpreadsheet(token: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const body = {
    properties: {
      title: 'Dapur SPPG Stock Opname & Menu Planner',
    },
    sheets: [
      { properties: { title: 'Master Stok' } },
      { properties: { title: 'Log Transaksi' } },
      { properties: { title: 'Menu Masakan' } },
      { properties: { title: 'Profil Staff' } },
    ],
  };

  const res = await sheetsFetch(SHEETS_API_BASE, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const spreadsheetId = res.spreadsheetId;
  const spreadsheetUrl = res.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Initialize Headers
  await initializeSheetHeaders(spreadsheetId, token);

  return { spreadsheetId, spreadsheetUrl };
}

// 2. Initialize headers for each sheet
async function initializeSheetHeaders(spreadsheetId: string, token: string) {
  const data = [
    {
      range: 'Master Stok!A1:J1',
      values: [['Barcode/ID', 'Nama Bahan', 'Kategori', 'Stok Saat Ini', 'Stok Minimum', 'Satuan', 'Tanggal Kadaluwarsa', 'Lokasi', 'Catatan', 'Pembaruan Terakhir']],
    },
    {
      range: 'Log Transaksi!A1:J1',
      values: [['ID Log', 'Waktu', 'Barcode', 'Nama Bahan', 'Tipe', 'Jumlah', 'Stok Sebelumnya', 'Stok Baru', 'Pengguna', 'Catatan']],
    },
    {
      range: 'Menu Masakan!A1:D1',
      values: [['ID Menu', 'Hari/Tanggal', 'Nama Menu', 'Kebutuhan Bahan (JSON)']],
    },
    {
      range: 'Profil Staff!A1:E1',
      values: [['ID Staff', 'Nama', 'Email', 'Peran', 'PIN']],
    },
  ];

  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data,
    }),
  });
}

// 3. Fetch all data from Spreadsheet
export async function fetchSpreadsheetData(spreadsheetId: string, token: string): Promise<{
  ingredients: Ingredient[];
  logs: StockLog[];
  menus: MenuItem[];
  staff: UserProfile[];
}> {
  const ranges = ['Master Stok!A2:J1000', 'Log Transaksi!A2:J5000', 'Menu Masakan!A2:D500', 'Profil Staff!A2:E200'];
  const res = await sheetsFetch(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?ranges=${ranges.join('&ranges=')}`,
    token
  );

  const valueRanges = res.valueRanges || [];

  // Parse Master Stok
  const ingredients: Ingredient[] = (valueRanges[0]?.values || []).map((row: any[]) => ({
    id: row[0] || '',
    name: row[1] || '',
    category: (row[2] || 'Lainnya') as Ingredient['category'],
    currentStock: Number(row[3]) || 0,
    unit: (row[5] || 'pcs') as Ingredient['unit'],
    expiryDate: row[6] || '',
    location: row[7] || '',
    notes: row[8] || '',
    lastUpdated: row[9] || new Date().toISOString(),
  })).filter((item: Ingredient) => item.id);

  // Parse Log Transaksi
  const logs: StockLog[] = (valueRanges[1]?.values || []).map((row: any[]) => ({
    id: row[0] || '',
    timestamp: row[1] || '',
    ingredientId: row[2] || '',
    ingredientName: row[3] || '',
    type: (row[4] || 'MASUK') as TransactionType,
    quantity: Number(row[5]) || 0,
    prevStock: Number(row[6]) || 0,
    newStock: Number(row[7]) || 0,
    user: row[8] || '',
    notes: row[9] || '',
  })).filter((log: StockLog) => log.id);

  // Parse Menu Masakan
  const menus: MenuItem[] = (valueRanges[2]?.values || []).map((row: any[]) => {
    let parsedIngredients = [];
    try {
      parsedIngredients = JSON.parse(row[3] || '[]');
    } catch {
      // Fallback
    }
    return {
      id: row[0] || '',
      day: row[1] || '',
      name: row[2] || '',
      ingredients: parsedIngredients,
    };
  }).filter((menu: MenuItem) => menu.id);

  // Parse Profil Staff
  const staff: UserProfile[] = (valueRanges[3]?.values || []).map((row: any[]) => ({
    id: row[0] || '',
    name: row[1] || '',
    email: row[2] || '',
    role: (row[3] || 'STAF_DAPUR') as UserRole,
    pin: row[4] || '1234',
  })).filter((s: UserProfile) => s.id);

  return { ingredients, logs, menus, staff };
}

// 4. Save entire database to Sheets (Batch Update all tables)
export async function syncAllDataToSheets(
  spreadsheetId: string,
  token: string,
  data: {
    ingredients: Ingredient[];
    logs: StockLog[];
    menus: MenuItem[];
    staff: UserProfile[];
  }
): Promise<void> {
  // To avoid leaving deleted data, we can clear the sheets first, or write the exact ranges.
  // A cleaner approach is to clear Master Stok, Log, Menu, and Profil ranges, and then rewrite.
  const clearRanges = ['Master Stok!A2:J1000', 'Log Transaksi!A2:J5000', 'Menu Masakan!A2:D500', 'Profil Staff!A2:E200'];
  await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, token, {
    method: 'POST',
    body: JSON.stringify({ ranges: clearRanges }),
  });

  // Prepare updates
  const updates = [
    {
      range: `Master Stok!A2:J${data.ingredients.length + 1}`,
      values: data.ingredients.map(item => [
        item.id,
        item.name,
        item.category,
        item.currentStock,
        0, // minStock column (deprecated)
        item.unit,
        item.expiryDate,
        item.location,
        item.notes || '',
        item.lastUpdated,
      ]),
    },
    {
      range: `Log Transaksi!A2:J${data.logs.length + 1}`,
      values: data.logs.map(log => [
        log.id,
        log.timestamp,
        log.ingredientId,
        log.ingredientName,
        log.type,
        log.quantity,
        log.prevStock,
        log.newStock,
        log.user,
        log.notes || '',
      ]),
    },
    {
      range: `Menu Masakan!A2:D${data.menus.length + 1}`,
      values: data.menus.map(menu => [
        menu.id,
        menu.day,
        menu.name,
        JSON.stringify(menu.ingredients),
      ]),
    },
    {
      range: `Profil Staff!A2:E${data.staff.length + 1}`,
      values: data.staff.map(s => [
        s.id,
        s.name,
        s.email,
        s.role,
        s.pin,
      ]),
    },
  ].filter(u => u.values.length > 0); // Only update if there are values

  if (updates.length > 0) {
    await sheetsFetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates,
      }),
    });
  }
}
