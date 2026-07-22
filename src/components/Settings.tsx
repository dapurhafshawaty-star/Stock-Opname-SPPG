import React, { useState } from 'react';
import { Ingredient, StockLog, UserProfile, UserRole, SheetConfig } from '../types';
import { jsPDF } from 'jspdf';
import { Database, Link, Users, Trash2, UserPlus, RefreshCw, Download, FileSpreadsheet, FileText, Check, AlertCircle, Info, Upload } from 'lucide-react';

interface SettingsProps {
  sheetConfig: SheetConfig;
  staffProfiles: UserProfile[];
  userRole: UserRole;
  ingredients: Ingredient[];
  logs: StockLog[];
  onLinkSpreadsheet: (idOrUrl: string) => Promise<void>;
  onSyncManual: () => Promise<void>;
  onAddStaffProfile: (profile: UserProfile) => Promise<void>;
  onDeleteStaffProfile: (id: string) => Promise<void>;
  appName: string;
  appLogoText: string;
  appLogoUrl: string;
  onUpdateAppProfile: (name: string, logoText: string, logoUrl: string) => void;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Admin (Kontrol Penuh)' },
  { value: 'SUPERVISOR', label: 'Supervisor (Pantau & Dashboard)' },
  { value: 'STAF_DAPUR', label: 'Staf Dapur (Scan & Ambil Bahan)' },
];

