import React, { useState, useMemo, useRef } from 'react';
import { Ingredient, StockBatch, StockLog } from '../types';
import { ArrowUpRight, Plus, Trash2, CheckCircle2, RefreshCw, Layers, Sparkles, FileText, FileSpreadsheet, FileUp, Download, AlertCircle, Calendar, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker url for browser execution
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface StockMasukRow {
  id: string; // Internal temporary ID for React key
  ingredientId: string; // Existing ID or 'NEW_ITEM'
  newName: string; // If ingredientId === 'NEW_ITEM'
  category: Ingredient['category'];
  quantity: number | '';
  unit: Ingredient['unit'];
  expiryDate: string;
  location: string;
  notes: string;
}

interface StockMasukProps {
  ingredients: Ingredient[];
  userName: string;
  onBatchAddOrUpdateIngredientsAndLogs: (
    items: Ingredient[],
    newLogs: StockLog[]
  ) => Promise<void>;
}

// Helpers for data normalization
const normalizeCategory = (cat: string): Ingredient['category'] => {
  const lower = (cat || '').toLowerCase();
  if (lower.includes('sayur') || lower.includes('buah')) return 'Sayur & Buah';
  if (lower.includes('daging') || lower.includes('ikan') || lower.includes('ayam')) return 'Daging & Ikan';
  if (lower.includes('bumbu') || lower.includes('rempah')) return 'Bumbu & Rempah';
  if (lower.includes('kering')) return 'Bahan Kering';
  if (lower.includes('susu') || lower.includes('keju')) return 'Susu & Olahan';
  if (lower.includes('sembako') || lower.includes('beras') || lower.includes('minyak')) return 'Sembako';
  return 'Lainnya';
};

const normalizeUnit = (u: string): Ingredient['unit'] => {
  const lower = (u || '').toLowerCase().trim();
  if (['kg', 'kilogram', 'kilo'].includes(lower)) return 'kg';
  if (['gr', 'gram', 'g'].includes(lower)) return 'gr';
  if (['l', 'liter', 'ltr'].includes(lower)) return 'liter';
  if (['ml', 'milli'].includes(lower)) return 'ml';
  if (['pcs', 'pc', 'buah', 'biji'].includes(lower)) return 'pcs';
  if (['pack', 'pak', 'bungkus'].includes(lower)) return 'pack';
  if (['ikat'].includes(lower)) return 'ikat';
  if (['butir'].includes(lower)) return 'butir';
  return 'kg';
};

const formatDateString = (rawDate: any): string => {
  if (!rawDate) return '';
  if (typeof rawDate === 'number' && rawDate > 30000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + rawDate * 86400000);
    return date.toISOString().split('T')[0];
  }
  const str = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return '';
};

