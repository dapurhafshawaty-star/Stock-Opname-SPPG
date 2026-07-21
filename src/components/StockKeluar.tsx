import React, { useState, useMemo } from 'react';
import { Ingredient, StockBatch, StockLog, UserRole } from '../types';
import { Search, Layers, Calendar, AlertCircle, CheckCircle2, ChevronRight, CornerDownRight, Sparkles, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StockKeluarProps {
  ingredients: Ingredient[];
  userName: string;
  onUpdateIngredient: (item: Ingredient) => Promise<void>;
  onLogTransaction: (log: StockLog) => Promise<void>;
}

export default function StockKeluar({
  ingredients,
  userName,
  onUpdateIngredient,
  onLogTransaction,
}: StockKeluarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<Ingredient | null>(null);
  const [method, setMethod] = useState<'FIFO' | 'FEFO'>('FIFO');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter items matching search
  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.id.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
    );
  }, [searchTerm, ingredients]);

  // Safely initialize batches for an ingredient (backwards-compatible helper)
  const getIngredientBatches = (item: Ingredient): StockBatch[] => {
    if (item.batches && item.batches.length > 0) {
      return item.batches;
    }
    // Fallback: treat current stock as a single batch
    return [
      {
        id: `BATCH-INIT-${item.id}`,
        quantity: item.currentStock,
        initialQuantity: item.currentStock,
        receivedDate: item.lastUpdated || new Date().toISOString(),
        expiryDate: item.expiryDate,
      },
    ];
  };

  // Get sorted batches based on FIFO or FEFO strategy
  const sortedBatches = useMemo(() => {
    if (!selectedItem) return [];
    const rawBatches = getIngredientBatches(selectedItem);
    
    return [...rawBatches].sort((a, b) => {
      if (method === 'FEFO') {
        // Sort by expiry date ascending
        // If one batch doesn't have expiry, treat it as far future
        const expA = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
        const expB = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
        
        if (expA !== expB) {
          return expA - expB;
        }
      }
      // FIFO or fallback: Sort by received/added date ascending (oldest first)
      const dateA = new Date(a.receivedDate).getTime();
      const dateB = new Date(b.receivedDate).getTime();
      return dateA - dateB;
    });
  }, [selectedItem, method]);

  // Calculate real-time deduction preview across sorted batches
  const deductionPreview = useMemo(() => {
    if (!selectedItem || typeof quantity !== 'number' || quantity <= 0) {
      return [];
    }

    let remainingToDeduct = quantity;
    return sortedBatches.map((batch) => {
      const available = batch.quantity;
      if (available <= 0) {
        return {
          ...batch,
          deducted: 0,
          remaining: 0,
        };
      }

      const deductAmount = Math.min(available, remainingToDeduct);
      remainingToDeduct -= deductAmount;

      return {
        ...batch,
        deducted: deductAmount,
        remaining: parseFloat((available - deductAmount).toFixed(3)),
      };
    });
  }, [sortedBatches, selectedItem, quantity]);

  // Calculate the total available stock across batches
  const totalAvailableStock = useMemo(() => {
    if (!selectedItem) return 0;
    return getIngredientBatches(selectedItem).reduce((acc, b) => acc + b.quantity, 0);
  }, [selectedItem]);

  // Handle Select Item
  const handleSelectItem = (item: Ingredient) => {
    setSelectedItem(item);
    setSearchTerm('');
    setQuantity('');
    setSuccessMsg(null);
  };

  // Process Stock Out
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || typeof quantity !== 'number' || quantity <= 0) return;

    if (quantity > totalAvailableStock) {
      alert(`Jumlah penarikan (${quantity} ${selectedItem.unit}) melebihi stok yang tersedia (${totalAvailableStock} ${selectedItem.unit}).`);
      return;
    }

    setLoading(true);
    try {
      // 1. Generate new batches with deducted quantities
      let remainingToDeduct = quantity;
      const updatedBatches = sortedBatches.map((batch) => {
        if (remainingToDeduct <= 0) return batch;
        const deductAmount = Math.min(batch.quantity, remainingToDeduct);
        remainingToDeduct -= deductAmount;
        return {
          ...batch,
          quantity: parseFloat((batch.quantity - deductAmount).toFixed(3)),
        };
      }).filter((batch) => batch.quantity > 0); // Keep only batches with stock remaining

      // 2. Compute new overall stock level
      const newStock = parseFloat(updatedBatches.reduce((acc, b) => acc + b.quantity, 0).toFixed(3));

      // 3. Update ingredient
      const updatedIngredient: Ingredient = {
        ...selectedItem,
        currentStock: newStock,
        batches: updatedBatches,
        lastUpdated: new Date().toISOString(),
      };

      await onUpdateIngredient(updatedIngredient);

      // 4. Create stock log entry
      await onLogTransaction({
        id: 'LOG-' + Date.now(),
        timestamp: new Date().toISOString(),
        ingredientId: selectedItem.id,
        ingredientName: selectedItem.name,
        type: 'KELUAR',
        quantity: -quantity,
        prevStock: selectedItem.currentStock,
        newStock: newStock,
        user: userName,
        notes: `Penarikan barang (${method}): Pengeluaran bahan dapur`,
      });

      // Show success
      setSuccessMsg(`Berhasil mengeluarkan ${quantity} ${selectedItem.unit} dari bahan "${selectedItem.name}" menggunakan metode ${method}!`);
      setQuantity('');
      // Update selectedItem state to show refreshed batches
      setSelectedItem(updatedIngredient);
    } catch (err: any) {
      console.error(err);
      alert('Gagal memproses barang keluar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500" /> Manajemen Barang Keluar (FIFO & FEFO)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Ambil bahan baku dari gudang berdasarkan sistem FIFO (First In First Out) atau FEFO (First Expired First Out).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Search and Item details */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Search Box */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Cari & Pilih Bahan</h3>
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Ketik nama atau kode ID bahan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 transition-all text-slate-800"
              />
            </div>

            {/* Live Master Stock Selection List */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Pilih Bahan Dari Master Stok ({searchResults.length})</span>
                {selectedItem && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                    Terpilih: {selectedItem.name}
                  </span>
                )}
              </div>
              <div className="border border-slate-150 rounded-xl bg-slate-50/50 p-2 max-h-64 overflow-y-auto space-y-1.5 shadow-inner">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6 font-semibold">Bahan tidak ditemukan</p>
                ) : (
                  searchResults.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectItem(item)}
                        className={`w-full text-left p-3 rounded-xl transition-all flex justify-between items-center text-sm cursor-pointer ${
                          isSelected 
                            ? 'bg-emerald-600 text-white shadow-sm font-semibold scale-[0.98]' 
                            : 'bg-white text-slate-700 hover:bg-slate-100/80 border border-slate-200/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[8px] px-1.5 py-0.2 rounded font-black uppercase ${
                              isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {item.category}
                            </span>
                            <span className={`text-[9px] font-mono font-bold ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                              {item.id}
                            </span>
                          </div>
                          <span className={`font-bold block mt-0.5 truncate ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                            {item.name}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-[9px] font-bold block ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                            STOK
                          </span>
                          <span className={`font-black text-sm ${isSelected ? 'text-white' : 'text-indigo-600'}`}>
                            {item.currentStock} {item.unit}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Selected Item Information */}
          {selectedItem ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    {selectedItem.category}
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 mt-1">{selectedItem.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Kode ID: {selectedItem.id}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 font-bold block">TOTAL STOK</span>
                  <span className="text-2xl font-black text-slate-900">
                    {totalAvailableStock} <span className="text-xs font-bold text-slate-500">{selectedItem.unit}</span>
                  </span>
                </div>
              </div>

              {/* Batches visualization list */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Batches Tersimpan</h4>
                  <span className="text-[10px] text-slate-400 font-semibold font-mono">Urut: {method === 'FIFO' ? 'FIFO (Masuk Dulu)' : 'FEFO (Exp Dulu)'}</span>
                </div>
                
                <div className="divide-y divide-slate-100 max-h-[250px] overflow-y-auto pr-2">
                  {sortedBatches.map((batch, index) => {
                    const isFullyDeducted = deductionPreview[index]?.deducted === batch.quantity;
                    const hasDeduction = (deductionPreview[index]?.deducted || 0) > 0;
                    
                    return (
                      <div key={batch.id} className={`py-3 flex justify-between items-center transition-all ${isFullyDeducted ? 'opacity-40 bg-red-50/10' : ''}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                              Batch #{index + 1}
                            </span>
                            {batch.expiryDate && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-600 font-bold px-1.5 py-0.5 rounded">
                                Exp: {batch.expiryDate}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" /> Masuk: {new Date(batch.receivedDate).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-sm font-extrabold text-slate-800">
                              {batch.quantity} {selectedItem.unit}
                            </span>
                            {hasDeduction && (
                              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${isFullyDeducted ? 'bg-red-500 text-white' : 'bg-amber-500 text-slate-950'}`}>
                                -{deductionPreview[index]?.deducted}
                              </span>
                            )}
                          </div>
                          {hasDeduction && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Sisa: {deductionPreview[index]?.remaining} {selectedItem.unit}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
              <Layers className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-semibold">Pilih bahan makanan terlebih dahulu untuk memproses barang keluar</p>
              <p className="text-xs text-slate-400 max-w-xs">Gunakan kolom pencarian di atas atau scan barcode langsung</p>
            </div>
          )}
        </div>

        {/* Right column: Action Form */}
        <div className="lg:col-span-5">
          {selectedItem ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-5 sticky top-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-emerald-500" /> Formulir Barang Keluar
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Method selector */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1.5">Metode Pergudangan</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setMethod('FIFO');
                        setSuccessMsg(null);
                      }}
                      className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        method === 'FIFO'
                          ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      FIFO (First In First Out)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMethod('FEFO');
                        setSuccessMsg(null);
                      }}
                      className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        method === 'FEFO'
                          ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      FEFO (First Expired Out)
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    {method === 'FIFO'
                      ? 'Dahulukan barang yang masuk paling lama. Cocok untuk semua jenis barang.'
                      : 'Dahulukan barang yang paling dekat tanggal kadaluwarsanya (bila tidak ada, sistem akan otomatis beralih ke FIFO).'}
                  </p>
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Jumlah Pengambilan</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required
                      placeholder="Contoh: 5, 2.5, dsb."
                      value={quantity}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                        setQuantity(val);
                        setSuccessMsg(null);
                      }}
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                    />
                    <div className="px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center font-bold text-xs text-slate-600 min-w-16">
                      {selectedItem.unit}
                    </div>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || typeof quantity !== 'number' || quantity <= 0}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-slate-950 font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 shadow-sm text-xs"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Ambil & Kurangi Stok</>
                  )}
                </button>
              </form>

              {/* Dynamic Success Prompt */}
              <AnimatePresence>
                {successMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-emerald-800 leading-normal">{successMsg}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400">
              <p className="text-xs font-medium">Formulir penarikan akan tampil di sini setelah bahan dipilih.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