export default function Settings({
  sheetConfig,
  staffProfiles,
  userRole,
  ingredients,
  logs,
  onLinkSpreadsheet,
  onSyncManual,
  onAddStaffProfile,
  onDeleteStaffProfile,
  appName,
  appLogoText,
  appLogoUrl,
  onUpdateAppProfile,
}: SettingsProps) {
  // Local states for app customization
  const [localAppName, setLocalAppName] = useState(appName);
  const [localLogoText, setLocalLogoText] = useState(appLogoText);
  const [localLogoUrl, setLocalLogoUrl] = useState(appLogoUrl);

  // Linking spreadsheets
  const [sheetInput, setSheetInput] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // Manual Sync trigger
  const [syncLoading, setSyncLoading] = useState(false);

  // Staff creation States
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('STAF_DAPUR');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);

  // Export States
  const [exportLoading, setExportLoading] = useState(false);

  // Handle Link submit
  const handleLinkSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetInput.trim()) return;

    setLinkLoading(true);
    try {
      await onLinkSpreadsheet(sheetInput.trim());
      setSheetInput('');
      alert('Berhasil menautkan Google Spreadsheet baru! Menghubungkan data...');
    } catch (err: any) {
      console.error(err);
      alert('Gagal menautkan spreadsheet. Pastikan format URL/ID valid dan Anda memiliki izin akses: ' + err.message);
    } finally {
      setLinkLoading(false);
    }
  };

  // Handle Manual Sync click
  const handleManualSyncClick = async () => {
    setSyncLoading(true);
    try {
      await onSyncManual();
      alert('Sinkronisasi data ke Google Sheets berhasil diselesaikan secara real-time!');
    } catch (err: any) {
      console.error(err);
      alert('Gagal mensinkronkan data: ' + err.message);
    } finally {
      setSyncLoading(false);
    }
  };

  // Create Staff account
  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim() || newStaffPin.length !== 4) {
      alert('Lengkapi nama, email, dan 4 digit PIN baru.');
      return;
    }

    setStaffLoading(true);
    try {
      const newStaff: UserProfile = {
        id: 'STAFF-' + Date.now(),
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        role: newStaffRole,
        pin: newStaffPin,
      };

      await onAddStaffProfile(newStaff);
      
      // Reset
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffRole('STAF_DAPUR');
      setNewStaffPin('');
      alert('Profil staff berhasil ditambahkan dan disinkronisasikan!');
    } catch (err: any) {
      console.error(err);
      alert('Gagal menambah staff: ' + err.message);
    } finally {
      setStaffLoading(false);
    }
  };

  // Delete Staff Account
  const handleDeleteStaff = async (profile: UserProfile) => {
    const isSelf = staffProfiles.length === 1 || profile.role === 'ADMIN';
    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus akun staff "${profile.name}"?\n` +
      `${isSelf ? 'Peringatan: Menghapus akun admin dapat menyebabkan kegagalan sistem masuk jika tidak ada admin pengganti.' : ''}`
    );
    if (!confirmDelete) return;

    setStaffLoading(true);
    try {
      await onDeleteStaffProfile(profile.id);
      alert('Staff berhasil dihapus.');
    } catch (err: any) {
      console.error(err);
      alert('Gagal menghapus staff: ' + err.message);
    } finally {
      setStaffLoading(false);
    }
  };

  // Export to Excel (CSV)
  const handleExportExcel = () => {
    setExportLoading(true);
    try {
      // 1. Prepare CSV Content
      let csvContent = '\uFEFF'; // UTF-8 BOM for Indonesian Excel characters
      csvContent += 'Barcode/ID,Nama Bahan,Kategori,Stok Saat Ini,Stok Minimum,Satuan,Tanggal Kadaluwarsa,Lokasi Penyimpanan,Catatan,Pembaruan Terakhir\n';
      
      ingredients.forEach(item => {
        const row = [
          `"${item.id}"`,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.category}"`,
          item.currentStock,
          0, // minStock column (deprecated)
          `"${item.unit}"`,
          `"${item.expiryDate || ''}"`,
          `"${item.location}"`,
          `"${(item.notes || '').replace(/"/g, '""')}"`,
          `"${item.lastUpdated}"`
        ];
        csvContent += row.join(',') + '\n';
      });

      // 2. Download trigger
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Dapur_SPPG_Master_Stok_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor data Excel.');
    } finally {
      setExportLoading(false);
    }
  };

  // Export to PDF (jsPDF)
  const handleExportPDF = () => {
    setExportLoading(true);
    try {
      const doc = new jsPDF();
      const timestamp = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

      // Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LAPORAN STOCK OPNAME DAPUR SPPG', 14, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Tanggal Laporan: ${timestamp} | Total Bahan: ${ingredients.length} item`, 14, 26);
      doc.text('Tersinkronisasi otomatis dengan database Google Sheets Dapur SPPG', 14, 31);

      // Draw horizontal line
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 35, 196, 35);

      // Table Header
      let y = 43;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      doc.text('Barcode/ID', 14, y);
      doc.text('Nama Bahan', 42, y);
      doc.text('Kategori', 95, y);
      doc.text('Stok Sisa', 135, y);
      doc.text('Kadaluwarsa', 165, y);

      doc.line(14, y + 2, 196, y + 2);
      y += 7;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(80, 80, 80);

      // Draw Rows
      ingredients.forEach((item, index) => {
        // Simple page breaking if too many rows
        if (y > 275) {
          doc.addPage();
          y = 20;
          doc.setFont('Helvetica', 'bold');
          doc.text('Barcode/ID', 14, y);
          doc.text('Nama Bahan', 42, y);
          doc.text('Kategori', 95, y);
          doc.text('Stok Sisa', 135, y);
          doc.text('Kadaluwarsa', 165, y);
          doc.line(14, y + 2, 196, y + 2);
          doc.setFont('Helvetica', 'normal');
          y += 7;
        }

        // Clip long names to fit page columns
        const clippedName = item.name.length > 25 ? item.name.substring(0, 24) + '...' : item.name;

        doc.text(item.id.substring(0, 12), 14, y);
        doc.text(clippedName, 42, y);
        doc.text(item.category, 95, y);
        doc.text(`${item.currentStock} ${item.unit}`, 135, y);
        doc.text(item.expiryDate || '-', 165, y);

        y += 6;
      });

      // Download trigger
      doc.save(`Laporan_Stok_SPPG_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor data PDF.');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-800">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column Stack */}
        <div className="col-span-1 lg:col-span-1 space-y-6">
          
          {/* Card 1: Google Sheets Database */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
                <Database className="w-4.5 h-4.5 text-emerald-500" /> Database Google Sheets
              </h3>
              <p className="text-xs text-slate-400">Sinkronisasi mutasi dan audit stok secara otomatis ke Spreadsheet Google.</p>
            </div>

            {/* Sync Status Banner */}
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-start gap-3">
              <div className={`p-2 rounded-lg shrink-0 ${sheetConfig.isSynced ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                <Check className="w-4 h-4" />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-bold text-slate-800">Status Google Sheets</p>
                <p className="text-slate-500">SpreadsheetID: <strong className="font-mono text-[10px] break-all">{sheetConfig.spreadsheetId || 'Belum Terhubung'}</strong></p>
                <p className="text-slate-400">Terakhir update: {sheetConfig.lastSyncedAt ? new Date(sheetConfig.lastSyncedAt).toLocaleString('id-ID') : 'Belum pernah'}</p>
              </div>
            </div>

            {/* Sheets Reporting Tabs Indicator */}
            <div className="p-3 bg-emerald-50/50 border border-emerald-100/80 rounded-xl space-y-2 text-xs">
              <p className="font-bold text-emerald-900 flex items-center gap-1.5 text-[11px]">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Lembar Kerja Database:
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-emerald-800 font-medium">
                <span className="bg-white px-2 py-1 rounded border border-emerald-200/60 truncate">📊 Master Stok</span>
                <span className="bg-white px-2 py-1 rounded border border-emerald-200/60 truncate">📜 Log Transaksi</span>
                <span className="bg-white px-2 py-1 rounded border border-emerald-200/60 truncate">🍱 Menu Masakan</span>
                <span className="bg-white px-2 py-1 rounded border border-emerald-200/60 truncate">👥 Profil Staff</span>
              </div>
            </div>

            {/* Manual sync and open spreadsheet buttons */}
            <div className="space-y-2 pt-2">
              {sheetConfig.spreadsheetUrl && (
                <a
                  href={sheetConfig.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Link className="w-4 h-4" /> Buka Google Spreadsheet
                </a>
              )}

              <button
                onClick={handleManualSyncClick}
                disabled={syncLoading || !sheetConfig.spreadsheetId}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> Sinkronisasikan Data Sekarang</>}
              </button>
            </div>

            {/* Reconnect other sheet form */}
            <form onSubmit={handleLinkSheetSubmit} className="pt-4 border-t border-slate-100 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Tautkan Spreadsheet Lain</label>
                <input
                  type="text"
                  placeholder="Paste URL Google Sheets atau ID Spreadsheet..."
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={linkLoading || !sheetInput.trim()}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {linkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Ganti Spreadsheet Tautan'}
              </button>
            </form>
          </div>

          {/* Card 2: Edit Profil Dapur SPPG */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
                <Users className="w-4.5 h-4.5 text-indigo-500" /> Profil Dapur & Aplikasi
              </h3>
              <p className="text-xs text-slate-400">Ubah identitas visual dan penamaan sistem aplikasi inventory Anda.</p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Nama Aplikasi</label>
                <input
                  type="text"
                  value={localAppName}
                  onChange={(e) => setLocalAppName(e.target.value)}
                  placeholder="Contoh: Dapur SPPG"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Inisial Logo</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={localLogoText}
                    onChange={(e) => setLocalLogoText(e.target.value.toUpperCase())}
                    placeholder="SP"
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 text-center font-black"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Pratinjau Logo</label>
                  <div className="flex items-center gap-2 h-[30px] px-1">
                    {localLogoUrl ? (
                      <img 
                        src={localLogoUrl} 
                        alt="Preview" 
                        className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-emerald-500 text-white font-black text-xs rounded-lg flex items-center justify-center shadow-xs">
                        {localLogoText || 'SP'}
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400 font-medium truncate">{localAppName || 'Dapur SPPG'}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Unggah File Gambar Logo</label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-center">
                    <Upload className="w-4 h-4 text-slate-400 mb-1" />
                    <span className="text-[10px] font-bold text-slate-600 block">Pilih File Logo</span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">Mendukung format PNG, JPG, SVG</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            if (typeof reader.result === 'string') {
                              setLocalLogoUrl(reader.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {localLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setLocalLogoUrl('')}
                      className="px-2.5 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-rose-100 shrink-0 flex items-center justify-center"
                      title="Hapus Logo"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Atau Tautan URL Gambar Logo</label>
                <input
                  type="url"
                  value={localLogoUrl}
                  onChange={(e) => setLocalLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[9px] text-slate-400 mt-1 block">Kosongkan untuk menggunakan inisial teks di atas.</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  onUpdateAppProfile(localAppName.trim() || 'Dapur SPPG', localLogoText.trim() || 'SP', localLogoUrl.trim());
                  alert('Profil Dapur & Aplikasi berhasil diperbarui!');
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                Simpan Perubahan Profil
              </button>
            </div>
          </div>

        </div>

        {/* Right Section: Multi-level Staff Directory & Roles Management */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm col-span-1 lg:col-span-2 space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1">
              <Users className="w-4.5 h-4.5 text-emerald-500" /> Direktori Akun & Peran Staff
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Daftarkan email Google staf dapur, tetapkan hak akses (otentikasi multi-level), serta PIN login cepat untuk tablet operasional harian.
            </p>

            {/* Admin only Add Staff Account Form */}
            {userRole === 'ADMIN' ? (
              <form onSubmit={handleAddStaffSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                <div className="col-span-1 md:col-span-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <UserPlus className="w-4 h-4 text-emerald-500" /> Tambah Staff Baru
                  </h4>
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Chef Hafshawaty"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Email Google Resmi</label>
                  <input
                    type="email"
                    required
                    placeholder="nama@gmail.com"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Peran Hak Akses</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none"
                  >
                    {ROLES.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">PIN Keamanan (4 Digit)</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    pattern="[0-9]{4}"
                    placeholder="xxxx"
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-800 text-center tracking-[0.5em] font-bold focus:outline-none"
                  />
                </div>

                <div className="col-span-1 md:col-span-2 pt-2">
                  <button
                    type="submit"
                    disabled={staffLoading}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {staffLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Keluarkan Akun Staff'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-2 text-xs text-amber-800 mb-6">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <p>Hanya Admin yang dapat menambah atau menghapus profil staf. Peran Anda saat ini dibatasi.</p>
              </div>
            )}

            {/* Staff Accounts Directories List */}
            <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 bg-slate-50/50 max-h-[220px] overflow-y-auto">
              {staffProfiles.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                  Tidak ada staff terdaftar. Profil Anda otomatis ditambahkan sebagai Admin saat pertama login.
                </div>
              ) : (
                staffProfiles.map((profile) => (
                  <div key={profile.id} className="p-3 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{profile.name}</p>
                      <p className="text-slate-400 mt-0.5">{profile.email} • PIN: <span className="font-mono font-bold tracking-widest text-[9px]">****</span></p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                        profile.role === 'ADMIN'
                          ? 'bg-red-50 text-red-600 border-red-100'
                          : profile.role === 'SUPERVISOR'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {profile.role === 'ADMIN' ? 'Admin' : profile.role === 'SUPERVISOR' ? 'Supervisor' : 'Staf'}
                      </span>

                      {userRole === 'ADMIN' && (
                        <button
                          onClick={() => handleDeleteStaff(profile)}
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors"
                          title="Hapus Staff"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Export Reports Center Block */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Download className="w-4 h-4 text-emerald-500" /> Pusat Ekspor Laporan Dapur SPPG
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleExportExcel}
                disabled={exportLoading}
                className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel (CSV)
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exportLoading}
                className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <FileText className="w-4 h-4" /> Unduh PDF Master Stok
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">
              <Info className="w-3 h-3 text-slate-400 inline mr-1" />
              Laporan PDF menyertakan status stok akhir harian yang disesuaikan, lokasi rak penyimpanan, dan tanggal kadaluwarsa bahan makanan SPPG.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
