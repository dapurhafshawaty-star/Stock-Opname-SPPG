import { useState, useEffect } from 'react';
import { UserProfile, Ingredient, StockLog, MenuItem, SheetConfig, UserRole } from './types';
import { initAuth, googleSignIn, logoutFirebase } from './lib/firebaseAuth';
import { createOpnameSpreadsheet, fetchSpreadsheetData, syncAllDataToSheets } from './lib/googleSheets';
import AuthGate from './components/AuthGate';
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import StockOpname from './components/StockOpname';
import StockKeluar from './components/StockKeluar';
import HistoryKeluar from './components/HistoryKeluar';
import Settings from './components/Settings';
import { LayoutDashboard, ClipboardCheck, ArrowDownRight, History, Settings as SettingsIcon, LogOut, RefreshCw, Sparkles, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ==========================================
// PREPOPULATED BEAUTIFUL DEMO DATA (Offline Fallback)
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
    expiryDate: '2027-02-10',
    location: 'Rak Kering B',
    notes: 'Stok bulanan untuk menggoreng lauk pauk.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '7100002341908',
    name: 'Daging Ayam Fillet Dada',
    category: 'Daging & Ikan',
    currentStock: 25,
    unit: 'kg',
    expiryDate: '2026-07-26', // near expiration
    location: 'Freezer Daging',
    notes: 'Suplai segar mingguan, simpan dalam suhu beku di freezer utama.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8993001201903',
    name: 'Susu UHT Frisian Flag Full Cream',
    category: 'Susu & Olahan',
    currentStock: 4,
    expiryDate: '2026-07-15', // expired
    unit: 'pack',
    location: 'Kulkas Utama',
    notes: 'Dipakai untuk puding makanan penutup hari Jumat.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8995001239102',
    name: 'Bawang Merah Samosir Super',
    category: 'Bumbu & Rempah',
    currentStock: 6,
    unit: 'kg',
    expiryDate: '2026-08-05',
    location: 'Bumbu Station',
    notes: 'Bumbu dasar dapur harian SPPG.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8992004501234',
    name: 'Telur Ayam Horn Negeri',
    category: 'Sembako',
    currentStock: 150,
    unit: 'butir',
    expiryDate: '2026-07-29',
    location: 'Rak Kering A',
    notes: 'Lauk protein utama alternatif harian dapur SPPG.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8997005401928',
    name: 'Wortel Lokal Berastagi',
    category: 'Sayur & Buah',
    currentStock: 12,
    unit: 'kg',
    expiryDate: '2026-07-24', // near expiration
    location: 'Kulkas Sayur',
    notes: 'Suplai sayur sop segar.',
    lastUpdated: new Date().toISOString(),
  },
  {
    id: '8991223405102',
    name: 'Cabe Rawit Merah Setan',
    category: 'Bumbu & Rempah',
    currentStock: 2,
    unit: 'kg',
    expiryDate: '2026-07-23', // near expiration
    location: 'Kulkas Sayur',
    notes: 'Sangat pedas, bumbu sambal harian dapur.',
    lastUpdated: new Date().toISOString(),
  },
];

