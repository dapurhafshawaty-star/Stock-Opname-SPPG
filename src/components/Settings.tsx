import React, { useState, useRef } from 'react';
import { Ingredient, StockLog, UserProfile, UserRole, CloudDbConfig } from '../types';
import { jsPDF } from 'jspdf';
import { Database, Users, Trash2, UserPlus, RefreshCw, Download, FileText, Check, AlertCircle, Info, Cloud, ShieldCheck, Sparkles, Upload, Image as ImageIcon, X } from 'lucide-react';

interface SettingsProps {
  cloudConfig: CloudDbConfig;
  staffProfiles: UserProfile[];
  userRole: UserRole;
  ingredients: Ingredient[];
  logs: StockLog[];
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
  cloudConfig,
  staffProfiles,
  userRole,
  ingredients,
  logs,
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
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false);

  // Keep local state in sync when props update
  React.useEffect(() => {
    setLocalAppName(appName);
    setLocalLogoText(appLogoText);
    setLocalLogoUrl(appLogoUrl);
  }, [appName, appLogoText, appLogoUrl]);

  // File Input Ref for Logo Upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Logo Upload from PC / Device
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Silakan pilih file gambar (PNG, JPG, WEBP, SVG).');
      return;
    }

    // Limit file size (e.g. 3MB max)
    if (file.size > 3 * 1024 * 1024) {
      alert('Ukuran file logo terlalu besar. Harap pilih gambar di bawah 3 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Data = event.target?.result as string;
      if (base64Data) {
        setLocalLogoUrl(base64Data);
        setUploadNotice('Logo dari PC berhasil dimuat! Klik "Simpan Profil Aplikasi" untuk menyimpan ke Google Cloud.');
        setTimeout(() => setUploadNotice(null), 6000);
      }
    };
    reader.readAsDataURL(file);
  };

  // Sync trigger
  const [syncLoading, setSyncLoading] = useState(false);

  // Staff creation States
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('STAF_DAPUR');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);

  // Export States
  const [exportLoading, setExportLoading] = useState(false);

  // Handle Manual Sync click
  const handleManualSyncClick = async () => {
    setSyncLoading(true);
    try {
      await onSyncManual();
      alert('Koneksi Google Cloud Firestore aktif dan tersinkronisasi secara real-time!');
    } catch (err: any) {
      console.error(err);
      alert('Gagal memeriksa koneksi cloud: ' + err.message);
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
      alert('Profil staff berhasil ditambahkan dan disimpan di Google Cloud Database!');
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
      alert('Staff berhasil dihapus dari Google Cloud Database.');
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
      let csvContent = '\uFEFF';
      csvContent += 'Barcode/ID,Nama Bahan,Kategori,Stok Saat Ini,Satuan,Tanggal Kadaluwarsa,Lokasi Penyimpanan,Catatan,Pembaruan Terakhir\n';
      
      ingredients.forEach(item => {
        const row = [
          `"${item.id}"`,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.category}"`,
          item.currentStock,
          `"${item.unit}"`,
          `"${item.expiryDate || ''}"`,
          `"${item.location}"`,
          `"${(item.notes || '').replace(/"/g, '""')}"`,
          `"${item.lastUpdated}"`
        ];
        csvContent += row.join(',') + '\n';
      });

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

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('LAPORAN STOCK OPNAME DAPUR SPPG', 14, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Tanggal Laporan: ${timestamp} | Total Bahan: ${ingredients.length} item`, 14, 26);
      doc.text('Tersinkronisasi otomatis dengan Database Google Cloud Firestore Dapur SPPG', 14, 31);

      doc.setDrawColor(200, 200, 200);
      doc.line(14, 35, 196, 35);

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

      ingredients.forEach((item) => {
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

        const clippedName = item.name.length > 25 ? item.name.substring(0, 24) + '...' : item.name;

        doc.text(item.id.substring(0, 12), 14, y);
        doc.text(clippedName, 42, y);
        doc.text(item.category, 95, y);
        doc.text(`${item.currentStock} ${item.unit}`, 135, y);
        doc.text(item.expiryDate || '-', 165, y);

        y += 6;
      });

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
          
          {/* Card 1: Google Cloud Database */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
                <Cloud className="w-4.5 h-4.5 text-blue-600" /> Database Google Cloud (Firestore)
              </h3>
              <p className="text-xs text-slate-400">Database cloud terpusat berkecepatan tinggi agar aplikasi dapat diakses real-time di perangkat manapun.</p>
            </div>

            {/* Cloud Status Banner */}
            <div className="bg-blue-50/70 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
              <div className="p-2 rounded-lg shrink-0 bg-blue-600 text-white shadow-xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-xs space-y-1">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  Status Cloud: <span className="text-emerald-600 font-extrabold">Aktif & Online</span>
                </p>
                <p className="text-slate-600">Google Project ID: <strong className="font-mono text-[11px] text-blue-900">{cloudConfig.projectId}</strong></p>
                <p className="text-slate-600">Firestore Instance: <strong className="font-mono text-[10px] text-blue-800">{cloudConfig.databaseId}</strong></p>
                <p className="text-slate-400 text-[10px] pt-1">
                  Sinkronisasi Otomatis Multi-Device (Real-Time)
                </p>
              </div>
            </div>

            {/* Cloud Collections Breakdown */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
              <p className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px]">
                <Database className="w-3.5 h-3.5 text-blue-600" /> Koleksi Data Google Cloud:
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-700 font-semibold">
                <span className="bg-white px-2 py-1.5 rounded border border-slate-200/80 truncate">📦 ingredients ({ingredients.length})</span>
                <span className="bg-white px-2 py-1.5 rounded border border-slate-200/80 truncate">📜 stock_logs ({logs.length})</span>
                <span className="bg-white px-2 py-1.5 rounded border border-slate-200/80 truncate">🍱 menus</span>
                <span className="bg-white px-2 py-1.5 rounded border border-slate-200/80 truncate">👥 staff_profiles ({staffProfiles.length})</span>
              </div>
            </div>

            {/* Cloud Sync Status */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleManualSyncClick}
                disabled={syncLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                {syncLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> Uji Koneksi Google Cloud</>}
              </button>
            </div>
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
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                        {localLogoText || 'SP'}
                      </div>
                    )}
                    <span className="text-xs font-bold text-slate-700 truncate">{localAppName}</span>
                  </div>
                </div>
              </div>

              {/* Import Logo from PC Section */}
              <div className="space-y-2 pt-1">
                <label className="text-[10px] font-bold text-slate-400 block uppercase">Pilih Logo Aplikasi</label>
                
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLogoFileUpload}
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  >
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Import Logo dari PC</span>
                  </button>

                  {localLogoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocalLogoUrl('');
                        setUploadNotice('Logo dihapus. Klik "Simpan Profil Aplikasi" untuk mengonfirmasi.');
                        setTimeout(() => setUploadNotice(null), 5000);
                      }}
                      className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-red-200"
                      title="Hapus Logo Custom"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Logo</span>
                    </button>
                  )}
                </div>

                {uploadNotice && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1.5 animate-fadeIn">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{uploadNotice}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase">Atau URL Gambar Logo (Opsional)</label>
                <input
                  type="text"
                  value={localLogoUrl}
                  onChange={(e) => setLocalLogoUrl(e.target.value)}
                  placeholder="https://domain.com/logo.png"
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
                />
              </div>

              {/* Action Button & Confirmation */}
              <button
                type="button"
                disabled={profileSaving}
                onClick={async () => {
                  setProfileSaving(true);
                  try {
                    await onUpdateAppProfile(localAppName || 'Dapur SPPG', localLogoText || 'SP', localLogoUrl);
                    setProfileSavedSuccess(true);
                    setTimeout(() => setProfileSavedSuccess(false), 4000);
                  } catch (err: any) {
                    alert('Gagal menyimpan profil: ' + err.message);
                  } finally {
                    setProfileSaving(false);
                  }
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                {profileSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Google Cloud...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Simpan Profil Aplikasi & Logo</span>
                  </>
                )}
              </button>

              {profileSavedSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Profil Dapur & Aplikasi berhasil diperbarui di Google Cloud!</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column Stack */}
        <div className="col-span-1 lg:col-span-2 space-y-6">

          {/* Card 3: Manajemen Staff Dapur */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4.5 h-4.5 text-indigo-500" /> Manajemen Akun & Hak Akses Staff Dapur
                </h3>
                <p className="text-xs text-slate-400">Konfigurasi alamat email terautentikasi dan hak akses penggunaan aplikasi inventory dapur.</p>
              </div>
              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-extrabold border border-indigo-100">
                {staffProfiles.length} Terdaftar
              </span>
            </div>

            {/* Access Rights Configuration Banner */}
            <div className="bg-gradient-to-r from-indigo-50/80 to-blue-50/80 p-4 rounded-xl border border-indigo-100/80 text-xs space-y-2">
              <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Konfigurasi Otomatis Hak Akses Email</span>
              </div>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                Setiap alamat email yang didaftarkan pada tabel di bawah ini secara <strong>otomatis diberikan izin masuk</strong> ke aplikasi ini. Staff dapat menggunakan login via <strong>Google Sign-In</strong> dengan email tersebut, atau memasukkan <strong>PIN 4-Digit</strong> pada perangkat dapur.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[10px]">
                <div className="bg-white/80 p-2 rounded-lg border border-indigo-100/60">
                  <span className="font-bold text-purple-700 block">👑 ADMIN</span>
                  <span className="text-slate-500">Kontrol penuh, tambah staff, ubah setting dapur, hapus data.</span>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-indigo-100/60">
                  <span className="font-bold text-amber-700 block">🛡️ SUPERVISOR</span>
                  <span className="text-slate-500">Kelola menu, lihat laporan lengkap, audit mutasi & barang.</span>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-indigo-100/60">
                  <span className="font-bold text-blue-700 block">🧑‍🍳 STAF_DAPUR</span>
                  <span className="text-slate-500">Input barang masuk, barang keluar, dan cek persediaan stok.</span>
                </div>
              </div>
            </div>

            {/* Staff List Table */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Nama Staff</th>
                    <th className="px-4 py-3">Alamat Email Terdaftar</th>
                    <th className="px-4 py-3">Role & Hak Akses</th>
                    <th className="px-4 py-3 text-center">PIN</th>
                    {userRole === 'ADMIN' && <th className="px-4 py-3 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffProfiles.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60">
                          <Check className="w-3 h-3 text-emerald-600" />
                          {p.email}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                          p.role === 'ADMIN' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                          p.role === 'SUPERVISOR' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-blue-100 text-blue-700 border border-blue-200'
                        }`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-slate-600">
                        <span className="px-2 py-1 bg-slate-100 rounded text-xs tracking-widest">{p.pin}</span>
                      </td>
                      {userRole === 'ADMIN' && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteStaff(p)}
                            disabled={staffLoading}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            title="Hapus Hak Akses Staff"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add New Staff Form (Admin Only) */}
            {userRole === 'ADMIN' && (
              <form onSubmit={handleAddStaffSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-600" /> Daftarkan Email Staff & Berikan Hak Akses
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Lengkap Staff</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Chef Budi"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Alamat Email Google Staff</label>
                    <input
                      type="email"
                      required
                      placeholder="budi@gmail.com"
                      value={newStaffEmail}
                      onChange={(e) => setNewStaffEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Email ini yang akan diizinkan login via Google atau PIN.</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Role & Level Hak Akses</label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">4-Digit PIN Masuk Dapur</label>
                    <input
                      type="password"
                      required
                      maxLength={4}
                      placeholder="1234"
                      value={newStaffPin}
                      onChange={(e) => setNewStaffPin(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500 font-mono tracking-widest text-center"
                    />
                  </div>
                </div>

                <div className="pt-2 text-right">
                  <button
                    type="submit"
                    disabled={staffLoading}
                    className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer ml-auto shadow-sm"
                  >
                    {staffLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><UserPlus className="w-3.5 h-3.5" /> Daftarkan Email & Simpan Hak Akses</>}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Card 4: Backup Data Physical Download */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
                <Download className="w-4.5 h-4.5 text-emerald-500" /> Ekspor & Backup Data Fisik
              </h3>
              <p className="text-xs text-slate-400">Unduh salinan cadangan arsip stok bahan baku dapur dalam format Excel (CSV) dan Dokumen Cetak (PDF).</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                onClick={handleExportExcel}
                disabled={exportLoading || ingredients.length === 0}
                className="p-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-xl text-left space-y-2 group transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-emerald-900 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-emerald-600" /> Unduh Format Excel (.CSV)
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Ekspor data lengkap {ingredients.length} jenis bahan baku beserta kategori, lokasi, dan tanggal kadaluwarsa.
                </p>
              </button>

              <button
                onClick={handleExportPDF}
                disabled={exportLoading || ingredients.length === 0}
                className="p-4 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/80 rounded-xl text-left space-y-2 group transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-blue-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" /> Unduh Dokumen PDF (.PDF)
                  </span>
                </div>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Cetak lembar laporan fisik resmi berformat tabel siap pakai untuk audit fisik stok dapur.
                </p>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