export default function StockMasuk({
  ingredients,
  userName,
  onBatchAddOrUpdateIngredientsAndLogs,
}: StockMasukProps) {
  // Helper to create an empty row
  const createEmptyRow = (index: number): StockMasukRow => ({
    id: `ROW-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
    ingredientId: '',
    newName: '',
    category: 'Sembako',
    quantity: '',
    unit: 'kg',
    expiryDate: '',
    location: 'Gudang Utama',
    notes: '',
  });

  // Default initial rows (5 blank rows)
  const [rows, setRows] = useState<StockMasukRow[]>(() =>
    Array.from({ length: 5 }, (_, i) => createEmptyRow(i))
  );

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<'FILE' | 'TEXT'>('FILE');
  const [pasteText, setPasteText] = useState('');
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add N rows
  const handleAddRows = (count: number) => {
    setRows((prev) => {
      if (prev.length >= 100) return prev;
      const targetCount = Math.min(100, prev.length + count);
      const needed = targetCount - prev.length;
      const newRows = Array.from({ length: needed }, (_, i) => createEmptyRow(prev.length + i));
      return [...prev, ...newRows];
    });
  };

  // Set exactly 100 rows
  const handleSet100Rows = () => {
    if (rows.length < 100) {
      const needed = 100 - rows.length;
      const newRows = Array.from({ length: needed }, (_, i) => createEmptyRow(rows.length + i));
      setRows((prev) => [...prev, ...newRows]);
    }
  };

  // Clear all rows
  const handleClearAllRows = () => {
    if (confirm('Apakah Anda yakin ingin mengosongkan seluruh tabel input barang masuk?')) {
      setRows([createEmptyRow(0)]);
      setSuccessMsg(null);
    }
  };

  // Update a specific row field
  const handleRowChange = (id: string, field: keyof StockMasukRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const updated = { ...r, [field]: value };

        // If user selects an existing ingredient, auto-populate unit, category, location
        if (field === 'ingredientId' && value && value !== 'NEW_ITEM') {
          const selected = ingredients.find((i) => i.id === value);
          if (selected) {
            updated.unit = selected.unit;
            updated.category = selected.category;
            updated.location = selected.location || 'Gudang Utama';
          }
        }

        return updated;
      })
    );
  };

  // Delete a specific row
  const handleDeleteRow = (id: string) => {
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      return filtered.length > 0 ? filtered : [createEmptyRow(0)];
    });
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Nama Bahan': 'Bawang Merah',
        'Jumlah Masuk': 10,
        'Satuan': 'kg',
        'Kategori': 'Bumbu & Rempah',
        'Tanggal Kadaluwarsa (YYYY-MM-DD)': '2026-12-31',
        'Lokasi Storage': 'Gudang Utama',
        'Catatan / Vendor': 'Toko Pak Edi - Nota #101'
      },
      {
        'Nama Bahan': 'Minyak Goreng',
        'Jumlah Masuk': 25,
        'Satuan': 'liter',
        'Kategori': 'Sembako',
        'Tanggal Kadaluwarsa (YYYY-MM-DD)': '2027-01-15',
        'Lokasi Storage': 'Rak A2',
        'Catatan / Vendor': 'PT Sumber Makmur'
      },
      {
        'Nama Bahan': 'Daging Sapi Segar',
        'Jumlah Masuk': 15,
        'Satuan': 'kg',
        'Kategori': 'Daging & Ikan',
        'Tanggal Kadaluwarsa (YYYY-MM-DD)': '2026-08-10',
        'Lokasi Storage': 'Freezer Dapur',
        'Catatan / Vendor': 'Pasar Baru'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Barang_Masuk");
    XLSX.writeFile(wb, "Template_Import_Barang_Masuk_100Data.xlsx");
  };

  // Process Excel (.xlsx, .xls, .csv)
  const parseExcelFile = async (file: File): Promise<StockMasukRow[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const parsedRows: StockMasukRow[] = [];

    jsonRows.forEach((rowObj: any, idx: number) => {
      if (parsedRows.length >= 100) return;

      const keys = Object.keys(rowObj);
      const findValue = (possibleHeaders: string[]) => {
        const matchKey = keys.find((k) =>
          possibleHeaders.some((h) => k.toLowerCase().trim().includes(h.toLowerCase()))
        );
        return matchKey ? String(rowObj[matchKey]).trim() : '';
      };

      const rawName = findValue(['nama', 'bahan', 'item', 'barang', 'description', 'deskripsi']) || String(rowObj[keys[0]] || '').trim();
      const rawQtyStr = findValue(['jumlah', 'qty', 'kuantitas', 'vol', 'masuk', 'amount']) || String(rowObj[keys[1]] || '').trim();
      const rawQty = parseFloat(rawQtyStr);

      if (!rawName && (isNaN(rawQty) || rawQty <= 0)) return;

      const rawUnit = findValue(['satuan', 'unit', 'uom']) || String(rowObj[keys[2]] || '').trim();
      const rawCategory = findValue(['kategori', 'category', 'jenis']) || String(rowObj[keys[3]] || '').trim();
      const rawExpiry = findValue(['kadaluwarsa', 'expiry', 'exp', 'expired', 'tgl']) || String(rowObj[keys[4]] || '').trim();
      const rawLocation = findValue(['lokasi', 'location', 'gudang', 'rak']) || String(rowObj[keys[5]] || '').trim();
      const rawNotes = findValue(['catatan', 'vendor', 'nota', 'keterangan', 'notes']) || String(rowObj[keys[6]] || '').trim();

      // Check case-insensitive match with Master Stock
      const existingMatch = ingredients.find(
        (ing) => ing.name.toLowerCase().trim() === rawName.toLowerCase().trim() || ing.id === rawName
      );

      parsedRows.push({
        id: `ROW-XLS-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        ingredientId: existingMatch ? existingMatch.id : 'NEW_ITEM',
        newName: existingMatch ? '' : rawName,
        category: (existingMatch ? existingMatch.category : normalizeCategory(rawCategory)) as Ingredient['category'],
        quantity: !isNaN(rawQty) && rawQty > 0 ? rawQty : '',
        unit: (existingMatch ? existingMatch.unit : normalizeUnit(rawUnit)) as Ingredient['unit'],
        expiryDate: formatDateString(rawExpiry),
        location: rawLocation || (existingMatch?.location || 'Gudang Utama'),
        notes: rawNotes || `Import Excel (${file.name})`,
      });
    });

    return parsedRows;
  };

  // Process PDF (.pdf)
  const parsePdfFile = async (file: File): Promise<StockMasukRow[]> => {
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageStrings = textContent.items.map((item: any) => item.str);
      fullText += pageStrings.join(' ') + '\n';
    }

    const lines = fullText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const parsedRows: StockMasukRow[] = [];

    lines.forEach((line, idx) => {
      if (parsedRows.length >= 100) return;

      const parts = line.split(/[\t,;|]+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return;

      const rawName = parts[0] || '';
      if (['nama', 'bahan', 'item', 'no', 'number', 'daftar', 'penerimaan'].includes(rawName.toLowerCase())) return;

      const rawQtyStr = parts[1] || '';
      const rawQty = parseFloat(rawQtyStr);

      if (!rawName || isNaN(rawQty) || rawQty <= 0) return;

      const existingMatch = ingredients.find(
        (ing) => ing.name.toLowerCase().trim() === rawName.toLowerCase().trim() || ing.id === rawName
      );

      parsedRows.push({
        id: `ROW-PDF-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        ingredientId: existingMatch ? existingMatch.id : 'NEW_ITEM',
        newName: existingMatch ? '' : rawName,
        category: (existingMatch ? existingMatch.category : normalizeCategory(parts[3] || '')) as Ingredient['category'],
        quantity: rawQty,
        unit: (existingMatch ? existingMatch.unit : normalizeUnit(parts[2] || '')) as Ingredient['unit'],
        expiryDate: formatDateString(parts[4] || ''),
        location: parts[5] || (existingMatch?.location || 'Gudang Utama'),
        notes: parts[6] || `Import PDF (${file.name})`,
      });
    });

    return parsedRows;
  };

  // File Change / Upload Handler
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsParsingFile(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let imported: StockMasukRow[] = [];

      if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
        imported = await parseExcelFile(file);
      } else if (ext === 'pdf') {
        imported = await parsePdfFile(file);
      } else {
        alert('Format file tidak didukung. Harap unggah file Excel (.xlsx, .xls, .csv) atau PDF (.pdf).');
        setIsParsingFile(false);
        return;
      }

      if (imported.length === 0) {
        alert('Tidak dapat membaca data barang masuk dari file. Pastikan struktur file berisi nama barang dan jumlah.');
        setIsParsingFile(false);
        return;
      }

      const matchCount = imported.filter((r) => r.ingredientId !== 'NEW_ITEM').length;
      const newItemCount = imported.length - matchCount;

      setRows(imported);
      setShowImportModal(false);
      setSuccessMsg(
        `Berhasil mengimpor ${imported.length} data barang masuk dari file "${file.name}"! (${matchCount} cocok dengan Master Stok, ${newItemCount} bahan baru).`
      );
    } catch (err: any) {
      console.error(err);
      alert('Gagal membaca file: ' + err.message);
    } finally {
      setIsParsingFile(false);
    }
  };

  // Parse bulk pasted text (Format: Nama, Jumlah, Satuan, Expiry, Lokasi)
  const handleProcessPaste = () => {
    if (!pasteText.trim()) return;

    const lines = pasteText.split('\n').filter((l) => l.trim().length > 0);
    const newPastedRows: StockMasukRow[] = lines.slice(0, 100).map((line, idx) => {
      const parts = line.split(/[\t,;]+/).map((s) => s.trim());
      const rawName = parts[0] || '';
      const rawQty = parseFloat(parts[1]) || '';

      const existingMatch = ingredients.find(
        (i) => i.name.toLowerCase().trim() === rawName.toLowerCase().trim() || i.id === rawName
      );

      return {
        id: `ROW-PASTE-${Date.now()}-${idx}`,
        ingredientId: existingMatch ? existingMatch.id : 'NEW_ITEM',
        newName: existingMatch ? '' : rawName,
        category: existingMatch ? existingMatch.category : 'Sembako',
        quantity: typeof rawQty === 'number' && !isNaN(rawQty) ? rawQty : '',
        unit: existingMatch ? existingMatch.unit : normalizeUnit(parts[2] || ''),
        expiryDate: formatDateString(parts[3] || ''),
        location: parts[4] || (existingMatch?.location || 'Gudang Utama'),
        notes: parts[5] || 'Impor Masal Teks',
      };
    });

    setRows(newPastedRows);
    setShowImportModal(false);
    setPasteText('');
    setSuccessMsg(`Berhasil mengimpor ${newPastedRows.length} baris barang masuk dari teks!`);
  };

  // Valid non-empty rows ready for saving
  const validRows = useMemo(() => {
    return rows.filter((r) => {
      const hasIngredient = r.ingredientId === 'NEW_ITEM' ? r.newName.trim().length > 0 : r.ingredientId !== '';
      const hasQty = typeof r.quantity === 'number' && r.quantity > 0;
      return hasIngredient && hasQty;
    });
  }, [rows]);

  // Handle Submit / Save All Stock In
  const handleSubmitAll = async () => {
    if (validRows.length === 0) {
      alert('Mohon isi minimal 1 baris bahan makanan dan jumlah barang masuk (> 0).');
      return;
    }

    setLoading(true);
    try {
      const timestamp = new Date().toISOString();
      const itemsToUpdateOrAdd: Ingredient[] = [];
      const newLogEntries: StockLog[] = [];

      // Process each valid row
      for (const row of validRows) {
        const qtyIn = typeof row.quantity === 'number' ? row.quantity : 0;
        if (qtyIn <= 0) continue;

        if (row.ingredientId === 'NEW_ITEM') {
          // Create brand new ingredient
          const newId = `ING-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const initialBatch: StockBatch = {
            id: `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            quantity: qtyIn,
            initialQuantity: qtyIn,
            receivedDate: timestamp,
            expiryDate: row.expiryDate || undefined,
          };

          const newIngredient: Ingredient = {
            id: newId,
            name: row.newName.trim(),
            category: row.category,
            currentStock: qtyIn,
            unit: row.unit,
            expiryDate: row.expiryDate || undefined,
            location: row.location || 'Gudang Utama',
            lastUpdated: timestamp,
            notes: row.notes || undefined,
            batches: [initialBatch],
          };

          itemsToUpdateOrAdd.push(newIngredient);

          newLogEntries.push({
            id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            timestamp: timestamp,
            ingredientId: newId,
            ingredientName: newIngredient.name,
            type: 'MASUK',
            quantity: qtyIn,
            prevStock: 0,
            newStock: qtyIn,
            user: userName,
            notes: `Penerimaan bahan baru: ${row.notes || 'Penerimaan masuk massal'}`,
          });
        } else {
          // Update existing ingredient
          const existingItem = itemsToUpdateOrAdd.find((i) => i.id === row.ingredientId) || ingredients.find((i) => i.id === row.ingredientId);
          if (!existingItem) continue;

          const newBatch: StockBatch = {
            id: `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            quantity: qtyIn,
            initialQuantity: qtyIn,
            receivedDate: timestamp,
            expiryDate: row.expiryDate || existingItem.expiryDate,
          };

          const existingBatches = existingItem.batches || [];
          const updatedBatches = [...existingBatches, newBatch];
          const prevStock = existingItem.currentStock;
          const newStock = parseFloat((prevStock + qtyIn).toFixed(3));

          const updatedIngredient: Ingredient = {
            ...existingItem,
            currentStock: newStock,
            batches: updatedBatches,
            expiryDate: row.expiryDate || existingItem.expiryDate,
            location: row.location || existingItem.location,
            lastUpdated: timestamp,
          };

          // Update in local items list
          const existingIdx = itemsToUpdateOrAdd.findIndex((i) => i.id === row.ingredientId);
          if (existingIdx !== -1) {
            itemsToUpdateOrAdd[existingIdx] = updatedIngredient;
          } else {
            itemsToUpdateOrAdd.push(updatedIngredient);
          }

          newLogEntries.push({
            id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            timestamp: timestamp,
            ingredientId: existingItem.id,
            ingredientName: existingItem.name,
            type: 'MASUK',
            quantity: qtyIn,
            prevStock: prevStock,
            newStock: newStock,
            user: userName,
            notes: `Penerimaan barang masuk: ${row.notes || 'Penambahan stok gudang'}`,
          });
        }
      }

      // Batch save to state + cloud
      await onBatchAddOrUpdateIngredientsAndLogs(itemsToUpdateOrAdd, newLogEntries);

      setSuccessMsg(`Berhasil menambahkan ${validRows.length} item penerimaan barang masuk ke Master Stok!`);
      // Reset rows
      setRows(Array.from({ length: 5 }, (_, i) => createEmptyRow(i)));
    } catch (err: any) {
      console.error(err);
      alert('Gagal memproses penambahan barang masuk: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-emerald-600" /> Penerimaan Barang Masuk (Massal / Multi-Row)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Input barang masuk hingga <strong className="text-slate-800">100 data sekaligus</strong> dari form atau file Excel / PDF.
          </p>
        </div>

        {/* Quick Actions & Importers */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddRows(1)}
            disabled={rows.length >= 100}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> +1 Baris
          </button>

          <button
            type="button"
            onClick={() => handleAddRows(5)}
            disabled={rows.length >= 100}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> +5 Baris
          </button>

          <button
            type="button"
            onClick={handleSet100Rows}
            disabled={rows.length >= 100}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Siapkan 100 Baris
          </button>

          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>Impor File (Excel / PDF)</span>
          </button>

          <button
            type="button"
            onClick={handleClearAllRows}
            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
            title="Kosongkan Tabel"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dynamic Success Alert */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-700 font-bold hover:underline cursor-pointer"
            >
              Tutup
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Table for Multi-Row Entry */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-800">Tabel Input Barang Masuk ({rows.length} Baris Tersedia)</span>
            <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full text-[10px]">
              {validRows.length} Siap Disimpan
            </span>
          </div>
          <span className="text-slate-500 font-medium text-[11px]">
            Gunakan file Excel/PDF untuk mengisi otomatis 100 data sekaligus.
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/90 text-slate-600 uppercase text-[10px] font-black tracking-wider sticky top-0 z-10 shadow-2xs">
              <tr>
                <th className="p-3 text-center w-10">No</th>
                <th className="p-3 min-w-[220px]">Bahan Makanan (Pilih / Baru)</th>
                <th className="p-3 min-w-[110px]">Jumlah Masuk</th>
                <th className="p-3 min-w-[90px]">Satuan</th>
                <th className="p-3 min-w-[130px]">Kategori</th>
                <th className="p-3 min-w-[125px]">Tgl Kadaluwarsa</th>
                <th className="p-3 min-w-[130px]">Lokasi Storage</th>
                <th className="p-3 min-w-[140px]">Catatan / Vendor</th>
                <th className="p-3 min-w-[140px] text-right">Penggabungan Master Stok</th>
                <th className="p-3 text-center w-12">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {rows.map((row, index) => {
                const selectedItem = ingredients.find((i) => i.id === row.ingredientId);
                const prevStock = selectedItem ? selectedItem.currentStock : 0;
                const qtyVal = typeof row.quantity === 'number' ? row.quantity : 0;
                const newStockPreview = selectedItem ? parseFloat((prevStock + qtyVal).toFixed(3)) : qtyVal;

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/80 transition-all ${
                      qtyVal > 0 && (row.ingredientId !== '' || row.newName.trim() !== '')
                        ? 'bg-emerald-50/30'
                        : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="p-2.5 text-center font-bold text-slate-400 text-[11px] font-mono">
                      {index + 1}
                    </td>

                    {/* Ingredient Selector or New Item Input */}
                    <td className="p-2">
                      <div className="space-y-1">
                        <select
                          value={row.ingredientId}
                          onChange={(e) => handleRowChange(row.id, 'ingredientId', e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Pilih Bahan Master Stok --</option>
                          <option value="NEW_ITEM" className="font-extrabold text-emerald-700 bg-emerald-50">
                            ✨ + Tambah Bahan Baru
                          </option>
                          <optgroup label="Bahan Terdaftar">
                            {ingredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.currentStock} {ing.unit})
                              </option>
                            ))}
                          </optgroup>
                        </select>

                        {row.ingredientId === 'NEW_ITEM' && (
                          <input
                            type="text"
                            placeholder="Ketik nama bahan baru..."
                            value={row.newName}
                            onChange={(e) => handleRowChange(row.id, 'newName', e.target.value)}
                            className="w-full text-xs bg-amber-50/80 border border-amber-300 rounded-lg px-2 py-1.5 text-slate-900 font-bold focus:outline-none focus:border-amber-500"
                          />
                        )}
                      </div>
                    </td>

                    {/* Quantity In */}
                    <td className="p-2">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0"
                        value={row.quantity}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                          handleRowChange(row.id, 'quantity', val);
                        }}
                        className="w-full text-xs font-black text-slate-900 bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500"
                      />
                    </td>

                    {/* Unit */}
                    <td className="p-2">
                      <select
                        value={row.unit}
                        onChange={(e) => handleRowChange(row.id, 'unit', e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-700 font-bold focus:outline-none focus:border-emerald-500"
                      >
                        <option value="kg">kg</option>
                        <option value="gr">gr</option>
                        <option value="liter">liter</option>
                        <option value="ml">ml</option>
                        <option value="pcs">pcs</option>
                        <option value="pack">pack</option>
                        <option value="ikat">ikat</option>
                        <option value="butir">butir</option>
                      </select>
                    </td>

                    {/* Category */}
                    <td className="p-2">
                      <select
                        value={row.category}
                        onChange={(e) => handleRowChange(row.id, 'category', e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-700 font-bold focus:outline-none focus:border-emerald-500"
                      >
                        <option value="Sembako">Sembako</option>
                        <option value="Sayur & Buah">Sayur & Buah</option>
                        <option value="Daging & Ikan">Daging & Ikan</option>
                        <option value="Bumbu & Rempah">Bumbu & Rempah</option>
                        <option value="Bahan Kering">Bahan Kering</option>
                        <option value="Susu & Olahan">Susu & Olahan</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </td>

                    {/* Expiry Date */}
                    <td className="p-2">
                      <input
                        type="date"
                        value={row.expiryDate}
                        onChange={(e) => handleRowChange(row.id, 'expiryDate', e.target.value)}
                        className="w-full text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </td>

                    {/* Storage Location */}
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Contoh: Kulkas A"
                        value={row.location}
                        onChange={(e) => handleRowChange(row.id, 'location', e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-500"
                      />
                    </td>

                    {/* Notes / Vendor */}
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Nota/Vendor..."
                        value={row.notes}
                        onChange={(e) => handleRowChange(row.id, 'notes', e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-500"
                      />
                    </td>

                    {/* Preview Stock Calculation & Auto Merge Indicator */}
                    <td className="p-2 text-right">
                      {row.ingredientId === 'NEW_ITEM' ? (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200/80 inline-block">
                          ✨ Bahan Baru (+{qtyVal} {row.unit})
                        </span>
                      ) : selectedItem ? (
                        <div className="text-[11px] font-mono leading-tight space-y-0.5">
                          <div className="text-[10px] text-emerald-800 font-extrabold flex items-center justify-end gap-1">
                            <span>Otomatis Gabung</span>
                          </div>
                          <div>
                            <span className="text-slate-400">{prevStock}</span>
                            <span className="text-emerald-600 font-bold mx-1">➜ {newStockPreview}</span>
                            <span className="text-slate-600 font-bold">{row.unit}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-300">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Hapus baris ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Bar / Save Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-600 flex items-center gap-3">
            <div>
              Total Baris Form: <strong className="text-slate-900 font-mono">{rows.length}</strong>
            </div>
            <div className="border-l border-slate-300 h-4" />
            <div>
              Siap Disimpan: <strong className="text-emerald-700 font-mono font-extrabold">{validRows.length} item</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmitAll}
            disabled={loading || validRows.length === 0}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-sm text-xs"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                <span>Simpan Semua Barang Masuk ({validRows.length} Item)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* EXCEL & PDF FILE IMPORT MODAL */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 border border-slate-100"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>Impor Massal Barang Masuk (100 Data)</span>
                </h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Mode Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setImportTab('FILE')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    importTab === 'FILE' ? 'bg-white text-emerald-900 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📄 File Excel (.xlsx / .csv) & PDF (.pdf)
                </button>
                <button
                  type="button"
                  onClick={() => setImportTab('TEXT')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    importTab === 'TEXT' ? 'bg-white text-emerald-900 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📝 Tempel Teks Catatan
                </button>
              </div>

              {importTab === 'FILE' ? (
                <div className="space-y-4">
                  {/* File Upload Box */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                      dragActive
                        ? 'border-emerald-500 bg-emerald-50/60 scale-[1.01]'
                        : 'border-slate-200 hover:border-emerald-400 bg-slate-50 hover:bg-slate-100/50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv, .pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                    />

                    {isParsingFile ? (
                      <div className="py-4 space-y-2">
                        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                        <p className="text-xs font-bold text-slate-800">Membaca data file...</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                          <Upload className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-bold text-slate-800">
                          Klik atau seret file <strong className="text-emerald-700">Excel (.xlsx, .xls)</strong> atau <strong className="text-emerald-700">PDF (.pdf)</strong> ke sini
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Mendukung hingga 100 baris data penerimaan sekaligus.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Template download & instructions */}
                  <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-100/80 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-extrabold text-emerald-900">Format Kolom Excel yang Disarankan:</p>
                      <p className="text-[11px] text-emerald-800 font-mono">
                        Nama Bahan | Jumlah Masuk | Satuan | Kategori | Expiry | Lokasi | Catatan
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" /> Download Template
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Tempel/Paste daftar barang masuk dari Excel atau catatan. Format tiap baris (dipisah koma atau tab):
                    <br />
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-800 block mt-1">
                      NamaBahan, Jumlah, Satuan, Expiry(YYYY-MM-DD), Lokasi, Catatan
                    </code>
                  </p>

                  <textarea
                    rows={7}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Bawang Merah, 10, kg, 2026-12-31, Gudang A, Toko Pak Edi\nMinyak Goreng, 25, liter, 2027-01-01, Rak B, PT Sumber Makmur\nGaram Halus, 5, pack, , Rak C, Nota #002`}
                    className="w-full text-xs border border-slate-200 rounded-xl p-3 font-mono text-slate-800 focus:outline-none focus:border-emerald-500 bg-slate-50"
                  />

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowImportModal(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleProcessPaste}
                      className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
                    >
                      Proses & Masukkan Ke Form
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