const DEFAULT_LOGS: StockLog[] = [
  {
    id: 'LOG-INIT-1',
    timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    ingredientId: '8996001301124',
    ingredientName: 'Beras Cianjur Pandan Wangi',
    type: 'MASUK',
    quantity: 100,
    prevStock: 20,
    newStock: 120,
    user: 'Chef Hafshawaty',
    notes: 'Suplai beras bulanan SPPG masuk gudang',
  },
  {
    id: 'LOG-INIT-2',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    ingredientId: '7100002341908',
    ingredientName: 'Daging Ayam Fillet Dada',
    type: 'KELUAR',
    quantity: -5,
    prevStock: 30,
    newStock: 25,
    user: 'Staf Ahmad',
    notes: 'Dipakai untuk memasak menu Soto Ayam Lamongan',
  },
  {
    id: 'LOG-INIT-3',
    timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    ingredientId: '8995001239102',
    ingredientName: 'Bawang Merah Samosir Super',
    type: 'OPNAME_ADJUST',
    quantity: -2,
    prevStock: 8,
    newStock: 6,
    user: 'Supervisor Zain',
    notes: 'Audit Stock Opname rutin: Penyusutan karena kadar air kering',
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
  {
    id: 'MENU-INIT-3',
    name: 'Sayur Sop Ayam Maknyus',
    day: 'Rabu',
    ingredients: [
      { ingredientId: '7100002341908', name: 'Daging Ayam Fillet Dada', quantityRequired: 3, unit: 'kg' },
      { ingredientId: '8997005401928', name: 'Wortel Lokal Berastagi', quantityRequired: 4, unit: 'kg' },
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'opname' | 'stock_keluar' | 'history_keluar' | 'settings'>('dashboard');
  const [inventoryInitialFilter, setInventoryInitialFilter] = useState<'all' | 'low' | 'expired' | 'expiring'>('all');

  // Dynamic App & Kitchen Profile Settings
  const [appName, setAppName] = useState<string>(() => {
    return localStorage.getItem('sppg_app_name') || 'Dapur SPPG';
  });
  const [appLogoText, setAppLogoText] = useState<string>(() => {
    return localStorage.getItem('sppg_app_logo_text') || 'SP';
  });
  const [appLogoUrl, setAppLogoUrl] = useState<string>(() => {
    return localStorage.getItem('sppg_app_logo_url') || '';
  });

  const handleUpdateAppProfile = (name: string, logoText: string, logoUrl: string) => {
    setAppName(name);
    setAppLogoText(logoText);
    setAppLogoUrl(logoUrl);
    localStorage.setItem('sppg_app_name', name);
    localStorage.setItem('sppg_app_logo_text', logoText);
    localStorage.setItem('sppg_app_logo_url', logoUrl);
  };

  // Authentication & Session
  const [token, setToken] = useState<string | null>(null);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [activeUserProfile, setActiveUserProfile] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // App Master Database
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<UserProfile[]>([]);

  // Cloud Config
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    spreadsheetId: null,
    spreadsheetUrl: null,
    isSynced: false,
    lastSyncedAt: null,
  });

  const [loadingCloud, setLoadingCloud] = useState(false);

  // ==========================================
  // INITIAL LOAD & LOCAL STORAGE SYNC
  // ==========================================
  useEffect(() => {
    // 1. Check local storage for pre-existing credentials
    const cachedToken = localStorage.getItem('sppg_oauth_token');
    const cachedEmail = localStorage.getItem('sppg_google_email');
    const cachedProfile = localStorage.getItem('sppg_active_profile');
    const cachedDemo = localStorage.getItem('sppg_demo_mode');

    // 2. Load cached master databases
    const storedIngredients = localStorage.getItem('sppg_ingredients');
    const storedLogs = localStorage.getItem('sppg_logs');
    const storedMenus = localStorage.getItem('sppg_menus');
    const storedStaff = localStorage.getItem('sppg_staff');
    const storedSheetConfig = localStorage.getItem('sppg_sheet_config');

    // Populate data with cache or default demo values
    setIngredients(storedIngredients ? JSON.parse(storedIngredients) : DEFAULT_INGREDIENTS);
    setLogs(storedLogs ? JSON.parse(storedLogs) : DEFAULT_LOGS);
    setMenus(storedMenus ? JSON.parse(storedMenus) : DEFAULT_MENUS);
    setStaffProfiles(storedStaff ? JSON.parse(storedStaff) : DEFAULT_STAFF);

    if (storedSheetConfig) {
      setSheetConfig(JSON.parse(storedSheetConfig));
    }

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

    // Initialize Firebase Auth listener for Google Token refresh
    const unsubscribe = initAuth(
      (user, accessToken) => {
        setToken(accessToken);
        setGoogleUserEmail(user.email);
        localStorage.setItem('sppg_oauth_token', accessToken);
        localStorage.setItem('sppg_google_email', user.email || '');
      },
      () => {
        // Only clear if not in demo mode
        if (localStorage.getItem('sppg_demo_mode') !== 'true') {
          handleSignOutOffline();
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Save changes locally to retain offline-first durability
  const saveLocally = (
    updatedIngredients: Ingredient[],
    updatedLogs: StockLog[],
    updatedMenus: MenuItem[],
    updatedStaff: UserProfile[]
  ) => {
    localStorage.setItem('sppg_ingredients', JSON.stringify(updatedIngredients));
    localStorage.setItem('sppg_logs', JSON.stringify(updatedLogs));
    localStorage.setItem('sppg_menus', JSON.stringify(updatedMenus));
    localStorage.setItem('sppg_staff', JSON.stringify(updatedStaff));
  };

  // ==========================================
  // SYNC ACTION WITH CLOUD GOOGLE SHEET
  // ==========================================
  const syncToCloud = async (
    currentId: string | null = sheetConfig.spreadsheetId,
    targetIngredients = ingredients,
    targetLogs = logs,
    targetMenus = menus,
    targetStaff = staffProfiles
  ) => {
    if (!token || !currentId || isDemoMode) return;

    try {
      setLoadingCloud(true);
      await syncAllDataToSheets(currentId, token, {
        ingredients: targetIngredients,
        logs: targetLogs,
        menus: targetMenus,
        staff: targetStaff,
      });

      const updatedConfig = {
        ...sheetConfig,
        spreadsheetId: currentId,
        isSynced: true,
        lastSyncedAt: new Date().toISOString(),
      };
      setSheetConfig(updatedConfig);
      localStorage.setItem('sppg_sheet_config', JSON.stringify(updatedConfig));
    } catch (err) {
      console.error('Auto sync to cloud sheets failed:', err);
    } finally {
      setLoadingCloud(false);
    }
  };

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

    // Now check sheets. If there is already a SpreadsheetID linked, fetch fresh data
    const storedConfig = localStorage.getItem('sppg_sheet_config');
    let activeSheetId = null;
    if (storedConfig) {
      const cfg = JSON.parse(storedConfig);
      activeSheetId = cfg.spreadsheetId;
    }

    if (activeSheetId) {
      try {
        setLoadingCloud(true);
        const cloudData = await fetchSpreadsheetData(activeSheetId, result.accessToken);
        
        // Merge cloud data
        setIngredients(cloudData.ingredients);
        setLogs(cloudData.logs);
        setMenus(cloudData.menus);
        setStaffProfiles(cloudData.staff);
        
        saveLocally(cloudData.ingredients, cloudData.logs, cloudData.menus, cloudData.staff);

        const updatedConfig = {
          spreadsheetId: activeSheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${activeSheetId}/edit`,
          isSynced: true,
          lastSyncedAt: new Date().toISOString(),
        };
        setSheetConfig(updatedConfig);
        localStorage.setItem('sppg_sheet_config', JSON.stringify(updatedConfig));
      } catch (err) {
        console.error('Failed to auto-fetch linked spreadsheet on login:', err);
      } finally {
        setLoadingCloud(false);
      }
    } else {
      // Prompt user to auto-create or link sheet in Settings
    }

    return { email: result.user.email || '', token: result.accessToken };
  };

  // Auto create spreadsheet for user
  const handleAutoCreateSpreadsheet = async () => {
    if (!token || isDemoMode) return;

    try {
      setLoadingCloud(true);
      const res = await createOpnameSpreadsheet(token);
      
      const newConfig: SheetConfig = {
        spreadsheetId: res.spreadsheetId,
        spreadsheetUrl: res.spreadsheetUrl,
        isSynced: true,
        lastSyncedAt: new Date().toISOString(),
      };
      setSheetConfig(newConfig);
      localStorage.setItem('sppg_sheet_config', JSON.stringify(newConfig));

      // Push initial data
      await syncToCloud(res.spreadsheetId);
      alert('Berhasil membuat spreadsheet Google baru! Silakan lihat di bagian Pengaturan.');
    } catch (err: any) {
      alert('Gagal membuat Google Sheet: ' + err.message);
    } finally {
      setLoadingCloud(false);
    }
  };

  // Switch/Link other spreadsheet manually
  const handleLinkSpreadsheet = async (idOrUrl: string) => {
    if (!token || isDemoMode) return;

    let targetId = idOrUrl;
    if (idOrUrl.includes('docs.google.com/spreadsheets')) {
      // Extract ID from URL
      const matches = idOrUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matches && matches[1]) {
        targetId = matches[1];
      }
    }

    setLoadingCloud(true);
    try {
      // 1. Test fetch to see if we have access to this sheet
      const cloudData = await fetchSpreadsheetData(targetId, token);

      // 2. Save linked data
      setIngredients(cloudData.ingredients);
      setLogs(cloudData.logs);
      setMenus(cloudData.menus);
      setStaffProfiles(cloudData.staff);

      saveLocally(cloudData.ingredients, cloudData.logs, cloudData.menus, cloudData.staff);

      const updatedConfig: SheetConfig = {
        spreadsheetId: targetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${targetId}/edit`,
        isSynced: true,
        lastSyncedAt: new Date().toISOString(),
      };
      setSheetConfig(updatedConfig);
      localStorage.setItem('sppg_sheet_config', JSON.stringify(updatedConfig));
    } catch (err: any) {
      throw new Error(err.message || 'Gagal menyambungkan Google Sheet.');
    } finally {
      setLoadingCloud(false);
    }
  };

  // Trigger manual sync
  const handleManualSync = async () => {
    if (!token || !sheetConfig.spreadsheetId || isDemoMode) return;
    await syncToCloud(sheetConfig.spreadsheetId);
  };

  // Complete Google + PIN Authentication
  const handleAuthComplete = (profile: UserProfile, oauthToken: string) => {
    setActiveUserProfile(profile);
    setIsAuthenticated(true);
    localStorage.setItem('sppg_active_profile', JSON.stringify(profile));
  };

  // Offline Demo Bypass Sign-in
  const handleDemoBypassSignIn = () => {
    setIsDemoMode(true);
    setToken('demo-token-1234');
    setGoogleUserEmail('demo@sppg.org');
    
    // Choose Chef Hafshawaty as default profile
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
  // DATA MANIPULATION HANDLERS (CRUD & LOGS)
  // ==========================================

  // Add Item
  const handleAddIngredient = async (item: Ingredient) => {
    if (item.currentStock <= 0) {
      return; // Do not add items with 0 or negative stock
    }
    const updated = [...ingredients, item];
    setIngredients(updated);
    saveLocally(updated, logs, menus, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, updated);
  };

  // Update Item
  const handleUpdateIngredient = async (item: Ingredient) => {
    const updated = item.currentStock <= 0
      ? ingredients.filter(i => i.id !== item.id)
      : ingredients.map(i => (i.id === item.id ? item : i));
    setIngredients(updated);
    saveLocally(updated, logs, menus, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, updated);
  };

  // Batch Update Items (Useful for Stock Opname submissions)
  const handleUpdateIngredientsBatch = async (items: Ingredient[]) => {
    const updated = ingredients
      .map(original => {
        const patch = items.find(i => i.id === original.id);
        return patch ? patch : original;
      })
      .filter(i => i.currentStock > 0);
    setIngredients(updated);
    saveLocally(updated, logs, menus, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, updated);
  };

  // Delete Item
  const handleDeleteIngredient = async (id: string) => {
    const updated = ingredients.filter(i => i.id !== id);
    setIngredients(updated);
    saveLocally(updated, logs, menus, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, updated);
  };

  // Add Log
  const handleLogTransaction = async (log: StockLog) => {
    const updated = [log, ...logs];
    setLogs(updated);
    saveLocally(ingredients, updated, menus, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, ingredients, updated);
  };

  // Batch Log Transactions
  const handleLogTransactionsBatch = async (batchLogs: StockLog[]) => {
    const updated = [...batchLogs, ...logs];
    setLogs(updated);
    saveLocally(ingredients, updated, menus, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, ingredients, updated);
  };

  // Batch Add or Update Ingredients and Logs together (preserves state in massive inputs)
  const handleBatchAddOrUpdateIngredientsAndLogs = async (items: Ingredient[], newLogs: StockLog[]) => {
    setIngredients(prevIngredients => {
      let updatedIngredients = [...prevIngredients];
      for (const item of items) {
        if (item.currentStock <= 0) {
          updatedIngredients = updatedIngredients.filter(i => i.id !== item.id);
        } else {
          const idx = updatedIngredients.findIndex(i => i.id === item.id);
          if (idx !== -1) {
            updatedIngredients[idx] = item;
          } else {
            updatedIngredients.push(item);
          }
        }
      }

      setLogs(prevLogs => {
        const updatedLogs = [...newLogs, ...prevLogs];
        saveLocally(updatedIngredients, updatedLogs, menus, staffProfiles);
        syncToCloud(sheetConfig.spreadsheetId, updatedIngredients, updatedLogs);
        return updatedLogs;
      });

      return updatedIngredients;
    });
  };

  // Add Menu
  const handleAddMenu = async (menu: MenuItem) => {
    const updated = [...menus, menu];
    setMenus(updated);
    saveLocally(ingredients, logs, updated, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, ingredients, logs, updated);
  };

  // Delete Menu
  const handleDeleteMenu = async (id: string) => {
    const updated = menus.filter(m => m.id !== id);
    setMenus(updated);
    saveLocally(ingredients, logs, updated, staffProfiles);
    await syncToCloud(sheetConfig.spreadsheetId, ingredients, logs, updated);
  };

  // Add Staff profile
  const handleAddStaffProfile = async (profile: UserProfile) => {
    const updated = [...staffProfiles, profile];
    setStaffProfiles(updated);
    saveLocally(ingredients, logs, menus, updated);
    await syncToCloud(sheetConfig.spreadsheetId, ingredients, logs, menus, updated);
  };

  // Delete Staff Profile
  const handleDeleteStaffProfile = async (id: string) => {
    const updated = staffProfiles.filter(p => p.id !== id);
    setStaffProfiles(updated);
    saveLocally(ingredients, logs, menus, updated);
    await syncToCloud(sheetConfig.spreadsheetId, ingredients, logs, menus, updated);
  };

  // Deep Navigation helper (stats click inside Dashboard)
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
        />
        
        {/* Offline Demo Mode Button in lower background */}
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

          {/* Staf & Admin have access to audit counts */}
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

        {/* Sync Indicator Info */}
        {!isDemoMode && token && !sheetConfig.spreadsheetId && (
          <div className="p-4 mx-3 mb-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] text-amber-200 space-y-2">
            <div className="flex gap-2 items-start">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p>Belum ada Google Spreadsheet ditautkan. Sinkronisasi data cloud dinonaktifkan.</p>
            </div>
            <button
              onClick={handleAutoCreateSpreadsheet}
              disabled={loadingCloud}
              className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-bold rounded-lg transition-all"
            >
              {loadingCloud ? 'Membuat...' : 'Buat Sheet Otomatis'}
            </button>
          </div>
        )}

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

            {activeTab === 'stock_keluar' && (
              <StockKeluar
                ingredients={ingredients}
                userName={activeUserProfile?.name || 'Staf Dapur'}
                onUpdateIngredient={handleUpdateIngredient}
                onLogTransaction={handleLogTransaction}
              />
            )}

            {activeTab === 'history_keluar' && (
              <HistoryKeluar
                logs={logs}
                ingredients={ingredients}
              />
            )}

            {activeTab === 'settings' && (
              <Settings
                sheetConfig={sheetConfig}
                staffProfiles={staffProfiles}
                userRole={activeUserProfile?.role || 'STAF_DAPUR'}
                ingredients={ingredients}
                logs={logs}
                onLinkSpreadsheet={handleLinkSpreadsheet}
                onSyncManual={handleManualSync}
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
