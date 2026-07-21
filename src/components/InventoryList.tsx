import React, { useState, useMemo } from 'react';
import { Ingredient, UserRole, TransactionType, StockLog, StockBatch } from '../types';
import { Plus, Edit3, Trash2, Search, ArrowUpDown, Filter, AlertTriangle, Calendar, PlusCircle, MinusCircle, RefreshCw, Trash, X, Save, Check, Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface InventoryListProps {
  ingredients: Ingredient[];
  userRole: UserRole;
  userName: string;
  onAddIngredient: (item: Ingredient) => Promise<void>;
  onUpdateIngredient: (item: Ingredient) => Promise<void>;
  onDeleteIngredient: (id: string) => Promise<void>;
  onLogTransaction: (log: StockLog) => Promise<void>;
  onBatchAddOrUpdateIngredientsAndLogs?: (items: Ingredient[], newLogs: StockLog[]) => Promise<void>;
  initialFilter?: 'all' | 'low';
}

const CATEGORIES = ['Sembako', 'Sayur & Buah', 'Daging & Ikan', 'Bumbu & Rempah', 'Bahan Kering', 'Susu & Olahan', 'Lainnya'] as const;
const UNITS = ['kg', 'gr', 'liter', 'ml', 'pcs', 'pack', 'ikat', 'butir'] as const;
const LOCATIONS = ['Kulkas Utama', 'Kulkas Sayur', 'Freezer Daging', 'Rak Kering A', 'Rak Kering B', 'Bumbu Station', 'Gudang Luar'] as const;

interface BulkRow {
  id: string;
  name: string;
  category: typeof CATEGORIES[number];
  quantity: number;
  unit: typeof UNITS[number];
  location: string;
  notes: string;
}

export default function InventoryList({
  ingredients,
  userRole,
  userName,
  onAddIngredient,
  onUpdateIngredient,
  onDeleteIngredient,
  onLogTransaction,
  onBatchAddOrUpdateIngredientsAndLogs,
  initialFilter = 'all',
}: InventoryListProps) {
  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter === 'low' ? 'low' : 'all');
  const [sortBy, setSortBy] = useState<'name' | 'stock'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Add / Edit Modal States
  const [showItemModal, setShowItemModal] = useState(false);
  const [modalMode, setModalMode] = useState<'ADD' | 'EDIT'>('ADD');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  // Form Fields
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<Ingredient['category']>('Sembako');
  const [formCurrentStock, setFormCurrentStock] = useState(0);
  const [formUnit, setFormUnit] = useState<Ingredient['unit']>('kg');
  const [formLocation, setFormLocation] = useState(LOCATIONS[0]);
  const [formNotes, setFormNotes] = useState('');

  // Quick Stock Adjust Modal States
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedAdjustItem, setSelectedAdjustItem] = useState<Ingredient | null>(null);
  const [adjustType, setAdjustType] = useState<TransactionType>('MASUK');
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustNotes, setAdjustNotes] = useState('');

  // Bulk Multi-Item Input Modal States
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([
    { id: '', name: '', category: 'Sembako', quantity: 0, unit: 'kg', location: LOCATIONS[0], notes: '' }
  ]);

  // Import File Modal States
  const [showImportModal, setShowImportModal] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedRows, setImportedRows] = useState<any[]>([]);
  const [conflictStrategy, setConflictStrategy] = useState<'merge' | 'overwrite' | 'skip'>('merge');

  // Actions Toggle
  const [loading, setLoading] = useState(false);

  // Sorting Handler
  const handleSort = (field: 'name' | 'stock') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Open Add/Edit Modal
  const openItemModal = (mode: 'ADD' | 'EDIT', item?: Ingredient) => {
    setModalMode(mode);
    if (mode === 'EDIT' && item) {
      setEditingItemId(item.id);
      setFormId(item.id);
      setFormName(item.name);
      setFormCategory(item.category);
      setFormCurrentStock(item.currentStock);
      setFormUnit(item.unit);
      setFormLocation(item.location);
      setFormNotes(item.notes || '');
    } else {
      setEditingItemId(null);
      setFormId('ID-' + Math.floor(1000000000 + Math.random() * 9000000000)); // random ID
      setFormName('');
      setFormCategory('Sembako');
      setFormCurrentStock(0);
      setFormUnit('kg');
      setFormLocation(LOCATIONS[0]);
      setFormNotes('');
    }
    setShowItemModal(true);
  };

  // Submit Add/Edit Form (With Smart Upsert for ADD Mode)
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formId.trim()) return;

    setLoading(true);
    try {
      const payload: Ingredient = {
        id: formId.trim(),
        name: formName.trim(),
        category: formCategory,
        currentStock: Number(formCurrentStock),
        unit: formUnit,
        location: formLocation,
        notes: formNotes.trim(),
        lastUpdated: new Date().toISOString(),
      };

      if (modalMode === 'ADD') {
        // Smart Upsert: check if ingredient with same barcode/ID or exact name already exists
        const existing = ingredients.find(
          i => i.id === payload.id || i.name.toLowerCase() === payload.name.toLowerCase()
        );

        if (existing) {
          // Update the old item's stock and keep its minStock/category, etc.
          const oldStock = existing.currentStock;
          const additionalStock = payload.currentStock;
          const newStock = oldStock + additionalStock;

          // Merge batches
          const existingBatches = existing.batches && existing.batches.length > 0 ? existing.batches : [
            {
              id: `BATCH-INIT-${existing.id}`,
              quantity: existing.currentStock,
              initialQuantity: existing.currentStock,
              receivedDate: existing.lastUpdated || new Date().toISOString(),
            }
          ];

          const newBatch: StockBatch = {
            id: 'BATCH-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            quantity: additionalStock,
            initialQuantity: additionalStock,
            receivedDate: new Date().toISOString(),
          };

          const mergedBatches = [...existingBatches, newBatch].filter(b => b.quantity > 0);

          const updatedItem: Ingredient = {
            ...existing,
            name: payload.name, // update to latest name
            category: payload.category, // update to latest category
            currentStock: newStock,
            unit: payload.unit,
            location: payload.location,
            notes: payload.notes || existing.notes,
            batches: mergedBatches,
            lastUpdated: new Date().toISOString(),
          };

          await onUpdateIngredient(updatedItem);

          if (additionalStock > 0) {
            await onLogTransaction({
              id: 'LOG-' + Date.now(),
              timestamp: new Date().toISOString(),
              ingredientId: existing.id,
              ingredientName: existing.name,
              type: 'MASUK',
              quantity: additionalStock,
              prevStock: oldStock,
              newStock,
              user: userName,
              notes: payload.notes || 'Pembaruan Stok Bahan Masuk (Upsert Otomatis)',
            });
          }
        } else {
          // Create standard new ingredient
          const initialBatch: StockBatch = {
            id: 'BATCH-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            quantity: payload.currentStock,
            initialQuantity: payload.currentStock,
            receivedDate: new Date().toISOString(),
          };

          const payloadWithBatches: Ingredient = {
            ...payload,
            batches: [initialBatch]
          };

          await onAddIngredient(payloadWithBatches);

          if (payload.currentStock > 0) {
            await onLogTransaction({
              id: 'LOG-' + Date.now(),
              timestamp: new Date().toISOString(),
              ingredientId: payload.id,
              ingredientName: payload.name,
              type: 'MASUK',
              quantity: payload.currentStock,
              prevStock: 0,
              newStock: payload.currentStock,
              user: userName,
              notes: 'Inisialisasi Stok Bahan Baru',
            });
          }
        }
      } else {
        // Edit Mode
        const oldItem = ingredients.find(i => i.id === editingItemId);
        const oldStock = oldItem ? oldItem.currentStock : 0;
        
        // Retain existing batches but adjust currentStock sum if manually overridden in profile form
        let updatedBatches = oldItem?.batches || [];
        if (oldStock !== payload.currentStock) {
          // If edited manually, set a single master batch to avoid inconsistencies
          updatedBatches = [
            {
              id: `BATCH-EDIT-${payload.id}-${Date.now()}`,
              quantity: payload.currentStock,
              initialQuantity: payload.currentStock,
              receivedDate: new Date().toISOString(),
            }
          ];
        }

        const updatedPayload: Ingredient = {
          ...payload,
          batches: updatedBatches,
        };

        await onUpdateIngredient(updatedPayload);
        
        if (oldStock !== payload.currentStock) {
          await onLogTransaction({
            id: 'LOG-' + Date.now(),
            timestamp: new Date().toISOString(),
            ingredientId: payload.id,
            ingredientName: payload.name,
            type: 'OPNAME_ADJUST',
            quantity: payload.currentStock - oldStock,
            prevStock: oldStock,
            newStock: payload.currentStock,
            user: userName,
            notes: `Koreksi Profil Bahan: ${formNotes || 'Tanpa keterangan'}`,
          });
        }
      }
      setShowItemModal(false);
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan data bahan.');
    } finally {
      setLoading(false);
    }
  };

  // Open Quick Adjust Modal
  const openAdjustModal = (item: Ingredient, type: TransactionType) => {
    setSelectedAdjustItem(item);
    setAdjustType(type);
    setAdjustQty(0);
    setAdjustNotes('');
    setShowAdjustModal(true);
  };

  // Submit Quick Adjust
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjustItem || adjustQty <= 0) return;

    setLoading(true);
    try {
      const delta = adjustType === 'MASUK' ? adjustQty : -adjustQty;
      const oldStock = selectedAdjustItem.currentStock;
      const newStock = Math.max(0, oldStock + delta);

      // Handle batches updates for quick adjustment
      let updatedBatches = selectedAdjustItem.batches && selectedAdjustItem.batches.length > 0 ? [...selectedAdjustItem.batches] : [
        {
          id: `BATCH-INIT-${selectedAdjustItem.id}`,
          quantity: selectedAdjustItem.currentStock,
          initialQuantity: selectedAdjustItem.currentStock,
          receivedDate: selectedAdjustItem.lastUpdated || new Date().toISOString(),
        }
      ];

      if (adjustType === 'MASUK') {
        // Add new batch
        updatedBatches.push({
          id: 'BATCH-ADJ-' + Date.now(),
          quantity: adjustQty,
          initialQuantity: adjustQty,
          receivedDate: new Date().toISOString(),
        });
      } else {
        // Deduct using FIFO
        let remainingToDeduct = adjustQty;
        // Sort batches oldest first
        updatedBatches = updatedBatches.sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());
        
        updatedBatches = updatedBatches.map((batch) => {
          if (remainingToDeduct <= 0) return batch;
          const deductAmount = Math.min(batch.quantity, remainingToDeduct);
          remainingToDeduct -= deductAmount;
          return {
            ...batch,
            quantity: parseFloat((batch.quantity - deductAmount).toFixed(3)),
          };
        }).filter(b => b.quantity > 0);
      }

      const updatedItem: Ingredient = {
        ...selectedAdjustItem,
        currentStock: newStock,
        batches: updatedBatches,
        lastUpdated: new Date().toISOString(),
      };

      await onUpdateIngredient(updatedItem);
      await onLogTransaction({
        id: 'LOG-' + Date.now(),
        timestamp: new Date().toISOString(),
        ingredientId: selectedAdjustItem.id,
        ingredientName: selectedAdjustItem.name,
        type: adjustType,
        quantity: delta,
        prevStock: oldStock,
        newStock,
        user: userName,
        notes: adjustNotes.trim() || `${adjustType === 'MASUK' ? 'Pemasukan stok cepat' : 'Pengambilan stok cepat'}`,
      });

      setShowAdjustModal(false);
    } catch (err) {
      console.error(err);
      alert('Gagal mengupdate stok bahan.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Handler
  const handleDelete = async (item: Ingredient) => {
    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus bahan makanan "${item.name}"? Semua catatan terkait bahan ini akan diarsip.`);
    if (!confirmDelete) return;

    setLoading(true);
    try {
      await onDeleteIngredient(item.id);
      await onLogTransaction({
        id: 'LOG-' + Date.now(),
        timestamp: new Date().toISOString(),
        ingredientId: item.id,
        ingredientName: item.name,
        type: 'KELUAR',
        quantity: -item.currentStock,
        prevStock: item.currentStock,
        newStock: 0,
        user: userName,
        notes: `Dihapus dari inventaris oleh ${userName}`,
      });
    } catch (err) {
      console.error(err);
      alert('Gagal menghapus data bahan.');
    } finally {
      setLoading(false);
    }
  };

  // Bulk Input Rows Management
  const addBulkRow = () => {
    setBulkRows([...bulkRows, {
      id: '',
      name: '',
      category: 'Sembako',
      quantity: 0,
      unit: 'kg',
      location: LOCATIONS[0],
      notes: ''
    }]);
  };

  const removeBulkRow = (index: number) => {
    if (bulkRows.length <= 1) {
      setBulkRows([{ id: '', name: '', category: 'Sembako', quantity: 0, unit: 'kg', location: LOCATIONS[0], notes: '' }]);
      return;
    }
    setBulkRows(bulkRows.filter((_, i) => i !== index));
  };

  const updateBulkRow = (index: number, key: keyof BulkRow, value: any) => {
    const updated = [...bulkRows];
    updated[index] = { ...updated[index], [key]: value };

    // Auto-fill existing details if name is modified and matches an existing item
    if (key === 'name') {
      const nameStr = (value as string).trim().toLowerCase();
      const match = ingredients.find(i => i.name.toLowerCase() === nameStr);
      if (match) {
        updated[index].id = match.id;
        updated[index].category = match.category;
        updated[index].unit = match.unit;
        updated[index].location = match.location;
      } else {
        // If it's a new ingredient name and has no ID, auto-generate one
        if (!updated[index].id) {
          updated[index].id = 'ID-' + Math.floor(1000000000 + Math.random() * 9000000000);
        }
      }
    } else if (key === 'id') {
      const barcodeStr = (value as string).trim();
      const match = ingredients.find(i => i.id === barcodeStr);
      if (match) {
        updated[index].name = match.name;
        updated[index].category = match.category;
        updated[index].unit = match.unit;
        updated[index].location = match.location;
      }
    }
    setBulkRows(updated);
  };

  // Submit all bulk incoming goods at once
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out rows that are empty or have invalid quantity
    const validRows = bulkRows.filter(row => row.id.trim() && row.name.trim() && row.quantity > 0);
    if (validRows.length === 0) {
      alert('Mohon isi minimal satu baris barang masuk dengan barcode, nama, dan jumlah > 0.');
      return;
    }

    setLoading(true);
    try {
      const itemsToUpdate: Ingredient[] = [];
      const logsToAdd: StockLog[] = [];
      let currentIngredientsCopy = [...ingredients];

      for (const row of validRows) {
        const barcode = row.id.trim();
        const name = row.name.trim();
        const qty = Number(row.quantity);

        const existing = currentIngredientsCopy.find(
          i => i.id === barcode || i.name.toLowerCase() === name.toLowerCase()
        );

        if (existing) {
          // Merge stocks
          const oldStock = existing.currentStock;
          const newStock = oldStock + qty;

          const existingBatches = existing.batches && existing.batches.length > 0 ? existing.batches : [
            {
              id: `BATCH-INIT-${existing.id}`,
              quantity: existing.currentStock,
              initialQuantity: existing.currentStock,
              receivedDate: existing.lastUpdated || new Date().toISOString(),
            }
          ];

          const newBatch: StockBatch = {
            id: 'BATCH-BULK-' + Date.now() + '-' + Math.floor(Math.random() * 100),
            quantity: qty,
            initialQuantity: qty,
            receivedDate: new Date().toISOString(),
          };

          const mergedBatches = [...existingBatches, newBatch].filter(b => b.quantity > 0);

          const updatedItem: Ingredient = {
            ...existing,
            name: name,
            category: row.category,
            currentStock: newStock,
            unit: row.unit,
            location: row.location as any,
            notes: row.notes || existing.notes,
            batches: mergedBatches,
            lastUpdated: new Date().toISOString(),
          };

          currentIngredientsCopy = currentIngredientsCopy.map(i => i.id === existing.id ? updatedItem : i);
          itemsToUpdate.push(updatedItem);

          logsToAdd.push({
            id: 'LOG-BULK-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '-' + Math.floor(Math.random() * 100),
            timestamp: new Date().toISOString(),
            ingredientId: existing.id,
            ingredientName: existing.name,
            type: 'MASUK',
            quantity: qty,
            prevStock: oldStock,
            newStock,
            user: userName,
            notes: row.notes || 'Penerimaan Masuk Massal (Sistem FIFO)',
          });
        } else {
          // Create new
          const newIngredient: Ingredient = {
            id: barcode,
            name: name,
            category: row.category,
            currentStock: qty,
            unit: row.unit,
            location: row.location as any,
            notes: row.notes,
            lastUpdated: new Date().toISOString(),
            batches: [
              {
                id: 'BATCH-BULK-' + Date.now() + '-' + Math.floor(Math.random() * 100),
                quantity: qty,
                initialQuantity: qty,
                receivedDate: new Date().toISOString(),
              }
            ]
          };

          currentIngredientsCopy.push(newIngredient);
          itemsToUpdate.push(newIngredient);

          logsToAdd.push({
            id: 'LOG-BULK-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '-' + Math.floor(Math.random() * 100),
            timestamp: new Date().toISOString(),
            ingredientId: newIngredient.id,
            ingredientName: newIngredient.name,
            type: 'MASUK',
            quantity: qty,
            prevStock: 0,
            newStock: qty,
            user: userName,
            notes: row.notes || 'Pemasukan Baru Massal',
          });
        }
      }

      if (onBatchAddOrUpdateIngredientsAndLogs) {
        await onBatchAddOrUpdateIngredientsAndLogs(itemsToUpdate, logsToAdd);
      } else {
        // Fallback sequentially
        for (const item of itemsToUpdate) {
          const hasExisting = ingredients.some(i => i.id === item.id);
          if (hasExisting) {
            await onUpdateIngredient(item);
          } else {
            await onAddIngredient(item);
          }
        }
        for (const log of logsToAdd) {
          await onLogTransaction(log);
        }
      }

      alert(`Sukses memproses ${validRows.length} data barang masuk harian!`);
      setBulkRows([{ id: '', name: '', category: 'Sembako', quantity: 0, unit: 'kg', location: LOCATIONS[0], notes: '' }]);
      setShowBulkModal(false);
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan beberapa data barang masuk massal.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // EXCEL & PDF FILE IMPORT SYSTEM
  // ==========================================

  const handleExcelImport = (file: File) => {
    setIsParsingFile(true);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error('File kosong atau tidak terbaca');
        
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON array
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rawJson.length === 0) {
          throw new Error('Lembar kerja kosong atau tidak ada data.');
        }
        
        // Match headers if they exist on row 0 or 1
        const headers = rawJson[0] ? rawJson[0].map((h: any) => String(h || '').trim().toLowerCase()) : [];
        
        let nameIdx = headers.findIndex((h: string) => h.includes('nama') || h.includes('item') || h.includes('bahan'));
        let idIdx = headers.findIndex((h: string) => h.includes('barcode') || h.includes('id') || h.includes('kode'));
        let qtyIdx = headers.findIndex((h: string) => h.includes('stok') || h.includes('qty') || h.includes('jumlah') || h.includes('current'));
        let catIdx = headers.findIndex((h: string) => h.includes('kategori') || h.includes('cat') || h.includes('jenis'));
        let unitIdx = headers.findIndex((h: string) => h.includes('satuan') || h.includes('unit'));
        let locIdx = headers.findIndex((h: string) => h.includes('lokasi') || h.includes('tempat') || h.includes('rak') || h.includes('location'));
        let notesIdx = headers.findIndex((h: string) => h.includes('catatan') || h.includes('keterangan') || h.includes('notes'));

        // Smart fallbacks
        if (nameIdx === -1) nameIdx = 0;
        if (idIdx === -1) idIdx = headers.findIndex((h: string, i: number) => i !== nameIdx && (h.includes('code') || i === 1));
        if (idIdx === -1) idIdx = 1;
        if (qtyIdx === -1) qtyIdx = headers.findIndex((h: string, i: number) => i !== nameIdx && i !== idIdx && (h.includes('number') || i === 2));
        if (qtyIdx === -1) qtyIdx = 2;

        const results: any[] = [];
        const startRow = headers.length > 0 ? 1 : 0;
        
        for (let i = startRow; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0) continue;
          
          const rawName = row[nameIdx] ? String(row[nameIdx]).trim() : '';
          if (!rawName) continue;

          let rawId = row[idIdx] ? String(row[idIdx]).trim() : '';
          if (!rawId) {
            rawId = 'ID-' + Math.floor(1000000000 + Math.random() * 9000000000);
          }

          const rawQty = row[qtyIdx] !== undefined ? Number(row[qtyIdx]) : 0;
          if (isNaN(rawQty) || rawQty < 0) continue;
          
          const rawCat = row[catIdx] ? String(row[catIdx]).trim() : 'Sembako';
          const matchedCat = CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase()) || 'Sembako';
          
          const rawUnit = row[unitIdx] ? String(row[unitIdx]).trim() : 'kg';
          const matchedUnit = UNITS.find(u => u.toLowerCase() === rawUnit.toLowerCase()) || 'kg';

          const rawLoc = row[locIdx] ? String(row[locIdx]).trim() : LOCATIONS[0];
          const matchedLoc = LOCATIONS.find(l => l.toLowerCase() === rawLoc.toLowerCase()) || LOCATIONS[0];

          const rawNotes = row[notesIdx] ? String(row[notesIdx]).trim() : 'Imported';

          results.push({
            id: rawId,
            name: rawName,
            category: matchedCat,
            currentStock: rawQty,
            unit: matchedUnit,
            location: matchedLoc,
            notes: rawNotes,
          });
        }

        if (results.length === 0) {
          throw new Error('Tidak ada data bahan makanan valid yang berhasil diekstrak dari file Excel ini.');
        }

        setImportedRows(results);
      } catch (err: any) {
        setImportError(err.message || 'Gagal membaca file Excel.');
      } finally {
        setIsParsingFile(false);
      }
    };
    reader.onerror = () => {
      setImportError('Gagal membaca file.');
      setIsParsingFile(false);
    };
    reader.readAsBinaryString(file);
  };

  const handlePdfImport = async (file: File) => {
    setIsParsingFile(true);
    setImportError(null);
    try {
      // 1. Load pdfjs dynamically
      const pdfjsLib: any = await new Promise((resolve, reject) => {
        if ((window as any).pdfjsLib) {
          resolve((window as any).pdfjsLib);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        script.onload = () => {
          const lib = (window as any).pdfjsLib;
          lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
          resolve(lib);
        };
        script.onerror = () => reject(new Error('Gagal mengunduh parser PDF dari CDN. Harap periksa koneksi internet Anda.'));
        document.head.appendChild(script);
      });

      // 2. Read array buffer
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }

      // 3. Smart parse lines
      const lines = fullText.split(/[\n\r]+/);
      const results: any[] = [];

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 3) return;

        let parts = trimmed.split(/\t|,|;| {2,}/).map(p => p.trim()).filter(Boolean);
        
        if (parts.length >= 2) {
          let name = parts[0];
          let barcode = '';
          let qty = 0;
          let unit: typeof UNITS[number] = 'kg';
          let cat: typeof CATEGORIES[number] = 'Sembako';
          let loc: string = LOCATIONS[0];
          let notes = 'Imported dari PDF';

          parts.slice(1).forEach(part => {
            if (/^\d{8,15}$/.test(part)) {
              barcode = part;
            }
            const foundCat = CATEGORIES.find(c => c.toLowerCase() === part.toLowerCase());
            if (foundCat) cat = foundCat;

            const foundUnit = UNITS.find(u => u.toLowerCase() === part.toLowerCase());
            if (foundUnit) unit = foundUnit;

            const foundLoc = LOCATIONS.find(l => l.toLowerCase() === part.toLowerCase());
            if (foundLoc) loc = foundLoc;

            const qtyMatch = part.match(/^([\d.,]+)\s*([a-zA-Z]*)$/);
            if (qtyMatch) {
              const numVal = Number(qtyMatch[1].replace(',', '.'));
              if (!isNaN(numVal)) {
                qty = numVal;
                const matchUnit = qtyMatch[2].toLowerCase();
                const matchedU = UNITS.find(u => u === matchUnit || u.toLowerCase() === matchUnit);
                if (matchedU) unit = matchedU;
              }
            }
          });

          if (!barcode) {
            barcode = 'BRC-' + Math.floor(1000000000 + Math.random() * 9000000000);
          }

          if (name && name.length > 1) {
            results.push({
              id: barcode,
              name,
              category: cat,
              currentStock: qty,
              unit,
              location: loc,
              notes,
            });
          }
        } else {
          // Single line fallback split
          const words = trimmed.split(/\s+/);
          if (words.length >= 3) {
            let qty = 0;
            let unit: any = 'kg';
            let nameWords = [...words];

            const lastWord = words[words.length - 1].toLowerCase();
            const secondLastWord = words[words.length - 2];
            
            const matchedU = UNITS.find(u => u === lastWord);
            if (matchedU) {
              unit = matchedU;
              qty = Number(secondLastWord.replace(',', '.'));
              nameWords = words.slice(0, words.length - 2);
            } else {
              const comboMatch = words[words.length - 1].match(/^([\d.,]+)([a-zA-Z]+)$/);
              if (comboMatch) {
                qty = Number(comboMatch[1].replace(',', '.'));
                const matchedComboU = UNITS.find(u => u === comboMatch[2].toLowerCase());
                if (matchedComboU) unit = matchedComboU;
                nameWords = words.slice(0, words.length - 1);
              }
            }

            if (!isNaN(qty) && qty > 0) {
              let barcode = 'BRC-' + Math.floor(1000000000 + Math.random() * 9000000000);
              const barcodeIdx = nameWords.findIndex(w => /^\d{8,15}$/.test(w));
              if (barcodeIdx !== -1) {
                barcode = nameWords[barcodeIdx];
                nameWords = nameWords.filter((_, idx) => idx !== barcodeIdx);
              }

              const name = nameWords.join(' ');
              if (name && name.length > 1) {
                results.push({
                  id: barcode,
                  name,
                  category: 'Sembako',
                  currentStock: qty,
                  unit,
                  location: LOCATIONS[0],
                  notes: 'Imported dari PDF',
                });
              }
            }
          }
        }
      });

      if (results.length === 0) {
        // Broad lines fallback extraction
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.length > 5 && !trimmed.toLowerCase().includes('halaman') && !trimmed.toLowerCase().includes('page')) {
            results.push({
              id: 'BRC-' + Math.floor(1000000000 + Math.random() * 9000000000),
              name: trimmed,
              category: 'Sembako',
              currentStock: 1,
              unit: 'pcs',
              location: LOCATIONS[0],
              notes: 'Teks hasil ekstrak PDF',
            });
          }
        });
      }

      if (results.length === 0) {
        throw new Error('Tidak dapat mengekstrak data bahan makanan otomatis dari PDF ini. Format PDF mungkin berupa gambar atau scan kosong.');
      }

      setImportedRows(results);
    } catch (err: any) {
      setImportError(err.message || 'Gagal mengekstrak PDF.');
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
      handleExcelImport(file);
    } else if (extension === 'pdf') {
      handlePdfImport(file);
    } else {
      setImportError('Format file tidak didukung. Silakan gunakan .xlsx, .xls, .csv, atau .pdf');
    }
  };

  const downloadExcelTemplate40 = () => {
    const defaultTemplates = [
      { "Nama Bahan (Wajib)": "Beras Sentra Ramos", "Barcode / ID (Opsional)": "BRS-001", "Stok Saat Ini (Wajib)": 100, "Kategori": "Sembako", "Satuan": "kg", "Lokasi Penyimpanan": "Rak Kering A", "Catatan": "Kebutuhan pokok santri" },
      { "Nama Bahan (Wajib)": "Minyak Goreng Filma", "Barcode / ID (Opsional)": "MYK-002", "Stok Saat Ini (Wajib)": 50, "Kategori": "Sembako", "Satuan": "liter", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Stok bulanan" },
      { "Nama Bahan (Wajib)": "Daging Sapi Segar", "Barcode / ID (Opsional)": "DGG-003", "Stok Saat Ini (Wajib)": 15, "Kategori": "Daging & Ikan", "Satuan": "kg", "Lokasi Penyimpanan": "Freezer Daging", "Catatan": "Lauk hari besar" },
      { "Nama Bahan (Wajib)": "Ayam Broiler Fillet", "Barcode / ID (Opsional)": "AYM-004", "Stok Saat Ini (Wajib)": 20, "Kategori": "Daging & Ikan", "Satuan": "kg", "Lokasi Penyimpanan": "Freezer Daging", "Catatan": "Lauk mingguan" },
      { "Nama Bahan (Wajib)": "Telur Ayam Negeri", "Barcode / ID (Opsional)": "TLR-005", "Stok Saat Ini (Wajib)": 120, "Kategori": "Sembako", "Satuan": "butir", "Lokasi Penyimpanan": "Rak Kering A", "Catatan": "Sarapan pagi" },
      { "Nama Bahan (Wajib)": "Bawang Merah Brebes", "Barcode / ID (Opsional)": "BWG-006", "Stok Saat Ini (Wajib)": 10, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu dasar" },
      { "Nama Bahan (Wajib)": "Bawang Putih Kating", "Barcode / ID (Opsional)": "BWG-007", "Stok Saat Ini (Wajib)": 8, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu dasar" },
      { "Nama Bahan (Wajib)": "Cabe Merah Keriting", "Barcode / ID (Opsional)": "CAB-008", "Stok Saat Ini (Wajib)": 5, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Bumbu sambal" },
      { "Nama Bahan (Wajib)": "Cabe Rawit Hijau", "Barcode / ID (Opsional)": "CAB-009", "Stok Saat Ini (Wajib)": 3, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Bumbu gorengan" },
      { "Nama Bahan (Wajib)": "Gula Pasir Gulaku", "Barcode / ID (Opsional)": "GUL-010", "Stok Saat Ini (Wajib)": 25, "Kategori": "Sembako", "Satuan": "kg", "Lokasi Penyimpanan": "Rak Kering A", "Catatan": "Pemanis teh hangat" },
      { "Nama Bahan (Wajib)": "Garam Dapur Berberyodium", "Barcode / ID (Opsional)": "GRM-011", "Stok Saat Ini (Wajib)": 15, "Kategori": "Bumbu & Rempah", "Satuan": "pack", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Penyedap rasa" },
      { "Nama Bahan (Wajib)": "Kecap Manis Bango", "Barcode / ID (Opsional)": "KCP-012", "Stok Saat Ini (Wajib)": 12, "Kategori": "Sembako", "Satuan": "liter", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Bumbu masak" },
      { "Nama Bahan (Wajib)": "Susu UHT Ultra Milk", "Barcode / ID (Opsional)": "SSU-013", "Stok Saat Ini (Wajib)": 24, "Kategori": "Susu & Olahan", "Satuan": "pack", "Lokasi Penyimpanan": "Kulkas Utama", "Catatan": "Suplemen santri" },
      { "Nama Bahan (Wajib)": "Mentega Blue Band", "Barcode / ID (Opsional)": "MTG-014", "Stok Saat Ini (Wajib)": 5, "Kategori": "Susu & Olahan", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Utama", "Catatan": "Bahan roti & tumis" },
      { "Nama Bahan (Wajib)": "Terigu Segitiga Biru", "Barcode / ID (Opsional)": "TRG-015", "Stok Saat Ini (Wajib)": 30, "Kategori": "Sembako", "Satuan": "kg", "Lokasi Penyimpanan": "Rak Kering A", "Catatan": "Bahan gorengan" },
      { "Nama Bahan (Wajib)": "Sardin ABC Saus Tomat", "Barcode / ID (Opsional)": "SRD-016", "Stok Saat Ini (Wajib)": 40, "Kategori": "Bahan Kering", "Satuan": "pcs", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Lauk cadangan" },
      { "Nama Bahan (Wajib)": "Mie Instan Indomie Soto", "Barcode / ID (Opsional)": "MIE-017", "Stok Saat Ini (Wajib)": 160, "Kategori": "Bahan Kering", "Satuan": "pcs", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Konsumsi darurat" },
      { "Nama Bahan (Wajib)": "Kopi Bubuk Kapal Api", "Barcode / ID (Opsional)": "KOP-018", "Stok Saat Ini (Wajib)": 10, "Kategori": "Lainnya", "Satuan": "pack", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Minuman ustadz" },
      { "Nama Bahan (Wajib)": "Teh Celup Sariwangi", "Barcode / ID (Opsional)": "TEH-019", "Stok Saat Ini (Wajib)": 15, "Kategori": "Lainnya", "Satuan": "pack", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Minuman santri" },
      { "Nama Bahan (Wajib)": "Tempe Papan Besar", "Barcode / ID (Opsional)": "TMP-020", "Stok Saat Ini (Wajib)": 20, "Kategori": "Sayur & Buah", "Satuan": "pcs", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Lauk harian protein nabati" },
      { "Nama Bahan (Wajib)": "Tahu Putih Segar", "Barcode / ID (Opsional)": "TAH-021", "Stok Saat Ini (Wajib)": 50, "Kategori": "Sayur & Buah", "Satuan": "pcs", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Lauk harian protein nabati" },
      { "Nama Bahan (Wajib)": "Sayur Kol Kubis", "Barcode / ID (Opsional)": "KOL-022", "Stok Saat Ini (Wajib)": 15, "Kategori": "Sayur & Buah", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Bahan sayur sop" },
      { "Nama Bahan (Wajib)": "Wortel Manis Lokal", "Barcode / ID (Opsional)": "WTL-023", "Stok Saat Ini (Wajib)": 12, "Kategori": "Sayur & Buah", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Bahan sayur sop" },
      { "Nama Bahan (Wajib)": "Kentang Dieng Super", "Barcode / ID (Opsional)": "KTG-024", "Stok Saat Ini (Wajib)": 20, "Kategori": "Sayur & Buah", "Satuan": "kg", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Bahan sop & sambal goreng" },
      { "Nama Bahan (Wajib)": "Tomat Merah Segar", "Barcode / ID (Opsional)": "TMT-025", "Stok Saat Ini (Wajib)": 8, "Kategori": "Sayur & Buah", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Penyegar masakan" },
      { "Nama Bahan (Wajib)": "Daun Bawang Seledri", "Barcode / ID (Opsional)": "DBW-026", "Stok Saat Ini (Wajib)": 2, "Kategori": "Sayur & Buah", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Sayur", "Catatan": "Penyedap kuah" },
      { "Nama Bahan (Wajib)": "Santan Instan Kara", "Barcode / ID (Opsional)": "SNT-027", "Stok Saat Ini (Wajib)": 40, "Kategori": "Bahan Kering", "Satuan": "pcs", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Bahan lodeh / gulai" },
      { "Nama Bahan (Wajib)": "Ketumbar Bubuk Desaku", "Barcode / ID (Opsional)": "KTM-028", "Stok Saat Ini (Wajib)": 10, "Kategori": "Bumbu & Rempah", "Satuan": "pack", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu gorengan" },
      { "Nama Bahan (Wajib)": "Kunyit Bubuk Desaku", "Barcode / ID (Opsional)": "KNY-029", "Stok Saat Ini (Wajib)": 10, "Kategori": "Bumbu & Rempah", "Satuan": "pack", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu ayam" },
      { "Nama Bahan (Wajib)": "Merica Bubuk Ladaku", "Barcode / ID (Opsional)": "MRC-030", "Stok Saat Ini (Wajib)": 15, "Kategori": "Bumbu & Rempah", "Satuan": "pack", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu sup" },
      { "Nama Bahan (Wajib)": "Asam Jawa Matang", "Barcode / ID (Opsional)": "ASM-031", "Stok Saat Ini (Wajib)": 3, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu sayur asem" },
      { "Nama Bahan (Wajib)": "Kemiri Kupas Bulat", "Barcode / ID (Opsional)": "KMR-032", "Stok Saat Ini (Wajib)": 4, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Bumbu ulek" },
      { "Nama Bahan (Wajib)": "Lengkuas Jahe Kunyit Basah", "Barcode / ID (Opsional)": "LJK-033", "Stok Saat Ini (Wajib)": 5, "Kategori": "Bumbu & Rempah", "Satuan": "kg", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Rempah basah" },
      { "Nama Bahan (Wajib)": "Daun Salam Sereh Jeruk", "Barcode / ID (Opsional)": "DSS-034", "Stok Saat Ini (Wajib)": 2, "Kategori": "Bumbu & Rempah", "Satuan": "ikat", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Rempah harum" },
      { "Nama Bahan (Wajib)": "Masako Kaldu Ayam", "Barcode / ID (Opsional)": "MSK-035", "Stok Saat Ini (Wajib)": 50, "Kategori": "Bumbu & Rempah", "Satuan": "pack", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Penyedap rasa ayam" },
      { "Nama Bahan (Wajib)": "Sasa MSG Gurih", "Barcode / ID (Opsional)": "SAS-036", "Stok Saat Ini (Wajib)": 10, "Kategori": "Bumbu & Rempah", "Satuan": "pack", "Lokasi Penyimpanan": "Bumbu Station", "Catatan": "Penyedap tambahan" },
      { "Nama Bahan (Wajib)": "Saos Sambal Belibis", "Barcode / ID (Opsional)": "SAO-037", "Stok Saat Ini (Wajib)": 6, "Kategori": "Bahan Kering", "Satuan": "pack", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Cocolan lauk" },
      { "Nama Bahan (Wajib)": "Kerupuk Udang Mentah", "Barcode / ID (Opsional)": "KRP-038", "Stok Saat Ini (Wajib)": 10, "Kategori": "Bahan Kering", "Satuan": "kg", "Lokasi Penyimpanan": "Rak Kering A", "Catatan": "Pelengkap makan siang" },
      { "Nama Bahan (Wajib)": "Margarin Amanda Curah", "Barcode / ID (Opsional)": "MGR-039", "Stok Saat Ini (Wajib)": 15, "Kategori": "Susu & Olahan", "Satuan": "kg", "Lokasi Penyimpanan": "Kulkas Utama", "Catatan": "Olesan roti bakar" },
      { "Nama Bahan (Wajib)": "Ragi Instan Fermipan", "Barcode / ID (Opsional)": "RGI-040", "Stok Saat Ini (Wajib)": 12, "Kategori": "Bahan Kering", "Satuan": "pcs", "Lokasi Penyimpanan": "Rak Kering B", "Catatan": "Bahan roti / donat" }
    ];

    const worksheet = XLSX.utils.json_to_sheet(defaultTemplates);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template 40 Bahan");
    XLSX.writeFile(workbook, "Template_Import_40_Bahan_Dapur.xlsx");
  };

  const populate40TemplateItems = () => {
    const defaultTemplates = [
      { id: "BRS-001", name: "Beras Sentra Ramos", category: "Sembako" as const, currentStock: 100, unit: "kg" as const, location: "Rak Kering A", notes: "Kebutuhan pokok santri" },
      { id: "MYK-002", name: "Minyak Goreng Filma", category: "Sembako" as const, currentStock: 50, unit: "liter" as const, location: "Rak Kering B", notes: "Stok bulanan" },
      { id: "DGG-003", name: "Daging Sapi Segar", category: "Daging & Ikan" as const, currentStock: 15, unit: "kg" as const, location: "Freezer Daging", notes: "Lauk hari besar" },
      { id: "AYM-004", name: "Ayam Broiler Fillet", category: "Daging & Ikan" as const, currentStock: 20, unit: "kg" as const, location: "Freezer Daging", notes: "Lauk mingguan" },
      { id: "TLR-005", name: "Telur Ayam Negeri", category: "Sembako" as const, currentStock: 120, unit: "butir" as const, location: "Rak Kering A", notes: "Sarapan pagi" },
      { id: "BWG-006", name: "Bawang Merah Brebes", category: "Bumbu & Rempah" as const, currentStock: 10, unit: "kg" as const, location: "Bumbu Station", notes: "Bumbu dasar" },
      { id: "BWG-007", name: "Bawang Putih Kating", category: "Bumbu & Rempah" as const, currentStock: 8, unit: "kg" as const, location: "Bumbu Station", notes: "Bumbu dasar" },
      { id: "CAB-008", name: "Cabe Merah Keriting", category: "Bumbu & Rempah" as const, currentStock: 5, unit: "kg" as const, location: "Kulkas Sayur", notes: "Bumbu sambal" },
      { id: "CAB-009", name: "Cabe Rawit Hijau", category: "Bumbu & Rempah" as const, currentStock: 3, unit: "kg" as const, location: "Kulkas Sayur", notes: "Bumbu gorengan" },
      { id: "GUL-010", name: "Gula Pasir Gulaku", category: "Sembako" as const, currentStock: 25, unit: "kg" as const, location: "Rak Kering A", notes: "Pemanis teh hangat" },
      { id: "GRM-011", name: "Garam Dapur Berberyodium", category: "Bumbu & Rempah" as const, currentStock: 15, unit: "pack" as const, location: "Rak Kering B", notes: "Penyedap rasa" },
      { id: "KCP-012", name: "Kecap Manis Bango", category: "Sembako" as const, currentStock: 12, unit: "liter" as const, location: "Rak Kering B", notes: "Bumbu masak" },
      { id: "SSU-013", name: "Susu UHT Ultra Milk", category: "Susu & Olahan" as const, currentStock: 24, unit: "pack" as const, location: "Kulkas Utama", notes: "Suplemen santri" },
      { id: "MTG-014", name: "Mentega Blue Band", category: "Susu & Olahan" as const, currentStock: 5, unit: "kg" as const, location: "Kulkas Utama", notes: "Bahan roti & tumis" },
      { id: "TRG-015", name: "Terigu Segitiga Biru", category: "Sembako" as const, currentStock: 30, unit: "kg" as const, location: "Rak Kering A", notes: "Bahan gorengan" },
      { id: "SRD-016", name: "Sardin ABC Saus Tomat", category: "Bahan Kering" as const, currentStock: 40, unit: "pcs" as const, location: "Rak Kering B", notes: "Lauk cadangan" },
      { id: "MIE-017", name: "Mie Instan Indomie Soto", category: "Bahan Kering" as const, currentStock: 160, unit: "pcs" as const, location: "Rak Kering B", notes: "Konsumsi darurat" },
      { id: "KOP-018", name: "Kopi Bubuk Kapal Api", category: "Lainnya" as const, currentStock: 10, unit: "pack" as const, location: "Rak Kering B", notes: "Minuman ustadz" },
      { id: "TEH-019", name: "Teh Celup Sariwangi", category: "Lainnya" as const, currentStock: 15, unit: "pack" as const, location: "Rak Kering B", notes: "Minuman santri" },
      { id: "TMP-020", name: "Tempe Papan Besar", category: "Sayur & Buah" as const, currentStock: 20, unit: "pcs" as const, location: "Kulkas Sayur", notes: "Lauk harian protein nabati" },
      { id: "TAH-021", name: "Tahu Putih Segar", category: "Sayur & Buah" as const, currentStock: 50, unit: "pcs" as const, location: "Kulkas Sayur", notes: "Lauk harian protein nabati" },
      { id: "KOL-022", name: "Sayur Kol Kubis", category: "Sayur & Buah" as const, currentStock: 15, unit: "kg" as const, location: "Kulkas Sayur", notes: "Bahan sayur sop" },
      { id: "WTL-023", name: "Wortel Manis Lokal", category: "Sayur & Buah" as const, currentStock: 12, unit: "kg" as const, location: "Kulkas Sayur", notes: "Bahan sayur sop" },
      { id: "KTG-024", name: "Kentang Dieng Super", category: "Sayur & Buah" as const, currentStock: 20, unit: "kg" as const, location: "Rak Kering B", notes: "Bahan sop & sambal goreng" },
      { id: "TMT-025", name: "Tomat Merah Segar", category: "Sayur & Buah" as const, currentStock: 8, unit: "kg" as const, location: "Kulkas Sayur", notes: "Penyegar masakan" },
      { id: "DBW-026", name: "Daun Bawang Seledri", category: "Sayur & Buah" as const, currentStock: 2, unit: "kg" as const, location: "Kulkas Sayur", notes: "Penyedap kuah" },
      { id: "SNT-027", name: "Santan Instan Kara", category: "Bahan Kering" as const, currentStock: 40, unit: "pcs" as const, location: "Rak Kering B", notes: "Bahan lodeh / gulai" },
      { id: "KTM-028", name: "Ketumbar Bubuk Desaku", category: "Bumbu & Rempah" as const, currentStock: 10, unit: "pack" as const, location: "Bumbu Station", notes: "Bumbu gorengan" },
      { id: "KNY-029", name: "Kunyit Bubuk Desaku", category: "Bumbu & Rempah" as const, currentStock: 10, unit: "pack" as const, location: "Bumbu Station", notes: "Bumbu ayam" },
      { id: "MRC-030", name: "Merica Bubuk Ladaku", category: "Bumbu & Rempah" as const, currentStock: 15, unit: "pack" as const, location: "Bumbu Station", notes: "Bumbu sup" },
      { id: "ASM-031", name: "Asam Jawa Matang", category: "Bumbu & Rempah" as const, currentStock: 3, unit: "kg" as const, location: "Bumbu Station", notes: "Bumbu sayur asem" },
      { id: "KMR-032", name: "Kemiri Kupas Bulat", category: "Bumbu & Rempah" as const, currentStock: 4, unit: "kg" as const, location: "Bumbu Station", notes: "Bumbu ulek" },
      { id: "LJK-033", name: "Lengkuas Jahe Kunyit Basah", category: "Bumbu & Rempah" as const, currentStock: 5, unit: "kg" as const, location: "Bumbu Station", notes: "Rempah basah" },
      { id: "DSS-034", name: "Daun Salam Sereh Jeruk", category: "Bumbu & Rempah" as const, currentStock: 2, unit: "ikat" as const, location: "Bumbu Station", notes: "Rempah harum" },
      { id: "MSK-035", name: "Masako Kaldu Ayam", category: "Bumbu & Rempah" as const, currentStock: 50, unit: "pack" as const, location: "Bumbu Station", notes: "Penyedap rasa ayam" },
      { id: "SAS-036", name: "Sasa MSG Gurih", category: "Bumbu & Rempah" as const, currentStock: 10, unit: "pack" as const, location: "Bumbu Station", notes: "Penyedap tambahan" },
      { id: "SAO-037", name: "Saos Sambal Belibis", category: "Bahan Kering" as const, currentStock: 6, unit: "pack" as const, location: "Rak Kering B", notes: "Cocolan lauk" },
      { id: "KRP-038", name: "Kerupuk Udang Mentah", category: "Bahan Kering" as const, currentStock: 10, unit: "kg" as const, location: "Rak Kering A", notes: "Pelengkap makan siang" },
      { id: "MGR-039", name: "Margarin Amanda Curah", category: "Susu & Olahan" as const, currentStock: 15, unit: "kg" as const, location: "Kulkas Utama", notes: "Olesan roti bakar" },
      { id: "RGI-040", name: "Ragi Instan Fermipan", category: "Bahan Kering" as const, currentStock: 12, unit: "pcs" as const, location: "Rak Kering B", notes: "Bahan roti / donat" }
    ];
    setImportedRows(defaultTemplates);
  };

  const populate40BlankRows = () => {
    const blankRowsList = Array.from({ length: 40 }).map((_, index) => ({
      id: 'BRC-' + Math.floor(1000000000 + Math.random() * 9000000000),
      name: '',
      category: 'Sembako' as const,
      currentStock: 0,
      unit: 'kg' as const,
      location: LOCATIONS[0],
      notes: 'Input Manual Massal',
    }));
    setImportedRows(blankRowsList);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (importedRows.length === 0) return;

    setLoading(true);
    try {
      const itemsToUpdate: Ingredient[] = [];
      const logsToAdd: StockLog[] = [];
      let currentIngredientsCopy = [...ingredients];
      let importedCount = 0;
      
      for (const row of importedRows) {
        if (!row.name.trim() || !row.id.trim()) continue;

        const existing = currentIngredientsCopy.find(
          i => i.id === row.id.trim() || i.name.toLowerCase() === row.name.trim().toLowerCase()
        );

        const rowStock = Number(row.currentStock) || 0;

        if (existing) {
          if (conflictStrategy === 'skip') {
            continue;
          }

          const oldStock = existing.currentStock;
          const newStock = conflictStrategy === 'merge' ? (oldStock + rowStock) : rowStock;

          const updatedItem: Ingredient = {
            ...existing,
            currentStock: newStock,
            lastUpdated: new Date().toISOString(),
          };

          currentIngredientsCopy = currentIngredientsCopy.map(i => i.id === existing.id ? updatedItem : i);
          itemsToUpdate.push(updatedItem);

          if (newStock !== oldStock) {
            logsToAdd.push({
              id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 100) + '-' + Math.floor(Math.random() * 100),
              timestamp: new Date().toISOString(),
              ingredientId: existing.id,
              ingredientName: existing.name,
              type: newStock > oldStock ? 'MASUK' : 'KELUAR',
              quantity: Math.abs(newStock - oldStock),
              prevStock: oldStock,
              newStock,
              user: userName,
              notes: `Import File (${conflictStrategy === 'merge' ? 'Gabung' : 'Ganti'}): ${row.notes || 'Tanpa keterangan'}`,
            });
          }
        } else {
          if (rowStock <= 0) continue; // Skip creating new items with 0 stock

          const initialBatch: StockBatch = {
            id: 'BATCH-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            quantity: rowStock,
            initialQuantity: rowStock,
            receivedDate: new Date().toISOString(),
          };

          const newIngredient: Ingredient = {
            id: row.id.trim(),
            name: row.name.trim(),
            category: row.category,
            currentStock: rowStock,
            unit: row.unit,
            location: row.location as any,
            notes: row.notes || 'Import File',
            lastUpdated: new Date().toISOString(),
            batches: [initialBatch]
          };

          currentIngredientsCopy.push(newIngredient);
          itemsToUpdate.push(newIngredient);

          logsToAdd.push({
            id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 100) + '-' + Math.floor(Math.random() * 100),
            timestamp: new Date().toISOString(),
            ingredientId: newIngredient.id,
            ingredientName: newIngredient.name,
            type: 'MASUK',
            quantity: rowStock,
            prevStock: 0,
            newStock: rowStock,
            user: userName,
            notes: 'Import File (Bahan Baru)',
          });
        }
        importedCount++;
      }

      if (onBatchAddOrUpdateIngredientsAndLogs) {
        await onBatchAddOrUpdateIngredientsAndLogs(itemsToUpdate, logsToAdd);
      } else {
        // Fallback
        for (const item of itemsToUpdate) {
          const hasExisting = ingredients.some(i => i.id === item.id);
          if (hasExisting) {
            await onUpdateIngredient(item);
          } else {
            await onAddIngredient(item);
          }
        }
        for (const log of logsToAdd) {
          await onLogTransaction(log);
        }
      }

      alert(`Sukses mengimpor ${importedCount} data bahan makanan ke Master Stok!`);
      setShowImportModal(false);
      setImportedRows([]);
    } catch (err) {
      console.error(err);
      alert('Gagal mengimpor beberapa bahan makanan dari file.');
    } finally {
      setLoading(false);
    }
  };

  const updateImportedRow = (index: number, field: string, value: any) => {
    const updated = [...importedRows];
    updated[index] = { ...updated[index], [field]: value };
    setImportedRows(updated);
  };

  const removeImportedRow = (index: number) => {
    setImportedRows(importedRows.filter((_, idx) => idx !== index));
  };

  // Filter & Search Logic
  const filteredIngredients = useMemo(() => {
    return ingredients.filter(item => {
      // 1. Search term match
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.notes || '').toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Category match
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;

      // 3. Status filter match
      const matchesStatus = true;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [ingredients, searchTerm, selectedCategory, statusFilter]);

  // Sort Ingredients
  const sortedIngredients = useMemo(() => {
    return [...filteredIngredients].sort((a, b) => {
      const valA = a[sortBy === 'stock' ? 'currentStock' : 'name'];
      const valB = b[sortBy === 'stock' ? 'currentStock' : 'name'];

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredIngredients, sortBy, sortOrder]);

  return (
    <div className="space-y-6 font-sans text-slate-800">
      
      {/* Top Controller Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 justify-between items-center">
        
        {/* Search Bar */}
        <div className="w-full md:w-auto flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama atau kode bahan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>
        </div>

        {/* Filter Selection Panel */}
        <div className="w-full md:w-auto flex flex-wrap gap-2 items-center justify-end">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer font-bold"
            >
              <option value="All">Semua Kategori</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>



          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" /> Import File
            </button>

            <button
              onClick={() => setShowBulkModal(true)}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Masuk Massal
            </button>

            {userRole === 'ADMIN' && (
              <button
                onClick={() => openItemModal('ADD')}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Bahan Baru
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Ingredient Table/Cards Container */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Table layout for tablet / desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 font-bold uppercase tracking-wider">
                <th className="px-6 py-3.5">Kode ID</th>
                <th className="px-6 py-3.5 cursor-pointer hover:bg-slate-100/50" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">Nama Bahan <ArrowUpDown className="w-3.5 h-3.5" /></div>
                </th>
                <th className="px-6 py-3.5">Kategori</th>
                <th className="px-6 py-3.5 cursor-pointer hover:bg-slate-100/50 text-right" onClick={() => handleSort('stock')}>
                  <div className="flex items-center gap-1 justify-end">Stok <ArrowUpDown className="w-3.5 h-3.5" /></div>
                </th>
                <th className="px-6 py-3.5">Lokasi</th>
                <th className="px-6 py-3.5">Catatan</th>
                <th className="px-6 py-3.5 text-right">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sortedIngredients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    Belum ada bahan makanan yang cocok dengan pencarian / filter Anda.
                  </td>
                </tr>
              ) : (
                sortedIngredients.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-slate-400 font-bold">{item.id}</td>
                      <td className="px-6 py-4">
                        <p className="font-extrabold text-slate-800">{item.name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-100 text-slate-600 rounded text-xs font-semibold">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-black text-sm text-slate-800">
                            {item.currentStock} {item.unit}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold text-slate-500">{item.location}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-slate-400 truncate max-w-xs">{item.notes || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openAdjustModal(item, 'MASUK')}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors cursor-pointer"
                            title="Tambah Stok (Masuk)"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openAdjustModal(item, 'KELUAR')}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors cursor-pointer"
                            title="Kurang Stok (Ambil/Keluar)"
                          >
                            <MinusCircle className="w-4 h-4" />
                          </button>
                          
                          {/* Admin Only Profile Actions */}
                          {userRole === 'ADMIN' && (
                            <>
                              <button
                                onClick={() => openItemModal('EDIT', item)}
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer"
                                title="Edit Detail"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer"
                                title="Hapus Bahan"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Card/List layout for mobile */}
        <div className="md:hidden divide-y divide-slate-100">
          {sortedIngredients.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 font-medium">
              Belum ada bahan makanan yang cocok dengan pencarian / filter Anda.
            </div>
          ) : (
            sortedIngredients.map((item) => {
              return (
                <div key={item.id} className="p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase">
                        {item.category}
                      </span>
                      <h4 className="font-extrabold text-slate-800 mt-1">{item.name}</h4>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">ID: {item.id} • {item.location}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black block text-slate-800">
                        {item.currentStock} {item.unit}
                      </span>
                    </div>
                  </div>

                  {item.notes && <p className="text-xs text-slate-400 line-clamp-1">{item.notes}</p>}

                  {/* Actions wrapper */}
                  <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">{item.location}</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openAdjustModal(item, 'MASUK')}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Masuk
                      </button>
                      <button
                        onClick={() => openAdjustModal(item, 'KELUAR')}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MinusCircle className="w-3.5 h-3.5" /> Ambil
                      </button>
                      
                      {userRole === 'ADMIN' && (
                        <div className="flex gap-1 pl-1.5 border-l border-slate-100">
                          <button
                            onClick={() => openItemModal('EDIT', item)}
                            className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. ADD / EDIT ITEM MODAL */}
      {showItemModal && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-100 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                {modalMode === 'ADD' ? 'Tambah Bahan Makanan Baru' : 'Edit Detail Bahan Makanan'}
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                {modalMode === 'ADD' 
                  ? 'Isi detail bahan baru. Jika memasukkan Kode ID yang sama dengan barang lama, data barang tersebut akan otomatis ter-update.'
                  : 'Gunakan form ini untuk melakukan koreksi profil barang dan stok secara manual.'}
              </p>

              <form onSubmit={handleItemSubmit} className="space-y-4">
                {/* ID / Kode Bahan Field */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Kode ID Bahan (Otomatis)</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={formId}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-500 bg-slate-100 font-mono font-bold cursor-not-allowed"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Nama Bahan Makanan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Beras Cianjur Premium"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-semibold"
                  />
                </div>

                {/* Category & Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Kategori</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as Ingredient['category'])}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer font-semibold"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Satuan Ukuran</label>
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value as Ingredient['unit'])}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer font-semibold"
                    >
                      {UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Stocks level */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Jumlah Masuk / Stok Saat Ini</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={formCurrentStock}
                    onChange={(e) => setFormCurrentStock(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-semibold"
                  />
                </div>

                {/* Storage Location */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Lokasi Penyimpanan</label>
                  <select
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer font-semibold"
                  >
                    {LOCATIONS.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Catatan Tambahan (Opsional)</label>
                  <textarea
                    placeholder="Contoh: Merek 'X', supplier, dsb."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 resize-none font-medium"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Simpan Bahan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 3. QUICK TRANSAKSI STOCK ADJUST MODAL */}
      {showAdjustModal && selectedAdjustItem && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 p-6">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {adjustType === 'MASUK' ? 'Mutasi Stok MASUK (Bahan Datang)' : 'Mutasi Stok KELUAR (Ambil Bahan)'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Nama Bahan: <strong className="font-bold text-slate-700">{selectedAdjustItem.name}</strong> (Stok saat ini: {selectedAdjustItem.currentStock} {selectedAdjustItem.unit})
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Jumlah Mutasi ({selectedAdjustItem.unit})</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="Masukkan jumlah..."
                  value={adjustQty || ''}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Keterangan / Catatan</label>
                <textarea
                  placeholder="Tulis alasan, contoh: Pengiriman logistik mingguan, dsb."
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  rows={2.5}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 resize-none font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading || adjustQty <= 0}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Proses Mutasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. BULK MULTI-ITEM INPUT MODAL ("Barang Masuk Massal" - Item 5) */}
      {showBulkModal && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl border border-slate-100 p-6 flex flex-col justify-between max-h-[90vh]">
            <div>
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-5">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-indigo-500" /> Penerimaan Barang Masuk Massal
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Masukkan banyak bahan baku yang baru datang sekaligus. Ketik kode ID untuk auto-fill data bahan lama.
                  </p>
                </div>
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Rows List */}
              <form onSubmit={handleBulkSubmit} className="space-y-4 flex-1 overflow-y-auto max-h-[50vh] pr-2">
                <datalist id="bulk-ingredients-list">
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.name}>
                      {ing.category} (Stok: {ing.currentStock} {ing.unit})
                    </option>
                  ))}
                </datalist>
                <div className="space-y-3">
                  {bulkRows.map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-slate-50/60 p-3 rounded-2xl border border-slate-100 items-center relative"
                    >
                      {/* Delete button for row */}
                      <button
                        type="button"
                        onClick={() => removeBulkRow(index)}
                        className="absolute -top-2 -right-2 md:static md:col-span-1 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors cursor-pointer flex items-center justify-center self-center"
                        title="Hapus baris"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>

                      {/* Kode ID Column */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1 md:hidden">Kode ID Bahan (Otomatis)</label>
                        <input
                          type="text"
                          readOnly
                          disabled
                          placeholder="Kode ID Otomatis..."
                          value={row.id}
                          className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-400 bg-slate-100 font-mono font-bold cursor-not-allowed"
                        />
                      </div>

                      {/* Name Column */}
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1 md:hidden">Nama Bahan</label>
                        <input
                          type="text"
                          required
                          list="bulk-ingredients-list"
                          placeholder="Nama bahan..."
                          value={row.name}
                          onChange={(e) => updateBulkRow(index, 'name', e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                      </div>

                      {/* Category & Location Column */}
                      <div className="md:col-span-2 grid grid-cols-2 gap-1">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1 md:hidden">Kategori</label>
                          <select
                            value={row.category}
                            onChange={(e) => updateBulkRow(index, 'category', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-1.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none cursor-pointer font-bold"
                          >
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1 md:hidden">Satuan</label>
                          <select
                            value={row.unit}
                            onChange={(e) => updateBulkRow(index, 'unit', e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-1.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none cursor-pointer font-bold"
                          >
                            {UNITS.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Quantity Column */}
                      <div className="md:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1 md:hidden">Jumlah</label>
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          required
                          placeholder="Qty..."
                          value={row.quantity || ''}
                          onChange={(e) => updateBulkRow(index, 'quantity', Number(e.target.value))}
                          className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500 font-bold"
                        />
                      </div>

                      {/* Notes Column */}
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1 md:hidden">Catatan</label>
                        <input
                          type="text"
                          placeholder="Catatan..."
                          value={row.notes}
                          onChange={(e) => updateBulkRow(index, 'notes', e.target.value)}
                          className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Row Button */}
                <button
                  type="button"
                  onClick={addBulkRow}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-200 text-slate-600 rounded-2xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Baris Bahan Baru
                </button>

                {/* Submit Container */}
                <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold rounded-xl text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    {loading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" /> Simpan Semua Barang Masuk ({bulkRows.filter(r => r.id.trim() && r.name.trim() && r.quantity > 0).length})
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 5. EXCEL & PDF FILE IMPORT SYSTEM MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl border border-slate-100 p-6 flex flex-col justify-between max-h-[92vh]">
            <div>
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-5">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Upload className="w-5 h-5 text-emerald-500" /> Import Master Stok via Excel / PDF
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload berkas laporan, tabel, atau invoice belanja berupa Excel atau PDF untuk memasukkan data barang ke dapur secara instan.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportedRows([]);
                    setImportError(null);
                  }}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Upload Zone & Instructions */}
              {importedRows.length === 0 ? (
                <div className="space-y-6">
                  {/* Parsing State */}
                  {isParsingFile ? (
                    <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/10 rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-4 animate-pulse">
                      <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
                      <p className="text-sm font-bold text-slate-700">Mengekstrak dan Memproses Data Berkas...</p>
                      <p className="text-xs text-slate-400">Kami sedang mendeteksi kolom, tabel, dan mencocokkan data bahan makanan otomatis.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <label className="border-2 border-dashed border-slate-200 hover:border-emerald-400 bg-slate-50/50 hover:bg-emerald-50/5 rounded-2xl p-12 text-center cursor-pointer block transition-all">
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv,.pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                            <FileSpreadsheet className="w-8 h-8" />
                          </div>
                          <p className="text-sm font-bold text-slate-700">Tarik & Lepas Berkas di Sini, atau Klik untuk Mencari</p>
                          <p className="text-xs text-slate-400 max-w-md mx-auto">
                            Mendukung format lembar kerja Excel (<strong className="text-slate-600 font-bold">.xlsx, .xls, .csv</strong>) serta dokumen teks (<strong className="text-slate-600 font-bold">.pdf</strong>) dari laporan belanja dapur.
                          </p>
                        </div>
                      </label>

                      {/* Quick 40-Item Import Options */}
                      <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl space-y-3.5">
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Metode Cepat: Input 40 Bahan Makanan Sekaligus
                          </h4>
                          <p className="text-[11px] text-slate-400">
                            Tidak punya file Excel? Gunakan tombol di bawah untuk membuat template Excel isi 40 bahan, atau langsung input 40 bahan ke tabel review di layar ini secara instan.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          {/* Button 1: Download template */}
                          <button
                            type="button"
                            onClick={downloadExcelTemplate40}
                            className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-xs"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Download Template Excel
                          </button>

                          {/* Button 2: Populate form with examples */}
                          <button
                            type="button"
                            onClick={populate40TemplateItems}
                            className="py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-xs"
                          >
                            <PlusCircle className="w-4 h-4 text-indigo-600" /> Gunakan 40 Contoh Bahan
                          </button>

                          {/* Button 3: Populate empty rows */}
                          <button
                            type="button"
                            onClick={populate40BlankRows}
                            className="py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-xs"
                          >
                            <Plus className="w-4 h-4 text-slate-500" /> Gunakan 40 Baris Kosong
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {importError && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex gap-2 items-start font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Gagal memproses file:</p>
                        <p className="mt-0.5 text-slate-500">{importError}</p>
                      </div>
                    </div>
                  )}

                  {/* Format Guide Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 mb-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Format Kolom Excel & CSV
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Parser Excel secara cerdas akan mencocokkan kolom secara otomatis berdasarkan baris judul tabel Anda. Untuk hasil terbaik, gunakan judul kolom berikut:
                      </p>
                      <ul className="text-[10px] text-slate-500 font-bold mt-2 space-y-1 pl-4 list-disc">
                        <li>Nama Bahan / Nama Barang (Kolom 1 - Wajib)</li>
                        <li>Barcode / ID Barang (Kolom 2 - Opsional)</li>
                        <li>Stok Saat Ini / Jumlah / Qty (Kolom 3 - Wajib)</li>
                        <li>Kategori, Satuan, Lokasi Penyimpanan (Opsional)</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 mb-2">
                        <FileText className="w-4 h-4 text-indigo-500" /> Format Dokumen PDF (Text-Based)
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Sistem mengekstrak isi teks di dalam dokumen PDF belanjaan. Pastikan PDF berformat teks digital (bukan hasil scan foto kabur) dengan struktur teratur:
                      </p>
                      <ul className="text-[10px] text-slate-500 font-bold mt-2 space-y-1 pl-4 list-disc">
                        <li>Satu baris mewakili satu data bahan makanan.</li>
                        <li>Pemisah antar informasi berupa spasi ganda, koma, atau tab.</li>
                        <li>Contoh baris valid: <span className="font-mono bg-white px-1.5 py-0.5 border border-slate-200 rounded text-slate-600 text-[9px]">Minyak Goreng Bimoli, 8992013, 20 liter, Sembako</span></li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Results Sub-header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Berhasil mengekstrak {importedRows.length} item bahan makanan dari file.
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Silakan periksa, edit detail, atau lengkapi kolom kosong di bawah sebelum menyimpannya secara massal ke Master Stok.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImportedRows([])}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Pilih Berkas Lain
                    </button>
                  </div>

                  {/* Mass Action Row */}
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold">Tabel Review Hasil Ekstraksi Berkas</span>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultLoc = prompt('Set seluruh lokasi penyimpanan hasil import ke:', LOCATIONS[0]);
                        if (defaultLoc && LOCATIONS.includes(defaultLoc as any)) {
                          setImportedRows(importedRows.map(row => ({ ...row, location: defaultLoc })));
                        }
                      }}
                      className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      Set Lokasi Massal
                    </button>
                  </div>

                  {/* Editable Review Table */}
                  <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-[40vh] overflow-y-auto bg-slate-50/50">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase tracking-wider">
                          <th className="px-3 py-2.5 w-10">#</th>
                          <th className="px-3 py-2.5 w-36">Barcode / Kode ID</th>
                          <th className="px-3 py-2.5">Nama Bahan Makanan</th>
                          <th className="px-3 py-2.5 w-32">Kategori</th>
                          <th className="px-3 py-2.5 w-20 text-right">Stok</th>
                          <th className="px-3 py-2.5 w-20">Satuan</th>
                          <th className="px-3 py-2.5 w-32">Lokasi</th>
                          <th className="px-3 py-2.5 w-24">Catatan</th>
                          <th className="px-3 py-2.5 w-12 text-center">Hapus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {importedRows.map((row, index) => (
                          <tr key={index} className="hover:bg-slate-50/30">
                            <td className="px-3 py-2 text-slate-400 font-bold">{index + 1}</td>
                            
                            {/* Barcode / ID */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                required
                                value={row.id}
                                onChange={(e) => updateImportedRow(index, 'id', e.target.value.trim())}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800 bg-slate-50/40 focus:bg-white focus:outline-none focus:border-emerald-500"
                              />
                            </td>

                            {/* Nama Bahan */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                required
                                value={row.name}
                                onChange={(e) => updateImportedRow(index, 'name', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-extrabold text-slate-800 bg-slate-50/40 focus:bg-white focus:outline-none focus:border-emerald-500"
                              />
                            </td>

                            {/* Kategori */}
                            <td className="px-2 py-1.5">
                              <select
                                value={row.category}
                                onChange={(e) => updateImportedRow(index, 'category', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                              >
                                {CATEGORIES.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </td>

                            {/* Stok */}
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                required
                                min={0}
                                step="any"
                                value={row.currentStock}
                                onChange={(e) => updateImportedRow(index, 'currentStock', Number(e.target.value))}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-right text-slate-800 bg-slate-50/40 focus:bg-white focus:outline-none focus:border-emerald-500"
                              />
                            </td>

                            {/* Satuan */}
                            <td className="px-2 py-1.5">
                              <select
                                value={row.unit}
                                onChange={(e) => updateImportedRow(index, 'unit', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-1 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                              >
                                {UNITS.map(u => (
                                  <option key={u} value={u}>{u}</option>
                                ))}
                              </select>
                            </td>

                            {/* Lokasi */}
                            <td className="px-2 py-1.5">
                              <select
                                value={row.location}
                                onChange={(e) => updateImportedRow(index, 'location', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-1 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                              >
                                {LOCATIONS.map(loc => (
                                  <option key={loc} value={loc}>{loc}</option>
                                ))}
                              </select>
                            </td>

                            {/* Catatan */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row.notes || ''}
                                onChange={(e) => updateImportedRow(index, 'notes', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-600 bg-slate-50/40 focus:bg-white focus:outline-none"
                              />
                            </td>

                            {/* Delete row button */}
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeImportedRow(index)}
                                className="p-1 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer"
                                title="Hapus baris ini dari daftar import"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Collision / Duplicate Conflict Strategy Config */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <p className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-indigo-500 animate-bounce" /> Konfigurasi Penanganan Bentrok Data Barang
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Jika barcode / nama barang yang di-import sudah terdaftar di Master Stok dapur, tindakan apa yang ingin dilakukan?
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      {/* 1. Merge Strategy */}
                      <button
                        type="button"
                        onClick={() => setConflictStrategy('merge')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                          conflictStrategy === 'merge'
                            ? 'bg-emerald-50/40 border-emerald-400 shadow-xs'
                            : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-black text-slate-800 flex items-center gap-1">
                          {conflictStrategy === 'merge' && <Check className="w-3.5 h-3.5 text-emerald-600" />} Gabungkan Stok (Akumulatif)
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">Stok dari berkas akan ditambahkan langsung ke sisa stok dapur saat ini.</p>
                      </button>

                      {/* 2. Overwrite Strategy */}
                      <button
                        type="button"
                        onClick={() => setConflictStrategy('overwrite')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                          conflictStrategy === 'overwrite'
                            ? 'bg-amber-50/40 border-amber-400 shadow-xs'
                            : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-black text-slate-800 flex items-center gap-1">
                          {conflictStrategy === 'overwrite' && <Check className="w-3.5 h-3.5 text-amber-600" />} Ganti Stok (Timpa Total)
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">Stok lama dapur diabaikan, diganti sepenuhnya dengan angka stok dari berkas.</p>
                      </button>

                      {/* 3. Skip Strategy */}
                      <button
                        type="button"
                        onClick={() => setConflictStrategy('skip')}
                        className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                          conflictStrategy === 'skip'
                            ? 'bg-slate-100 border-slate-400 shadow-xs'
                            : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-black text-slate-800 flex items-center gap-1">
                          {conflictStrategy === 'skip' && <Check className="w-3.5 h-3.5 text-slate-600" />} Lewati / Skip
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">Jangan sentuh barang lama. Baris import hanya akan memproses barang baru saja.</p>
                      </button>
                    </div>
                  </div>

                  {/* Submission and Control Footer */}
                  <div className="flex gap-3 pt-2 border-t border-slate-100 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowImportModal(false);
                        setImportedRows([]);
                      }}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleImportSubmit}
                      disabled={loading || importedRows.length === 0}
                      className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {loading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Konfirmasi Import ({importedRows.length} Bahan)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
