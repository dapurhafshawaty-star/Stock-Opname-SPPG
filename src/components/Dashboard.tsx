import { useMemo } from 'react';
import { Ingredient, StockLog } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, Package, ArrowRight, TrendingUp, TrendingDown, Sparkles, FlameKindling, Info, ArrowUpRight, ArrowDownRight, Clipboard, Heart } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardProps {
  ingredients: Ingredient[];
  logs: StockLog[];
  onNavigateToInventory: (filterType?: 'all' | 'low') => void;
}

export default function Dashboard({ ingredients, logs, onNavigateToInventory }: DashboardProps) {
  // 1. Calculate Metrics
  const totalItems = ingredients.length;
  const outOfStockItems = ingredients.filter(item => item.currentStock <= 0);
  const totalTransactions = logs.length;
  
  // Count transactions in past 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const transactionsToday = logs.filter(log => new Date(log.timestamp) >= oneDayAgo).length;

  // Calculate average outgoing ingredients per day
  const avgOutgoingPerDay = useMemo(() => {
    const keluarLogs = logs.filter(log => log.type === 'KELUAR');
    if (keluarLogs.length === 0) return 0;

    // Group outgoing quantity by date (local date string)
    const outgoingByDate: Record<string, number> = {};
    keluarLogs.forEach(log => {
      const dateStr = new Date(log.timestamp).toLocaleDateString('id-ID');
      outgoingByDate[dateStr] = (outgoingByDate[dateStr] || 0) + Math.abs(log.quantity);
    });

    const uniqueDays = Object.keys(outgoingByDate).length;
    const totalOutgoingVolume = keluarLogs.reduce((acc, log) => acc + Math.abs(log.quantity), 0);
    
    return uniqueDays > 0 ? (totalOutgoingVolume / uniqueDays) : 0;
  }, [logs]);

  // Calculate frequently used brands/items (from KELUAR logs)
  const frequentlyUsedBrands = useMemo(() => {
    const keluarLogs = logs.filter(log => log.type === 'KELUAR');
    
    // Group by ingredientId to accumulate usage stats
    const usageMap: Record<string, { 
      id: string;
      name: string; 
      category: string;
      unit: string;
      count: number; 
      totalVolume: number;
    }> = {};

    keluarLogs.forEach(log => {
      const ing = ingredients.find(i => i.id === log.ingredientId);
      const cat = ing ? ing.category : 'Lainnya';
      const unit = ing ? ing.unit : '';
      
      if (!usageMap[log.ingredientId]) {
        usageMap[log.ingredientId] = {
          id: log.ingredientId,
          name: log.ingredientName,
          category: cat,
          unit: unit,
          count: 0,
          totalVolume: 0
        };
      }
      usageMap[log.ingredientId].count += 1;
      usageMap[log.ingredientId].totalVolume += Math.abs(log.quantity);
    });

    // Sort by count of transactions (frequency) descending, then totalVolume descending
    return Object.values(usageMap)
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return b.totalVolume - a.totalVolume;
      })
      .slice(0, 5); // top 5 most frequently used
  }, [logs, ingredients]);

  const maxUsageCount = useMemo(() => {
    if (frequentlyUsedBrands.length === 0) return 1;
    return Math.max(...frequentlyUsedBrands.map(b => b.count));
  }, [frequentlyUsedBrands]);

  // 2. Prepare Recharts Bar Chart Data: Stock level by Category
  const categoryDataMap: Record<string, { totalStock: number; outOfStockCount: number; itemsCount: number }> = {
    'Sembako': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
    'Sayur & Buah': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
    'Daging & Ikan': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
    'Bumbu & Rempah': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
    'Bahan Kering': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
    'Susu & Olahan': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
    'Lainnya': { totalStock: 0, outOfStockCount: 0, itemsCount: 0 },
  };

  ingredients.forEach(item => {
    const cat = item.category || 'Lainnya';
    if (categoryDataMap[cat]) {
      categoryDataMap[cat].totalStock += item.currentStock;
      categoryDataMap[cat].itemsCount += 1;
      if (item.currentStock <= 0) {
        categoryDataMap[cat].outOfStockCount += 1;
      }
    }
  });

  const categoryChartData = Object.entries(categoryDataMap).map(([name, data]) => ({
    name,
    'Jumlah Item': data.itemsCount,
    'Stok Habis': data.outOfStockCount,
  }));

  // 3. Prepare Pie Chart: Category Distribution
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'];
  const categoryPieData = Object.entries(categoryDataMap)
    .map(([name, data]) => ({
      name,
      value: data.itemsCount,
    }))
    .filter(d => d.value > 0);

  // Fallback for empty state pie chart
  const emptyPieData = [{ name: 'Belum Ada Data', value: 1 }];

  // 5. Recent Logs (Top 5)
  const recentLogs = [...logs]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 font-sans">
      {/* Header and Welcome */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" /> Analitik Inventaris Dapur
          </h2>
          <p className="text-xs text-slate-500 mt-1">Pemantauan real-time mutasi keluar masuk bahan, sisa stok gudang, dan sinkronisasi harian dapur SPPG.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold">
          <FlameKindling className="w-3.5 h-3.5 animate-pulse text-emerald-500" /> Dapur SPPG Terkendali
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Items */}
        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => onNavigateToInventory('all')}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm cursor-pointer flex flex-col justify-between h-36 transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">Bahan</span>
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-900">{totalItems}</span>
            <span className="text-xs text-slate-500 block mt-0.5 font-medium">Bahan Terdaftar</span>
          </div>
        </motion.div>

        {/* Low Stock count (Replaced with Out of Stock / Stok Habis) */}
        <motion.div
          whileHover={{ y: -2 }}
          onClick={() => onNavigateToInventory('all')}
          className={`p-5 rounded-2xl shadow-sm cursor-pointer flex flex-col justify-between h-36 border transition-all ${
            outOfStockItems.length > 0 ? 'bg-indigo-50/40 border-indigo-100' : 'bg-white border-slate-100'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className={`p-2.5 rounded-xl ${outOfStockItems.length > 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-500'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded uppercase tracking-wider">Perhatian</span>
          </div>
          <div>
            <span className={`text-2xl font-extrabold ${outOfStockItems.length > 0 ? 'text-indigo-600' : 'text-slate-900'}`}>
              {outOfStockItems.length}
            </span>
            <span className="text-xs text-slate-500 block mt-0.5 font-medium">Bahan Habis (Stok 0)</span>
            <div className="flex items-center gap-1 mt-1 text-[11px] font-extrabold text-rose-500">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{avgOutgoingPerDay.toFixed(1)} unit keluar / hari</span>
            </div>
          </div>
        </motion.div>

        {/* Total Transactions */}
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-36"
        >
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl">
              <Clipboard className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">Mutasi</span>
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-900">{totalTransactions}</span>
            <span className="text-xs text-slate-500 block mt-0.5 font-medium">Total Log Aktivitas</span>
          </div>
        </motion.div>

        {/* Transactions Today */}
        <motion.div
          whileHover={{ y: -2 }}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-36"
        >
          <div className="flex justify-between items-start">
            <div className="p-2.5 bg-slate-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-100 px-2 py-0.5 rounded uppercase tracking-wider">Terbaru</span>
          </div>
          <div>
            <span className="text-2xl font-extrabold text-emerald-600">+{transactionsToday}</span>
            <span className="text-xs text-slate-500 block mt-0.5 font-medium">Mutasi 24 Jam Terakhir</span>
          </div>
        </motion.div>
      </div>

      {/* Critical Stock list & Category Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Most Frequently Used Brands/Ingredients instead of critical out of stock list */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-1 lg:col-span-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500/10" /> Merk Barang / Bahan Sering Terpakai
            </h3>
            <p className="text-xs text-slate-400 mb-4">Daftar merk barang dan bahan makanan yang paling sering keluar/digunakan untuk keperluan dapur SPPG.</p>
            
            {frequentlyUsedBrands.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center gap-2">
                <Info className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-semibold">Belum Ada Data Riwayat Keluar!</p>
                <p className="text-xs text-slate-400">Gunakan menu pencatatan "Stock Keluar" terlebih dahulu agar daftar ini terisi otomatis.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {frequentlyUsedBrands.map((item) => {
                  const percent = Math.min(100, Math.round((item.count / maxUsageCount) * 100));
                  return (
                    <div key={item.id} className="space-y-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <div>
                          <p className="font-extrabold text-slate-800">{item.name}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase">
                              {item.category}
                            </span>
                            <span>ID: {item.id}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-900">{item.count} Kali Terpakai</span>
                          <span className="text-xs text-rose-500 block font-semibold mt-0.5">
                            Total: -{item.totalVolume} {item.unit}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {frequentlyUsedBrands.length > 0 && (
            <button
              onClick={() => onNavigateToInventory('all')}
              className="mt-4 w-full py-2 bg-slate-50 hover:bg-slate-100 text-indigo-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors border border-slate-100 cursor-pointer"
            >
              Lihat Seluruh Bahan Makanan <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Pie Chart: Category Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Proporsi Kategori</h3>
            <p className="text-xs text-slate-400 mb-6">Persentase sebaran jenis bahan makanan berdasarkan kategori.</p>
            
            <div className="w-full h-44 flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData.length > 0 ? categoryPieData : emptyPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(categoryPieData.length > 0 ? categoryPieData : emptyPieData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={categoryPieData.length > 0 ? COLORS[index % COLORS.length] : '#cbd5e1'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} Bahan`, 'Jumlah']} />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Kategori</span>
                <span className="text-xl font-black text-slate-800">
                  {categoryPieData.length} Jenis
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs max-h-36 overflow-y-auto pr-1">
            {categoryPieData.map((d, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="font-semibold">{d.name}</span>
                </div>
                <span className="font-extrabold text-slate-700">{d.value} item</span>
              </div>
            ))}
            {ingredients.length === 0 && (
              <div className="flex items-center gap-1.5 text-slate-400 justify-center">
                <span className="w-2 h-2 rounded-full bg-slate-300" />
                <span>Belum Ada Data Bahan</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Category Level & Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recharts Bar Chart: Stocks Level by Category */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm col-span-1 lg:col-span-2">
          <h3 className="text-base font-bold text-slate-900 mb-1">Sebaran Jenis Bahan per Kategori</h3>
          <p className="text-xs text-slate-400 mb-6">Distribusi jumlah jenis bahan makanan dan sebaran bahan habis (stok kosong) per kategori.</p>
          
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                <Bar dataKey="Jumlah Item" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="Stok Habis" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transaction Log Board */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Aktivitas Gudang Terbaru</h3>
            <p className="text-xs text-slate-400 mb-4">Mutasi dan aktivitas pencatatan stok terakhir dari dapur.</p>
            
            {recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center gap-1">
                <TrendingUp className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-semibold">Belum Ada Aktivitas</p>
                <p className="text-xs text-slate-400 max-w-[180px]">Pembaruan stok masuk/keluar akan terdaftar di sini.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentLogs.map((log) => {
                  const isMasuk = log.type === 'MASUK';
                  const isKeluar = log.type === 'KELUAR';
                  return (
                    <div key={log.id} className="flex gap-3 text-xs items-start">
                      <div className={`mt-0.5 px-2 py-0.5 rounded font-black shrink-0 ${
                        isMasuk
                          ? 'bg-emerald-50 text-emerald-600'
                          : isKeluar
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {log.type === 'OPNAME_ADJUST' ? 'OPN' : log.type}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-800 truncate">{log.ingredientName}</p>
                        <p className="text-slate-500 mt-0.5 font-bold">
                          {log.quantity > 0 ? `+${log.quantity}` : log.quantity} ({log.user || 'Sistem'})
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {log.notes || 'Tanpa keterangan'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {recentLogs.length > 0 && (
            <div className="pt-4 border-t border-slate-100 text-center text-[10px] text-slate-400 font-bold">
              Sistem tersinkronisasi otomatis ke Google Sheets.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
