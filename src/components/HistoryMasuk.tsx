import React, { useState, useMemo } from 'react';
import { Ingredient, StockLog } from '../types';
import { 
  History, 
  Search, 
  Calendar, 
  User, 
  Download, 
  FileSpreadsheet, 
  Layers, 
  TrendingUp, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Info,
  ArrowUpRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface HistoryMasukProps {
  logs: StockLog[];
  ingredients: Ingredient[];
}

export default function HistoryMasuk({ logs, ingredients }: HistoryMasukProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedUser, setSelectedUser] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Filter logs to only get MASUK transactions
  const stockMasukLogs = useMemo(() => {
    return logs.filter(log => log.type === 'MASUK');
  }, [logs]);

  // Extract unique categories from ingredients
  const categories = useMemo(() => {
    const cats = ingredients.map(ing => ing.category);
    return ['All', ...Array.from(new Set(cats))];
  }, [ingredients]);

  // Extract unique users/staff members who received stock
  const uniqueUsers = useMemo(() => {
    const users = stockMasukLogs.map(log => log.user);
    return ['All', ...Array.from(new Set(users))];
  }, [stockMasukLogs]);

  // Filter logic based on user selections
  const filteredLogs = useMemo(() => {
    return stockMasukLogs.filter(log => {
      // 1. Search term match (ingredient name, ingredient ID, or notes)
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term || 
        log.ingredientName.toLowerCase().includes(term) ||
        log.ingredientId.toLowerCase().includes(term) ||
        (log.notes && log.notes.toLowerCase().includes(term));

      // 2. Category match (lookup ingredient category)
      const ing = ingredients.find(i => i.id === log.ingredientId);
      const ingredientCategory = ing ? ing.category : 'Lainnya';
      const matchesCategory = selectedCategory === 'All' || ingredientCategory === selectedCategory;

      // 3. User match
      const matchesUser = selectedUser === 'All' || log.user === selectedUser;

      // 4. Date match
      let matchesDate = true;
      const logDate = new Date(log.timestamp);
      const today = new Date();
      
      if (dateFilter === 'today') {
        matchesDate = logDate.toDateString() === today.toDateString();
      } else if (dateFilter === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(today.getDate() - 7);
        matchesDate = logDate >= oneWeekAgo;
      } else if (dateFilter === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1);
        matchesDate = logDate >= oneMonthAgo;
      }

      return matchesSearch && matchesCategory && matchesUser && matchesDate;
    });
  }, [stockMasukLogs, ingredients, searchTerm, selectedCategory, selectedUser, dateFilter]);

  // Pagination helper
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  // Compute Metrics & Insights
  const stats = useMemo(() => {
    const totalTransactions = filteredLogs.length;
    
    // Sum incoming quantities
    const totalVolume = filteredLogs.reduce((acc, log) => acc + Math.abs(log.quantity), 0);

    // Find most frequently received ingredient
    const frequencyMap: { [key: string]: { count: number, name: string } } = {};
    filteredLogs.forEach(log => {
      if (!frequencyMap[log.ingredientId]) {
        frequencyMap[log.ingredientId] = { count: 0, name: log.ingredientName };
      }
      frequencyMap[log.ingredientId].count += 1;
    });

    let topIngredient = '-';
    let maxCount = 0;
    Object.keys(frequencyMap).forEach(id => {
      if (frequencyMap[id].count > maxCount) {
        maxCount = frequencyMap[id].count;
        topIngredient = frequencyMap[id].name;
      }
    });

    // Find most active staff for receiving stock
    const staffMap: { [key: string]: number } = {};
    filteredLogs.forEach(log => {
      staffMap[log.user] = (staffMap[log.user] || 0) + 1;
    });

    let topStaff = '-';
    let maxStaffCount = 0;
    Object.keys(staffMap).forEach(name => {
      if (staffMap[name] > maxStaffCount) {
        maxStaffCount = staffMap[name];
        topStaff = name;
      }
    });

    return {
      totalTransactions,
      totalVolume,
      topIngredient: topIngredient.length > 25 ? topIngredient.substring(0, 22) + '...' : topIngredient,
      topStaff,
    };
  }, [filteredLogs]);

  // Export filtered logs to Excel
  const handleExportToExcel = () => {
    if (filteredLogs.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const dataToExport = filteredLogs.map((log, index) => {
      const ing = ingredients.find(i => i.id === log.ingredientId);
      return {
        'No': index + 1,
        'Waktu Masuk': new Date(log.timestamp).toLocaleString('id-ID'),
        'ID Bahan': log.ingredientId,
        'Nama Bahan': log.ingredientName,
        'Kategori': ing ? ing.category : 'Lainnya',
        'Jumlah Masuk': Math.abs(log.quantity),
        'Satuan': ing ? ing.unit : '',
        'Stok Sebelumnya': log.prevStock,
        'Stok Sesudahnya': log.newStock,
        'Petugas Penerima': log.user,
        'Catatan / Vendor': log.notes || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat Barang Masuk");
    XLSX.writeFile(workbook, `History_Barang_Masuk_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* 1. Header Area */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <ArrowUpRight className="w-5 h-5 text-emerald-600" /> Riwayat Barang Masuk (Penerimaan Stok)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Mencatat dan melacak seluruh penerimaan serta pengadaan bahan baku makanan yang masuk ke gudang dapur.
          </p>
        </div>
        <button
          onClick={handleExportToExcel}
          disabled={filteredLogs.length === 0}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-200" /> Export Excel ({filteredLogs.length} Data)
        </button>
      </div>

      {/* 2. Sleek Metrics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Total Penerimaan</span>
            <span className="text-xl font-black text-slate-900 block mt-0.5">{stats.totalTransactions} Transaksi</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Volume Masuk</span>
            <span className="text-xl font-black text-slate-900 block mt-0.5">{stats.totalVolume.toLocaleString('id-ID')} unit</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-amber-50 text-amber-500 rounded-2xl shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Bahan Sering Masuk</span>
            <span className="text-sm font-black text-slate-900 block mt-0.5 truncate" title={stats.topIngredient}>
              {stats.topIngredient}
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-teal-50 text-teal-600 rounded-2xl shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Petugas Penerima</span>
            <span className="text-sm font-black text-slate-900 block mt-0.5 truncate" title={stats.topStaff}>
              {stats.topStaff}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Multi-Filter Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Filter Pencarian & Kategori</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama bahan, kode, atau catatan vendor..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 transition-all text-slate-800 font-medium"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 font-semibold cursor-pointer"
            >
              <option value="All">Semua Kategori</option>
              {categories.filter(c => c !== 'All').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* User/Staff Filter */}
          <div>
            <select
              value={selectedUser}
              onChange={(e) => {
                setSelectedUser(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 font-semibold cursor-pointer"
            >
              <option value="All">Semua Petugas</option>
              {uniqueUsers.filter(u => u !== 'All').map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="grid grid-cols-4 gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => { setDateFilter('all'); setCurrentPage(1); }}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                dateFilter === 'all' ? 'bg-white text-emerald-700 shadow-xs font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => { setDateFilter('today'); setCurrentPage(1); }}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                dateFilter === 'today' ? 'bg-white text-emerald-700 shadow-xs font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => { setDateFilter('week'); setCurrentPage(1); }}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                dateFilter === 'week' ? 'bg-white text-emerald-700 shadow-xs font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              7 Hari
            </button>
            <button
              onClick={() => { setDateFilter('month'); setCurrentPage(1); }}
              className={`py-1 rounded-lg text-[10px] font-bold transition-all ${
                dateFilter === 'month' ? 'bg-white text-emerald-700 shadow-xs font-extrabold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              30 Hari
            </button>
          </div>
        </div>
      </div>

      {/* 4. Display Logs List (Responsive Design) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-full border border-slate-100">
              <History className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-slate-700">Tidak ada riwayat penerimaan barang masuk</p>
            <p className="text-xs text-slate-400 max-w-sm">
              Sistem tidak menemukan log barang masuk yang sesuai dengan kata kunci pencarian atau filter yang Anda terapkan.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-4 px-5 w-12 text-center">No</th>
                    <th className="py-4 px-4 w-44">Waktu Masuk</th>
                    <th className="py-4 px-4 w-36">Kode ID</th>
                    <th className="py-4 px-4">Nama Bahan Baku</th>
                    <th className="py-4 px-4 w-36">Kategori</th>
                    <th className="py-4 px-4 w-32 text-right">Jumlah Masuk</th>
                    <th className="py-4 px-4 w-44">Petugas Penerima</th>
                    <th className="py-4 px-4 max-w-[200px]">Catatan / Vendor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedLogs.map((log, index) => {
                    const idx = (currentPage - 1) * itemsPerPage + index + 1;
                    const ing = ingredients.find(i => i.id === log.ingredientId);
                    
                    return (
                      <tr key={`${log.id}-${index}`} className="hover:bg-slate-50/40 text-slate-700 transition-colors">
                        <td className="py-3.5 px-5 text-center text-slate-400 font-bold">{idx}</td>
                        <td className="py-3.5 px-4 font-medium text-slate-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('id-ID', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-400">
                          {log.ingredientId}
                        </td>
                        <td className="py-3.5 px-4 font-extrabold text-slate-900">
                          {log.ingredientName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            {ing ? ing.category : 'Lainnya'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl text-xs">
                            +{Math.abs(log.quantity)} {ing ? ing.unit : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-700 flex items-center gap-1.5">
                          <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-[9px] text-emerald-800 font-black uppercase">
                            {log.user.substring(0, 2)}
                          </div>
                          <span className="truncate max-w-32">{log.user}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-medium max-w-[200px] truncate" title={log.notes}>
                          {log.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards List */}
            <div className="md:hidden divide-y divide-slate-100 p-4 space-y-3.5">
              {paginatedLogs.map((log, index) => {
                const idx = (currentPage - 1) * itemsPerPage + index + 1;
                const ing = ingredients.find(i => i.id === log.ingredientId);
                
                return (
                  <div key={`${log.id}-${index}`} className="bg-slate-50/40 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold block">NO. {idx} • ID: {log.ingredientId}</span>
                        <h4 className="text-sm font-extrabold text-slate-900 mt-1">{log.ingredientName}</h4>
                      </div>
                      <span className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl text-xs shrink-0">
                        +{Math.abs(log.quantity)} {ing ? ing.unit : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100/60">
                      <div>
                        <span className="text-slate-400 block font-semibold uppercase text-[9px]">Kategori</span>
                        <span className="font-bold text-slate-700">{ing ? ing.category : 'Lainnya'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold uppercase text-[9px]">Penerima</span>
                        <span className="font-bold text-slate-700 truncate block">{log.user}</span>
                      </div>
                    </div>

                    <div className="text-[11px] bg-white p-2 rounded-xl border border-slate-100 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Tanggal:</span>
                        <span className="text-slate-600 font-semibold">
                          {new Date(log.timestamp).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Catatan:</span>
                        <span className="text-slate-600 font-semibold truncate max-w-[180px]">{log.notes || '-'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-bold">
                  Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredLogs.length)} dari {filteredLogs.length} data
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Info Notice card */}
      <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex gap-3 items-start">
        <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-emerald-900 leading-relaxed font-semibold">
          Seluruh log penerimaan barang di atas tersimpan otomatis di basis data lokal secara langsung. Apabila koneksi Google Sheet aktif di tab <strong>Pengaturan</strong>, riwayat barang masuk ini juga ter-sync otomatis ke spreadsheet cloud.
        </p>
      </div>

    </div>
  );
}
