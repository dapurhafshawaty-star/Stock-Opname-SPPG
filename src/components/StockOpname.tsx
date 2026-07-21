import React, { useState, useMemo } from 'react';
import { Ingredient, StockLog, UserRole } from '../types';
import { Search, AlertCircle, Plus, CheckCircle, RotateCcw, ClipboardCheck, ArrowRight, Save, Info, RefreshCw, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

interface StockOpnameProps {
  ingredients: Ingredient[];
  userRole: UserRole;
  userName: string;
  onUpdateIngredientsBatch: (items: Ingredient[]) => Promise<void>;
  onLogTransactionsBatch: (logs: StockLog[]) => Promise<void>;
}

interface OpnameEntry {
  ingredientId: string;
  name: string;
  category: string;
  systemStock: number;
  physicalStock: number;
  unit: string;
  expiryDate: string;
  location: string;
  notes: string;
}

export default function StockOpname({
  ingredients,
  userRole,
  userName,
  onUpdateIngredientsBatch,
  onLogTransactionsBatch,
}: StockOpnameProps) {
  // Active Opname Entries (temporary state during active session)
  const [activeSession, setActiveSession] = useState<OpnameEntry[]>([]);
  
  // Single Item Input State
  const [scannedItem, setScannedItem] = useState<Ingredient | null>(null);
  const [physicalCountInput, setPhysicalCountInput] = useState<number | ''>('');
  const [expiryInput, setExpiryInput] = useState('');
  const [opnameItemNotes, setOpnameItemNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Loading State
  const [loading, setLoading] = useState(false);

  // Filtered ingredients list for manual selection
  const filteredIngredients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter(i => 
      i.name.toLowerCase().includes(term) ||
      i.id.toLowerCase().includes(term) ||
      i.category.toLowerCase().includes(term)
    );
  }, [ingredients, searchTerm]);

  // Search/Select Item manually
  const handleSelectItem = (item: Ingredient) => {
    setScannedItem(item);
    setPhysicalCountInput(item.currentStock); // default to system stock for quick adjustment
    setExpiryInput(item.expiryDate || '');
    setOpnameItemNotes('');
    setSearchTerm('');
  };

  // Keyboard Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    const matched = ingredients.find(
      (item) =>
        item.id.toLowerCase() === searchTerm.trim().toLowerCase() ||
        item.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
    );

    if (matched) {
      handleSelectItem(matched);
    } else {
      alert(`Bahan makanan "${searchTerm}" tidak ditemukan.`);
    }
  };

  // Add Item to Active Session List
  const handleAddEntryToSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedItem || physicalCountInput === '') return;

    // Check if item is already in active session
    const existsIndex = activeSession.findIndex(entry => entry.ingredientId === scannedItem.id);

    const newEntry: OpnameEntry = {
      ingredientId: scannedItem.id,
      name: scannedItem.name,
      category: scannedItem.category,
      systemStock: scannedItem.currentStock,
      physicalStock: Number(physicalCountInput),
      unit: scannedItem.unit,
      expiryDate: expiryInput,
      location: scannedItem.location,
      notes: opnameItemNotes.trim() || 'Dihitung dalam opname',
    };

    if (existsIndex > -1) {
      // Overwrite existing entry in current session
      const updatedSession = [...activeSession];
      updatedSession[existsIndex] = newEntry;
      setActiveSession(updatedSession);
    } else {
      // Append new entry
      setActiveSession([...activeSession, newEntry]);
    }

    // Reset input fields
    setScannedItem(null);
    setPhysicalCountInput('');
    setExpiryInput('');
    setOpnameItemNotes('');
  };

  // Remove entry from current list
  const handleRemoveEntry = (id: string) => {
    setActiveSession(activeSession.filter(entry => entry.ingredientId !== id));
  };

  // Clear entire session
  const handleResetSession = () => {
    const confirmReset = window.confirm('Apakah Anda yakin ingin membatalkan sesi Stock Opname aktif ini? Semua hitungan sementara akan dihapus.');
    if (confirmReset) {
      setActiveSession([]);
      setScannedItem(null);
    }
  };

  // Select and input all filtered items to audited list
  const handleSelectAllFiltered = () => {
    if (filteredIngredients.length === 0) return;

    const newEntries = filteredIngredients.map(item => ({
      ingredientId: item.id,
      name: item.name,
      category: item.category,
      systemStock: item.currentStock,
      physicalStock: item.currentStock,
      unit: item.unit,
      expiryDate: item.expiryDate || '',
      location: item.location,
      notes: 'Dihitung dalam opname',
    }));

    setActiveSession(prev => {
      const merged = [...prev];
      newEntries.forEach(newEntry => {
        const idx = merged.findIndex(entry => entry.ingredientId === newEntry.ingredientId);
        if (idx > -1) {
          merged[idx] = newEntry;
        } else {
          merged.push(newEntry);
        }
      });
      return merged;
    });
  };

  // Submit complete Session to cloud Sheets
  const handleSubmitSession = async () => {
    if (activeSession.length === 0) return;

    const confirmSubmit = window.confirm(`Simpan hasil Stock Opname untuk ${activeSession.length} bahan makanan? Data stok di sistem akan diperbarui secara otomatis.`);
    if (!confirmSubmit) return;

    setLoading(true);
    try {
      const updatedIngredients: Ingredient[] = [];
      const logs: StockLog[] = [];
      const timestamp = new Date().toISOString();

      activeSession.forEach(entry => {
        // Find matching original ingredient
        const original = ingredients.find(i => i.id === entry.ingredientId);
        if (!original) return;

        const discrepancy = entry.physicalStock - entry.systemStock;

        // Create updated ingredient payload
        updatedIngredients.push({
          ...original,
          currentStock: entry.physicalStock,
          expiryDate: entry.expiryDate, // correct expiry if changed physically
          lastUpdated: timestamp,
        });

        // Always log the opname adjustment, even if discrepancy is 0 (to record that the item was successfully audited)
        logs.push({
          id: 'LOG-OPN-' + Math.floor(100000 + Math.random() * 900000) + '-' + Date.now(),
          timestamp,
          ingredientId: entry.ingredientId,
          ingredientName: entry.name,
          type: 'OPNAME_ADJUST',
          quantity: discrepancy,
          prevStock: entry.systemStock,
          newStock: entry.physicalStock,
          user: userName,
          notes: entry.notes || `Stock opname rutin: ${discrepancy === 0 ? 'Sesuai' : discrepancy > 0 ? 'Kelebihan stok' : 'Penyusutan stok'}`,
        });
      });

      // Submit batch updates
      await onUpdateIngredientsBatch(updatedIngredients);
      await onLogTransactionsBatch(logs);

      // Reset
      setActiveSession([]);
      alert('Sesi Stock Opname berhasil diselesaikan! Data sisa stok telah diperbarui dan disinkronkan ke Google Sheets.');
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan Stock Opname: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export audited items list to Excel
  const handleExportToExcel = () => {
    if (activeSession.length === 0) return;

    const dataToExport = activeSession.map((entry, index) => {
      const discrepancy = entry.physicalStock - entry.systemStock;
      return {
        'No': index + 1,
        'ID Bahan': entry.ingredientId,
        'Nama Bahan': entry.name,
        'Kategori': entry.category,
        'Stok Sistem': entry.systemStock,
        'Stok Fisik': entry.physicalStock,
        'Selisih': discrepancy,
        'Satuan': entry.unit,
        'Lokasi': entry.location,
        'Tanggal Kadaluwarsa': entry.expiryDate || '-',
        'Catatan': entry.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Audit Opname");
    XLSX.writeFile(workbook, `Draft_Opname_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export audited items list to PDF
  const handleExportToPDF = () => {
    if (activeSession.length === 0) return;

    try {
      const doc = new jsPDF();
      const timestamp = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

      // Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('MUTASI / DAFTAR STOCK OPNAME', 14, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Tanggal Audit: ${timestamp} | Auditor: ${userName} | Jumlah Item: ${activeSession.length}`, 14, 26);
      doc.text('Daftar audit sisa bahan makanan hasil stock opname aktif', 14, 31);

      // Draw line
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 35, 196, 35);

      // Table Header
      let y = 43;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      doc.text('Barcode/ID', 14, y);
      doc.text('Nama Bahan', 42, y);
      doc.text('Sistem', 95, y);
      doc.text('Fisik', 120, y);
      doc.text('Selisih', 145, y);
      doc.text('Lokasi', 170, y);

      doc.line(14, y + 2, 196, y + 2);
      y += 7;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(80, 80, 80);

      activeSession.forEach((entry, index) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFont('Helvetica', 'bold');
          doc.text('Barcode/ID', 14, y);
          doc.text('Nama Bahan', 42, y);
          doc.text('Sistem', 95, y);
          doc.text('Fisik', 120, y);
          doc.text('Selisih', 145, y);
          doc.text('Lokasi', 170, y);
          doc.line(14, y + 2, 196, y + 2);
          doc.setFont('Helvetica', 'normal');
          y += 7;
        }

        const discrepancy = entry.physicalStock - entry.systemStock;
        const clippedName = entry.name.length > 22 ? entry.name.substring(0, 21) + '...' : entry.name;
        
        doc.text(entry.ingredientId.substring(0, 12), 14, y);
        doc.text(clippedName, 42, y);
        doc.text(`${entry.systemStock} ${entry.unit}`, 95, y);
        doc.text(`${entry.physicalStock} ${entry.unit}`, 120, y);
        doc.text(`${discrepancy > 0 ? '+' : ''}${discrepancy} ${entry.unit}`, 145, y);
        doc.text(entry.location || '-', 170, y);

        y += 6;
      });

      doc.save(`Draft_Opname_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor draf PDF.');
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-800">
      
      {/* Opname Helper Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 rounded-2xl text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-5.5 h-5.5" /> Sesi Stock Opname Aktif
        </h2>
        <p className="text-xs text-emerald-100 mt-1 max-w-xl">
          Lakukan audit stok harian/mingguan dapur SPPG dengan membandingkan catatan sistem dengan stok riil di lemari pendingin atau rak penyimpanan kering.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Input Form */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6 col-span-1 lg:col-span-1">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1.5">1. Cari & Hitung Bahan</h3>
            <p className="text-xs text-slate-400 mb-4">Cari secara manual nama bahan atau Kode ID bahan makanan.</p>
            
            {/* Find Item Forms */}
            <div className="flex gap-2">
              <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Kode ID atau nama bahan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 text-slate-800"
                />
              </form>
            </div>
          </div>

          {/* Selection List of Ingredients */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-500 block">Pilih Bahan Baku Untuk Diaudit</label>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                {filteredIngredients.length} item
              </span>
            </div>
            {filteredIngredients.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-150 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Pilih Semua {filteredIngredients.length} Item ke Daftar Audit
              </button>
            )}
            <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1 bg-slate-50/50">
              {filteredIngredients.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 font-semibold">Bahan tidak ditemukan</p>
              ) : (
                filteredIngredients.map(item => {
                  const isSelected = scannedItem?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className={`w-full text-left p-2 rounded-xl transition-all flex justify-between items-center cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-600 text-white shadow-sm font-semibold scale-[0.98]' 
                          : 'bg-white text-slate-700 hover:bg-slate-100/80 border border-slate-200/60'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[8px] px-1 py-0.2 rounded font-black uppercase ${
                            isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {item.category}
                          </span>
                          <span className={`text-[9px] font-mono font-bold ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                            {item.id}
                          </span>
                        </div>
                        <p className={`text-xs font-bold truncate mt-0.5 ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {item.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[9px] font-bold block ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                          STOK SISTEM
                        </span>
                        <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-indigo-600'}`}>
                          {item.currentStock} {item.unit}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Item Form */}
          {scannedItem ? (
            <form onSubmit={handleAddEntryToSession} className="space-y-4 pt-4 border-t border-slate-100">
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-xs">
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 font-bold rounded uppercase tracking-wider text-[9px]">
                  {scannedItem.category}
                </span>
                <h4 className="font-bold text-slate-900 mt-1 text-sm">{scannedItem.name}</h4>
                <p className="text-slate-500 mt-0.5">ID: {scannedItem.id} • {scannedItem.location}</p>
                <p className="font-semibold text-indigo-600 mt-1.5">Stok Sistem: {scannedItem.currentStock} {scannedItem.unit}</p>
              </div>

              {/* Physical stock Input */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Stok Fisik Terhitung ({scannedItem.unit})</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  required
                  placeholder="Masukkan jumlah riil..."
                  value={physicalCountInput}
                  onChange={(e) => setPhysicalCountInput(e.target.value !== '' ? Number(e.target.value) : '')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              {/* Verify Expiration */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Verifikasi Tanggal Kadaluwarsa</label>
                <input
                  type="date"
                  value={expiryInput}
                  onChange={(e) => setExpiryInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Koreksi tanggal jika kemasan fisik memiliki tanggal kadaluwarsa berbeda.</span>
              </div>

              {/* Opname Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Catatan Koreksi (Opsional)</label>
                <input
                  type="text"
                  placeholder="Penyusutan, rusak, selisih suplai, dsb..."
                  value={opnameItemNotes}
                  onChange={(e) => setOpnameItemNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Live discrepancy delta indicator */}
              {physicalCountInput !== '' && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs flex justify-between items-center border border-slate-100">
                  <span className="text-slate-500 font-medium">Selisih Hitung:</span>
                  <span className={`font-black text-sm ${
                    Number(physicalCountInput) - scannedItem.currentStock === 0
                      ? 'text-slate-600'
                      : Number(physicalCountInput) - scannedItem.currentStock > 0
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}>
                    {Number(physicalCountInput) - scannedItem.currentStock > 0 ? '+' : ''}
                    {Number(physicalCountInput) - scannedItem.currentStock} {scannedItem.unit}
                  </span>
                </div>
              )}

              {/* Add to session button */}
              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Masukkan ke Daftar Sesi
              </button>
            </form>
          ) : (
            <div className="h-60 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-400 gap-2">
              <ClipboardCheck className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-semibold">Belum Ada Bahan Dipilih</p>
              <p className="text-xs text-slate-400 max-w-[180px]">Cari bahan secara manual di atas untuk memulai audit hitungan.</p>
            </div>
          )}
        </div>

        {/* Right Side: Active Session Entries List */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6 col-span-1 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-sm font-bold text-slate-900">2. Daftar Bahan yang Diaudit ({activeSession.length})</h3>
              {activeSession.length > 0 && (
                <button
                  onClick={handleResetSession}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset Daftar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">Review semua daftar bahan makanan yang telah dicocokkan sebelum melakukan penyimpanan permanen.</p>

            {activeSession.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100 items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Unduh Draf Sesi Audit:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportToExcel}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportToPDF}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" /> PDF (.pdf)
                  </button>
                </div>
              </div>
            )}

            {activeSession.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <ClipboardCheck className="w-10 h-10 text-slate-200" />
                <p className="text-sm font-semibold">Daftar Sesi Masih Kosong</p>
                <p className="text-xs text-slate-400 max-w-xs">Audit sisa stok fisik beberapa bahan terlebih dahulu untuk mengisi daftar audit sesi aktif ini.</p>
              </div>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                {activeSession.map((entry) => {
                  const discrepancy = entry.physicalStock - entry.systemStock;
                  return (
                    <div key={entry.ingredientId} className="p-3.5 flex justify-between items-center text-xs hover:bg-slate-50/50 transition-colors">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800">{entry.name}</span>
                          <span className="px-1 py-0.2 bg-slate-50 border border-slate-100 text-slate-400 rounded text-[9px] font-mono">
                            {entry.ingredientId}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1">
                          Sistem: {entry.systemStock} {entry.unit} • Fisik: <strong className="font-bold text-slate-700">{entry.physicalStock} {entry.unit}</strong>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-medium truncate max-w-[280px]">
                          Lokasi: {entry.location} • Catatan: {entry.notes}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className={`inline-block px-2 py-0.5 rounded font-black text-[10px] ${
                            discrepancy === 0
                              ? 'bg-slate-50 text-slate-500 border border-slate-100'
                              : discrepancy > 0
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : 'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                            {discrepancy === 0 ? 'Sesuai' : discrepancy > 0 ? `+${discrepancy}` : discrepancy} {entry.unit}
                          </span>
                          {entry.expiryDate && <p className="text-[9px] text-slate-400 mt-1">Kadaluwarsa: {entry.expiryDate}</p>}
                        </div>

                        <button
                          onClick={() => handleRemoveEntry(entry.ingredientId)}
                          className="text-red-400 hover:text-red-600 font-bold px-1 py-0.5 cursor-pointer text-[10px]"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {activeSession.length > 0 && (
            <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row gap-3 justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" /> Stok di-audit oleh: <strong>{userName}</strong> ({userRole === 'ADMIN' ? 'Admin' : 'Staf'})
              </span>
              <button
                onClick={handleSubmitSession}
                disabled={loading}
                className="w-full md:w-auto px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm hover:shadow-emerald-500/10 active:scale-95 transition-all cursor-pointer"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-4 h-4" /> Simpan Hasil Audit Opname</>}
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
