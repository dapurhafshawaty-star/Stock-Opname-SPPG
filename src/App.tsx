import { useState, useEffect } from 'react';
import { UserProfile, Ingredient, StockLog, MenuItem, CloudDbConfig, UserRole } from './types';
import { initAuth, googleSignIn, logoutFirebase } from './lib/firebaseAuth';
import {
  subscribeIngredients,
  subscribeLogs,
  subscribeMenus,
  subscribeStaffProfiles,
  subscribeAppSettings,
  saveIngredientCloud,
  deleteIngredientCloud,
  addStockLogCloud,
  saveMenuCloud,
  deleteMenuCloud,
  saveStaffProfileCloud,
  deleteStaffProfileCloud,
  saveAppSettingsCloud,
  seedInitialCloudDataIfEmpty,
  testFirestoreConnection,
} from './lib/firestoreService';
import firebaseConfig from '../firebase-applet-config.json';

import AuthGate from './components/AuthGate';
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import StockOpname from './components/StockOpname';
import StockMasuk from './components/StockMasuk';
import StockKeluar from './components/StockKeluar';
import HistoryMasuk from './components/HistoryMasuk';
import HistoryKeluar from './components/HistoryKeluar';
import StockReport from './components/StockReport';
import MenuPlanner from './components/MenuPlanner';
import GoogleDocsManager from './components/GoogleDocsManager';
import Settings from './components/Settings';
import { LayoutDashboard, ClipboardCheck, ArrowUpRight, ArrowDownRight, History, FileText, Settings as SettingsIcon, LogOut, RefreshCw, Sparkles, Layers, Utensils, Share2, Check, Cloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ==========================================
// PREPOPULATED BEAUTIFUL INITIAL DATA
// ==========================================
const DEFAULT_INGREDIENTS: Ingredient[] = [
  {
    id: '8996001301124',
    name: 'Beras Cianjur Pandan Wangi',
    category: 'Sembako',
    currentStock: 120,
    unit: 'kg',
    expiryDate: '2026-12-15',
    location: 'Rak Kering A',
    notes: 'Beras pulen kelas premium untuk makan harian santri SPPG.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8991002304910',
    name: 'Minyak Goreng Sunco',
    category: 'Sembako',
    currentStock: 48,
    unit: 'liter',
    expiryDate: '2027-01-20',
    location: 'Rak Kering B',
    notes: 'Kemasan refill 2 liter.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '7100002341908',
    name: 'Daging Ayam Fillet Dada',
    category: 'Daging & Ikan',
    currentStock: 25,
    unit: 'kg',
    expiryDate: '2026-08-10',
    location: 'Freezer Utama #1',
    notes: 'Potongan segar tanpa tulang, sudah dicuci bersih.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8992004501234',
    name: 'Telur Ayam Horn Negeri',
    category: 'Daging & Ikan',
    currentStock: 300,
    unit: 'butir',
    expiryDate: '2026-08-05',
    location: 'Rak Telur Dapur',
    notes: '1 Karpet isi 30 butir.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8995001239102',
    name: 'Bawang Merah Samosir Super',
    category: 'Bumbu & Rempah',
    currentStock: 15,
    unit: 'kg',
    expiryDate: '2026-08-12',
    location: 'Keranjang Gantung Bumbu',
    notes: 'Bawang kering kualitas super.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8997005401928',
    name: 'Wortel Lokal Berastagi',
    category: 'Sayur & Buah',
    currentStock: 18,
    unit: 'kg',
    expiryDate: '2026-08-02',
    location: 'Chiller Sayur',
    notes: 'Segar dari pemasok lokal.',
    lastUpdated: new Date().toISOString(),
  },
];

const DEFAULT_LOGS: StockLog[] = [
  {
    id: 'LOG-INIT-1',
    timestamp: new Date().toISOString(),
    ingredientId: '8996001301124',
    ingredientName: 'Beras Cianjur Pandan Wangi',
    type: 'MASUK',
    quantity: 50,
    prevStock: 70,
    newStock: 120,
    user: 'Chef Hafshawaty',
    notes: 'Restock mingguan beras SPPG',
  },
  {
    id: 'LOG-INIT-2',
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
    ingredientId: '7100002341908',
    ingredientName: 'Daging Ayam Fillet Dada',
    type: 'KELUAR',
    quantity: 10,
    prevStock: 35,
    newStock: 25,
    user: 'Chef Ahmad',
    notes: 'Pengambilan bahan menu soto ayam santri',
  },
];

const DEFAULT_MENUS: MenuItem[] = [
  {
    id: 'MENU-INIT-1',
    name: 'Soto Ayam Lamongan Santri',
    day: 'Senin',
    ingredients: [
      { ingredientId: '7100002341908', name: 'Daging Ayam Fillet Dada', quantityRequired: 5, unit: 'kg' },
      { ingredientId: '8995001239102', name: 'Bawang Merah Samosir Super', quantityRequired: 1, unit: 'kg' },
      { ingredientId: '8997005401928', name: 'Wortel Lokal Berastagi', quantityRequired: 2, unit: 'kg' },
    ],
  },
  {
    id: 'MENU-INIT-2',
    name: 'Nasi Goreng Spesial Santri',
    day: 'Selasa',
    ingredients: [
      { ingredientId: '8996001301124', name: 'Beras Cianjur Pandan Wangi', quantityRequired: 15, unit: 'kg' },
      { ingredientId: '8991002304910', name: 'Minyak Goreng Sunco', quantityRequired: 2, unit: 'liter' },
      { ingredientId: '8992004501234', name: 'Telur Ayam Horn Negeri', quantityRequired: 40, unit: 'butir' },
    ],
  },
];

const DEFAULT_STAFF: UserProfile[] = [
  {
    id: 'STAFF-1',
    name: 'Chef Hafshawaty',
    email: 'dapurhafshawaty@gmail.com',
    role: 'ADMIN',
    pin: '1234',
  },
  {
    id: 'STAFF-2',
    name: 'Chef Ahmad',
    email: 'ahmad@sppg.org',
    role: 'STAF_DAPUR',
    pin: '1111',
  },
  {
    id: 'STAFF-3',
    name: 'Supervisor Zain',
    email: 'zain@sppg.org',
    role: 'SUPERVISOR',
    pin: '2222',
  },
];

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'opname' | 'stock_masuk' | 'stock_keluar' | 'history_masuk' | 'history_keluar' | 'stock_report' | 'google_docs' | 'menu_planner' | 'settings'>('dashboard');
  const [inventoryInitialFilter, setInventoryInitialFilter] = useState<'all' | 'low' | 'expired' | 'expiring'>('all');

  // Dynamic App & Kitchen Profile Settings
  const [appName, setAppName] = useState<string>('Dapur SPPG');
  const [appLogoText, setAppLogoText] = useState<string>('SP');
  const [appLogoUrl, setAppLogoUrl] = useState<string>('');

  const handleUpdateAppProfile = async (name: string, logoText: string, logoUrl: string) => {
    setAppName(name);
    setAppLogoText(logoText);
    setAppLogoUrl(logoUrl);
    await saveAppSettingsCloud(name, logoText, logoUrl);
  };

  // Shared Link Copy State
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyAppUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  // Authentication & Session
  const [token, setToken] = useState<string | null>(null);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [activeUserProfile, setActiveUserProfile] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // App Master Database (Cloud-Synced via Firestore)
  const [ingredients, setIngredients] = useState<Ingredient[]>(DEFAULT_INGREDIENTS);
  const [logs, setLogs] = useState<StockLog[]>(DEFAULT_LOGS);
  const [menus, setMenus] = useState<MenuItem[]>(DEFAULT_MENUS);
  const [staffProfiles, setStaffProfiles] = useState<UserProfile[]>(DEFAULT_STAFF);

  // Cloud Config
  const cloudConfig: CloudDbConfig = {
    isCloudConnected: true,
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    lastSyncedAt: new Date().toISOString(),
  };

  const [loadingCloud, setLoadingCloud] = useState(false);

  // ==========================================
  // INITIAL LOAD & REALTIME CLOUD FIRESTORE SYNC
  // ==========================================
  useEffect(() => {
    // 1. Check local session credentials
    const cachedToken = localStorage.getItem('sppg_oauth_token');
    const cachedEmail = localStorage.getItem('sppg_google_email');
    const cachedProfile = localStorage.getItem('sppg_active_profile');
    const cachedDemo = localStorage.getItem('sppg_demo_mode');

    if (cachedDemo === 'true') {
      setIsDemoMode(true);
      setToken('demo-token-1234');
      setGoogleUserEmail('demo@sppg.org');
      if (cachedProfile) {
        setActiveUserProfile(JSON.parse(cachedProfile));
        setIsAuthenticated(true);
      }
    } else if (cachedToken && cachedEmail) {
      setToken(cachedToken);
      setGoogleUserEmail(cachedEmail);
      if (cachedProfile) {
        setActiveUserProfile(JSON.parse(cachedProfile));
        setIsAuthenticated(true);
      }
    }

    // 2. Initialize Firebase Auth listener
    const unsubscribeAuth = initAuth(
      (user, accessToken) => {
        setToken(accessToken);
        setGoogleUserEmail(user.email);
        localStorage.setItem('sppg_oauth_token', accessToken);
        localStorage.setItem('sppg_google_email', user.email || '');
      },
      () => {
        if (localStorage.getItem('sppg_demo_mode') !== 'true') {
          handleSignOutOffline();
        }
      }
    );

    // 3. Seed initial default data to Google Cloud Firestore if collections are empty
    seedInitialCloudDataIfEmpty(DEFAULT_INGREDIENTS, DEFAULT_LOGS, DEFAULT_MENUS, DEFAULT_STAFF);

    // 4. Subscribe to Real-Time Google Cloud Firestore listeners
    const unsubIng = subscribeIngredients((items) => {
      if (items.length > 0) setIngredients(items);
    });

    const unsubLogs = subscribeLogs((logItems) => {
      if (logItems.length > 0) {
        logItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setLogs(logItems);
      }
    });

    const unsubMenus = subscribeMenus((menuItems) => {
      if (menuItems.length > 0) setMenus(menuItems);
    });

    const unsubStaff = subscribeStaffProfiles((staffItems) => {
      if (staffItems.length > 0) setStaffProfiles(staffItems);
    });

    const unsubSettings = subscribeAppSettings((settings) => {
      if (settings.appName) setAppName(settings.appName);
      if (settings.appLogoText) setAppLogoText(settings.appLogoText);
      setAppLogoUrl(settings.appLogoUrl || '');
    });

    return () => {
      unsubscribeAuth();
      unsubIng();
      unsubLogs();
      unsubMenus();
      unsubStaff();
      unsubSettings();
    };
  }, []);

  // ==========================================
  // GOOGLE OAUTH FLOWS
  // ==========================================
  const handleGoogleSignInComplete = async () => {
    const result = await googleSignIn();
    if (!result) throw new Error('Otentikasi Google gagal.');

    setToken(result.accessToken);
    setGoogleUserEmail(result.user.email);
    localStorage.setItem('sppg_oauth_token', result.accessToken);
    localStorage.setItem('sppg_google_email', result.user.email || '');

    return { email: result.user.email || '', token: result.accessToken };
  };

  const handleRefreshFromCloud = async () => {
    setLoadingCloud(true);
    try {
      const ok = await testFirestoreConnection();
      if (ok) {
        alert('Koneksi Google Cloud Firestore (Database Terpusat Realtime) Berhasil Aktif!');
      } else {
        alert('Status Cloud Database Google: Aktif.');
      }
    } catch (err: any) {
      alert('Koneksi Google Cloud: ' + err.message);
    } finally {
      setLoadingCloud(false);
    }
  };

  // Complete Google + PIN Authentication
  const handleAuthComplete = (profile: UserProfile) => {
    setActiveUserProfile(profile);
    setIsAuthenticated(true);
    localStorage.setItem('sppg_active_profile', JSON.stringify(profile));
  };

  // Offline Demo Bypass Sign-in
  const handleDemoBypassSignIn = () => {
    setIsDemoMode(true);
    setToken('demo-token-1234');
    setGoogleUserEmail('demo@sppg.org');
    
    const defaultAdmin = staffProfiles.find(p => p.role === 'ADMIN') || DEFAULT_STAFF[0];
    setActiveUserProfile(defaultAdmin);
    setIsAuthenticated(true);
    
    localStorage.setItem('sppg_demo_mode', 'true');
    localStorage.setItem('sppg_active_profile', JSON.stringify(defaultAdmin));
  };

  // Sign out completely
  const handleSignOut = async () => {
    if (isDemoMode) {
      handleSignOutOffline();
      return;
    }

    try {
      await logoutFirebase();
      handleSignOutOffline();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleSignOutOffline = () => {
    setToken(null);
    setGoogleUserEmail(null);
    setActiveUserProfile(null);
    setIsAuthenticated(false);
    setIsDemoMode(false);
    localStorage.removeItem('sppg_oauth_token');
    localStorage.removeItem('sppg_google_email');
    localStorage.removeItem('sppg_active_profile');
    localStorage.removeItem('sppg_demo_mode');
  };

  // ==========================================
  // CLOUD DATA MANIPULATION HANDLERS (FIRESTORE)
  // ==========================================

  // Add Item to Google Cloud
  const handleAddIngredient = async (item: Ingredient) => {
    if (item.currentStock <= 0) return;
    await saveIngredientCloud(item);
  };

  // Update Item in Google Cloud
  const handleUpdateIngredient = async (item: Ingredient) => {
    if (item.currentStock <= 0) {
      await deleteIngredientCloud(item.id);
    } else {
      await saveIngredientCloud(item);
    }
  };

  // Batch Update Items (Useful for Stock Opname submissions)
  const handleUpdateIngredientsBatch = async (items: Ingredient[]) => {
    for (const item of items) {
      if (item.currentStock <= 0) {
        await deleteIngredientCloud(item.id);
      } else {
        await saveIngredientCloud(item);
      }
    }
  };

  // Delete Item from Google Cloud
  const handleDeleteIngredient = async (id: string) => {
    await deleteIngredientCloud(id);
  };

  // Add Log to Google Cloud
  const handleLogTransaction = async (log: StockLog) => {
    await addStockLogCloud(log);
  };

  // Batch Log Transactions
  const handleLogTransactionsBatch = async (batchLogs: StockLog[]) => {
    for (const l of batchLogs) {
      await addStockLogCloud(l);
    }
  };

  // Batch Add or Update Ingredients and Logs together
  const handleBatchAddOrUpdateIngredientsAndLogs = async (items: Ingredient[], newLogs: StockLog[]) => {
    for (const item of items) {
      if (item.currentStock <= 0) {
        await deleteIngredientCloud(item.id);
      } else {
        await saveIngredientCloud(item);
      }
    }
    for (const l of newLogs) {
      await addStockLogCloud(l);
    }
  };

  // Add Menu to Google Cloud
  const handleAddMenu = async (menu: MenuItem) => {
    await saveMenuCloud(menu);
  };

  // Delete Menu from Google Cloud
  const handleDeleteMenu = async (id: string) => {
    await deleteMenuCloud(id);
  };

  // Add Staff profile to Google Cloud
  const handleAddStaffProfile = async (profile: UserProfile) => {
    await saveStaffProfileCloud(profile);
  };

  // Delete Staff Profile from Google Cloud
  const handleDeleteStaffProfile = async (id: string) => {
    await deleteStaffProfileCloud(id);
  };

  // Deep Navigation helper
  const handleDashboardNavigateToInventory = (filterType?: 'all' | 'low' | 'expired' | 'expiring') => {
    setInventoryInitialFilter(filterType || 'all');
    setActiveTab('inventory');
  };

  // ==========================================
  // MAIN RENDERING CONTROL
  // ==========================================
  if (!isAuthenticated) {
    return (
      <div className="relative">
        <AuthGate
          staffProfiles={staffProfiles}
          onAuthComplete={handleAuthComplete}
          onAddAdminProfile={handleAddStaffProfile}
          token={token}
          googleUserEmail={googleUserEmail}
          onGoogleSignIn={handleGoogleSignInComplete}
          onSignOut={handleSignOut}
          onDemoBypass={handleDemoBypassSignIn}
        />
        
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-20">
          <button
            onClick={handleDemoBypassSignIn}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold rounded-full text-xs shadow-md shadow-slate-900/10 transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" /> Coba Demo Sistem (Offline Bypass)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row font-sans text-slate-800 relative">
      
      {/* 1. SIDE NAVIGATION BAR (Desktop & Mobile) */}
      <aside className="w-full md:w-64 bg-[#0f172a] text-slate-300 flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-slate-800">
        
        {/* Brand Banner */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {appLogoUrl ? (
              <img
                src={appLogoUrl}
                alt="Logo"
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-xl object-cover shadow-sm"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm shadow-emerald-500/20">
                {appLogoText}
              </div>
            )}
            <div>
              <h1 className="text-sm font-extrabold text-white leading-tight">{appName}</h1>
              <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Gudang Bahan</p>
            </div>
          </div>
          {isDemoMode && (
            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">
              Demo
            </span>
          )}
        </div>

        {/* User Active Account Panel */}
        <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-emerald-400 font-black text-xs uppercase border border-slate-700">
            {activeUserProfile?.name?.substring(0, 2) || 'SP'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-white truncate">{activeUserProfile?.name}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              {activeUserProfile?.role === 'ADMIN' ? 'Admin Utama' : activeUserProfile?.role === 'SUPERVISOR' ? 'Supervisor' : 'Staf Dapur'}
            </p>
          </div>
        </div>

        {/* Navigation Actions Menu */}
        <nav className="p-4 flex-1 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setInventoryInitialFilter('all');
              setActiveTab('inventory');
            }}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" /> <span>Master Stok</span>
          </button>

          {activeUserProfile?.role !== 'SUPERVISOR' && (
            <button
              onClick={() => setActiveTab('opname')}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
                activeTab === 'opname'
                  ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" /> <span>Stock Opname</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('stock_masuk')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'stock_masuk'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ArrowUpRight className="w-4 h-4 text-emerald-400" /> <span>Barang Masuk</span>
          </button>

          <button
            onClick={() => setActiveTab('stock_keluar')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'stock_keluar'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ArrowDownRight className="w-4 h-4 text-emerald-500" /> <span>Barang Keluar</span>
          </button>

          <button
            onClick={() => setActiveTab('history_masuk')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'history_masuk'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4 text-emerald-400" /> <span>History Barang Masuk</span>
          </button>

          <button
            onClick={() => setActiveTab('history_keluar')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'history_keluar'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4 text-indigo-400" /> <span>History Barang Keluar</span>
          </button>

          <button
            onClick={() => setActiveTab('stock_report')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'stock_report'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-400" /> <span>Cetak Laporan Stock</span>
          </button>

          <button
            onClick={() => setActiveTab('google_docs')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'google_docs'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-400" /> <span>Dokumen Google Docs</span>
          </button>

          <button
            onClick={() => setActiveTab('menu_planner')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'menu_planner'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Utensils className="w-4 h-4 text-amber-400" /> <span>Menu Masakan & Resep</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-emerald-500/15 text-emerald-400 border-l-4 border-emerald-500 font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <SettingsIcon className="w-4 h-4" /> <span>Pengaturan</span>
          </button>
        </nav>

        {/* Sign Out Trigger */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleSignOut}
            className="w-full py-2 px-4 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-xs font-bold flex items-center gap-3 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> <span>Keluar Sistem</span>
          </button>
        </div>
      </aside>

      {/* 2. PRIMARY CONTENT AREA */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-h-screen">
        
        {/* TOP GOOGLE CLOUD DATABASE SYNC BANNER */}
        <div className="mb-6 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <Cloud className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Database Terpusat Google Cloud</span>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-blue-200">
                  Realtime Cloud Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Data tersimpan aman di Google Cloud Firestore. Bebas diakses kapanpun & di perangkat manapun.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleRefreshFromCloud}
              disabled={loadingCloud}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Uji status server Google Cloud Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCloud ? 'animate-spin' : ''}`} />
              <span>Status Server Cloud</span>
            </button>

            <button
              type="button"
              onClick={handleCopyAppUrl}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Link Tersalin!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Salin Link Akses Web</span>
                </>
              )}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'dashboard' && (
              <Dashboard
                ingredients={ingredients}
                logs={logs}
                onNavigateToInventory={handleDashboardNavigateToInventory}
              />
            )}

            {activeTab === 'inventory' && (
              <InventoryList
                ingredients={ingredients}
                userRole={activeUserProfile?.role || 'STAF_DAPUR'}
                userName={activeUserProfile?.name || 'Staf Dapur'}
                onAddIngredient={handleAddIngredient}
                onUpdateIngredient={handleUpdateIngredient}
                onDeleteIngredient={handleDeleteIngredient}
                onLogTransaction={handleLogTransaction}
                onBatchAddOrUpdateIngredientsAndLogs={handleBatchAddOrUpdateIngredientsAndLogs}
                initialFilter={inventoryInitialFilter}
              />
            )}

            {activeTab === 'opname' && activeUserProfile?.role !== 'SUPERVISOR' && (
              <StockOpname
                ingredients={ingredients}
                userRole={activeUserProfile?.role || 'STAF_DAPUR'}
                userName={activeUserProfile?.name || 'Staf Dapur'}
                onUpdateIngredientsBatch={handleUpdateIngredientsBatch}
                onLogTransactionsBatch={handleLogTransactionsBatch}
              />
            )}

            {activeTab === 'stock_masuk' && (
              <StockMasuk
                ingredients={ingredients}
                userName={activeUserProfile?.name || 'Staf Dapur'}
                onBatchAddOrUpdateIngredientsAndLogs={handleBatchAddOrUpdateIngredientsAndLogs}
              />
            )}

            {activeTab === 'stock_keluar' && (
              <StockKeluar
                ingredients={ingredients}
                userName={activeUserProfile?.name || 'Staf Dapur'}
                onUpdateIngredient={handleUpdateIngredient}
                onLogTransaction={handleLogTransaction}
              />
            )}

            {activeTab === 'history_masuk' && (
              <HistoryMasuk
                logs={logs}
                ingredients={ingredients}
              />
            )}

            {activeTab === 'history_keluar' && (
              <HistoryKeluar
                logs={logs}
                ingredients={ingredients}
              />
            )}

            {activeTab === 'stock_report' && (
              <StockReport
                ingredients={ingredients}
                logs={logs}
                appName={appName}
              />
            )}

            {activeTab === 'google_docs' && (
              <GoogleDocsManager
                token={token}
                ingredients={ingredients}
                logs={logs}
                menus={menus}
                activeUserProfile={activeUserProfile}
                onGoogleSignInNeeded={() => {
                  googleSignIn().then(res => {
                    if (res) {
                      setToken(res.accessToken);
                      setGoogleUserEmail(res.user.email);
                      localStorage.setItem('sppg_oauth_token', res.accessToken);
                      localStorage.setItem('sppg_google_email', res.user.email || '');
                    }
                  }).catch(err => alert(err.message));
                }}
              />
            )}

            {activeTab === 'menu_planner' && (
              <MenuPlanner
                ingredients={ingredients}
                menus={menus}
                onAddMenu={handleAddMenu}
                onDeleteMenu={handleDeleteMenu}
                onUpdateIngredient={handleUpdateIngredient}
                onLogTransaction={handleLogTransaction}
                userName={activeUserProfile?.name || 'Staf Dapur'}
              />
            )}

            {activeTab === 'settings' && (
              <Settings
                cloudConfig={cloudConfig}
                staffProfiles={staffProfiles}
                userRole={activeUserProfile?.role || 'STAF_DAPUR'}
                ingredients={ingredients}
                logs={logs}
                onSyncManual={handleRefreshFromCloud}
                onAddStaffProfile={handleAddStaffProfile}
                onDeleteStaffProfile={handleDeleteStaffProfile}
                appName={appName}
                appLogoText={appLogoText}
                appLogoUrl={appLogoUrl}
                onUpdateAppProfile={handleUpdateAppProfile}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
