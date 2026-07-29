import { Ingredient, StockLog, MenuItem } from '../types';

const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

export interface GoogleDocFile {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
}

// Helper for Google API fetch
async function docsFetch(url: string, token: string, options: RequestInit = {}) {
  if (!token || token === 'demo-token-1234') {
    const err = new Error('Izin Google OAuth tidak ditemukan atau berada dalam Mode Demo. Silakan klik "Hubungkan Akun Google" untuk mengizinkan akses Google Docs.');
    (err as any).isAuthError = true;
    throw err;
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const rawMsg = errorBody?.error?.message || `Google Docs API Error (Status ${response.status})`;
    
    if (response.status === 401 || rawMsg.toLowerCase().includes('invalid authentication credentials') || rawMsg.toLowerCase().includes('unauthorized') || rawMsg.toLowerCase().includes('oauth')) {
      const authErr = new Error('Sesi otentikasi Google telah kadaluwarsa atau membutuhkan izin akses ulang. Silakan klik "Hubungkan Akun Google".');
      (authErr as any).isAuthError = true;
      throw authErr;
    }

    throw new Error(rawMsg);
  }
  return response.json();
}

/**
 * Creates a brand new Google Doc with full formatted Stock Opname & Kitchen Report
 */
export async function createStockReportDoc(
  token: string,
  data: {
    ingredients: Ingredient[];
    logs: StockLog[];
    menus: MenuItem[];
    generatedBy?: string;
  }
): Promise<{ documentId: string; documentUrl: string }> {
  const title = `Laporan Stock Opname Dapur - ${new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;

  // 1. Create blank document
  const createRes = await docsFetch(DOCS_API_BASE, token, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  const documentId = createRes.documentId;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // 2. Format content text
  const totalItems = data.ingredients.length;
  const lowStockItems = data.ingredients.filter(i => i.currentStock <= 5);
  const totalStockCount = data.ingredients.reduce((acc, curr) => acc + curr.currentStock, 0);
  const todayStr = new Date().toLocaleString('id-ID');

  let reportText = `${title}\n`;
  reportText += `Dipublikasikan pada: ${todayStr}\n`;
  reportText += `Oleh: ${data.generatedBy || 'Staf Dapur SPPG'}\n`;
  reportText += `=======================================================\n\n`;

  reportText += `1. RINGKASAN STOK ASET\n`;
  reportText += `-------------------------------------------------------\n`;
  reportText += `• Total Jenis Bahan Baku: ${totalItems} item\n`;
  reportText += `• Total Volume/Jumlah Stok: ${totalStockCount}\n`;
  reportText += `• Bahan Perlu Restock (<= 5 unit): ${lowStockItems.length} item\n\n`;

  if (lowStockItems.length > 0) {
    reportText += `⚠️ BAHAN BAKU KRITIS / MEMBUTUHKAN RESTOCK:\n`;
    lowStockItems.forEach((item, idx) => {
      reportText += `  ${idx + 1}. ${item.name} (${item.category}): ${item.currentStock} ${item.unit} [Lokasi: ${item.location || '-'}]\n`;
    });
    reportText += `\n`;
  }

  reportText += `2. DAFTAR BAHAN BAKU LENGKAP\n`;
  reportText += `-------------------------------------------------------\n`;
  data.ingredients.forEach((item, idx) => {
    reportText += `${idx + 1}. ${item.name} | Kategori: ${item.category} | Stok: ${item.currentStock} ${item.unit} | Lokasi: ${item.location || '-'}\n`;
  });
  reportText += `\n`;

  reportText += `3. RIWAYAT TRANSAKSI TERAKHIR (10 TERAKHIR)\n`;
  reportText += `-------------------------------------------------------\n`;
  const recentLogs = [...data.logs].reverse().slice(0, 10);
  if (recentLogs.length === 0) {
    reportText += `Belum ada catatan transaksi.\n`;
  } else {
    recentLogs.forEach((log, idx) => {
      reportText += `${idx + 1}. [${log.timestamp}] ${log.ingredientName} (${log.type}): ${log.quantity} | Oleh: ${log.user} | Ket: ${log.notes || '-'}\n`;
    });
  }
  reportText += `\n`;

  reportText += `4. PERENCANAAN MENU MASAKAN AKTIF\n`;
  reportText += `-------------------------------------------------------\n`;
  if (data.menus.length === 0) {
    reportText += `Belum ada menu masakan yang terdaftar.\n`;
  } else {
    data.menus.forEach((menu, idx) => {
      reportText += `${idx + 1}. [${menu.day}] ${menu.name}\n`;
      if (menu.ingredients && menu.ingredients.length > 0) {
        reportText += `   Bahan: ${menu.ingredients.map(i => `${i.name} (${i.quantityRequired} ${i.unit})`).join(', ')}\n`;
      }
    });
  }
  reportText += `\n=======================================================\n`;
  reportText += `Laporan ini dihasilkan secara otomatis oleh Aplikasi Stock Opname Dapur SPPG.`;

  // 3. Batch insert text into document
  await docsFetch(`${DOCS_API_BASE}/${documentId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: reportText,
          },
        },
      ],
    }),
  });

  return { documentId, documentUrl };
}

/**
 * List existing Google Docs owned or accessible by the user in Google Drive
 */
export async function fetchUserGoogleDocs(token: string): Promise<GoogleDocFile[]> {
  const query = "mimeType='application/vnd.google-apps.document' and trashed=false";
  const url = `${DRIVE_API_BASE}?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&pageSize=20&orderBy=modifiedTime desc`;

  const response = await docsFetch(url, token);
  return (response.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    webViewLink: f.webViewLink || `https://docs.google.com/document/d/${f.id}/edit`,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
  }));
}

/**
 * Append text notes or menu logs to an existing Google Doc
 */
export async function appendNoteToDoc(
  token: string,
  documentId: string,
  noteText: string
): Promise<void> {
  const formattedText = `\n\n--- Catatan Tambahan (${new Date().toLocaleString('id-ID')}) ---\n${noteText}\n`;

  await docsFetch(`${DOCS_API_BASE}/${documentId}:batchUpdate`, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            endOfSegmentLocation: {},
            text: formattedText,
          },
        },
      ],
    }),
  });
}
