import React, { useState, useEffect } from 'react';
import { Ingredient, StockLog, MenuItem, UserProfile } from '../types';
import { createStockReportDoc, fetchUserGoogleDocs, appendNoteToDoc, GoogleDocFile } from '../lib/googleDocs';
import { FileText, Plus, ExternalLink, RefreshCw, Sparkles, CheckCircle2, AlertCircle, Send, FileCode, Clock, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GoogleDocsManagerProps {
  token: string | null;
  ingredients: Ingredient[];
  logs: StockLog[];
  menus: MenuItem[];
  activeUserProfile: UserProfile | null;
  onGoogleSignInNeeded?: () => void;
}

export default function GoogleDocsManager({
  token,
  ingredients,
  logs,
  menus,
  activeUserProfile,
  onGoogleSignInNeeded,
}: GoogleDocsManagerProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingDocs, setFetchingDocs] = useState(false);
  const [userDocs, setUserDocs] = useState<GoogleDocFile[]>([]);
  const [lastCreatedDoc, setLastCreatedDoc] = useState<{ id: string; url: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Note appending state
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [customNote, setCustomNote] = useState('');
  const [appending, setAppending] = useState(false);

  useEffect(() => {
    if (token) {
      loadDocsList();
    }
  }, [token]);

  const loadDocsList = async () => {
    if (!token) return;
    setFetchingDocs(true);
    setError(null);
    try {
      const docs = await fetchUserGoogleDocs(token);
      setUserDocs(docs);
      if (docs.length > 0 && !selectedDocId) {
        setSelectedDocId(docs[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching Google Docs:', err);
      // Don't block UI if permission error
    } finally {
      setFetchingDocs(false);
    }
  };

  const handleExportToGoogleDoc = async () => {
    if (!token) {
      if (onGoogleSignInNeeded) onGoogleSignInNeeded();
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const result = await createStockReportDoc(token, {
        ingredients,
        logs,
        menus,
        generatedBy: activeUserProfile?.name || 'Staf Dapur SPPG',
      });

      setLastCreatedDoc({
        id: result.documentId,
        url: result.documentUrl,
        title: `Laporan Stock Opname Dapur - ${new Date().toLocaleDateString('id-ID')}`,
      });

      setSuccessMsg('Laporan Stock Opname berhasil dibuat di Google Docs!');
      await loadDocsList();
    } catch (err: any) {
      console.error('Export Google Doc Error:', err);
      setError(err?.message || 'Gagal membuat dokumen di Google Docs.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedDocId || !customNote.trim()) return;

    setAppending(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await appendNoteToDoc(token, selectedDocId, customNote.trim());
      setCustomNote('');
      setSuccessMsg('Catatan tambahan berhasil disisipkan ke Google Doc!');
      await loadDocsList();
    } catch (err: any) {
      console.error('Append note error:', err);
      setError(err?.message || 'Gagal menyisipkan catatan ke dokumen.');
    } finally {
      setAppending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 backdrop-blur-3xl rounded-l-full pointer-events-none transform translate-x-10" />
        
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-xs font-extrabold text-blue-200">
            <FileText className="w-4 h-4 text-blue-300" /> Integrasi Google Docs (Google Workspace)
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Manajemen & Ekspor Dokumen Laporan
          </h2>
          <p className="text-blue-100/90 text-sm max-w-2xl leading-relaxed">
            Buat laporan fisik resmi, catatan katering, dan resume stok barang dapur otomatis langsung di Google Docs. Dokumen tersimpan rapi di Google Drive akun Anda.
          </p>

          {!token && (
            <div className="pt-2">
              <button
                onClick={onGoogleSignInNeeded}
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-slate-900" /> Masuk Google untuk Mengaktifkan Google Docs
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs font-medium"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-extrabold">Terjadi Kesalahan</p>
              <p>{error}</p>
            </div>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-900 text-xs font-medium"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="font-bold">{successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Export Stock Opname to Google Doc */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Ekspor Laporan Stok ke Google Docs</h3>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                Sistem akan menyusun resume lengkap yang mencakup data {ingredients.length} jenis bahan baku, daftar barang kritis, log transaksi, serta resep menu aktif ke dalam dokumen Google Docs baru.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-600">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Ringkasan Isi Dokumen:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1">
                <li>Detail Stok Aset ({ingredients.length} item)</li>
                <li>Barang Kritis Perlu Restock ({ingredients.filter(i => i.currentStock <= 5).length} item)</li>
                <li>10 Transaksi Terakhir Log Dapur</li>
                <li>Jadwal & Menu Masakan Aktif</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleExportToGoogleDoc}
              disabled={loading || !token}
              className={`w-full py-3.5 px-5 rounded-2xl font-extrabold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer ${
                loading || !token
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.99]'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-200" />
                  <span>Membuat Dokumen Google Docs...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-blue-200" />
                  <span>Buat Laporan Google Docs Sekarang</span>
                </>
              )}
            </button>

            {lastCreatedDoc && (
              <a
                href={lastCreatedDoc.url}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-emerald-600" />
                <span>Buka Dokumen Google Docs Terbaru</span>
              </a>
            )}
          </div>
        </div>

        {/* Card 2: Append Custom Notes */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Sisipkan Catatan Dapur ke Google Doc</h3>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                Pilih dokumen Google Docs yang ada dan tambahkan instruksi khusus dapur, resep tambahan, atau catatan evaluasi katering secara instan.
              </p>
            </div>

            <form onSubmit={handleAppendNote} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pilih Dokumen Google Docs:
                </label>
                {userDocs.length > 0 ? (
                  <select
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {userDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {fetchingDocs ? 'Memuat dokumen...' : 'Belum ada dokumen Google Docs ditemukan. Silakan buat laporan baru.'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tulis Catatan Tambahan:
                </label>
                <textarea
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Contoh: Tambahan order 50 porsi untuk acara santri malam Jumat..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={appending || !token || !selectedDocId || !customNote.trim()}
                className={`w-full py-2.5 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  appending || !token || !selectedDocId || !customNote.trim()
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                }`}
              >
                {appending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Sisipkan Catatan Ke Dokumen</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* List of Existing Google Docs in Drive */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-extrabold text-slate-900">Dokumen Google Docs Dapur Anda</h3>
          </div>
          <button
            onClick={loadDocsList}
            disabled={fetchingDocs || !token}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingDocs ? 'animate-spin text-blue-600' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {!token ? (
          <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-xs text-slate-500">Silakan masuk menggunakan akun Google untuk mengakses daftar Google Docs.</p>
          </div>
        ) : userDocs.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
            <p className="text-xs text-slate-500">Belum ada dokumen Google Docs ditemukan di Google Drive Anda.</p>
            <p className="text-[11px] text-slate-400">Klik tombol "Buat Laporan Google Docs Sekarang" di atas untuk membuat dokumen pertama Anda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-slate-50 hover:bg-slate-100/80 p-4 rounded-2xl border border-slate-200/70 transition-all flex flex-col justify-between space-y-3 group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-extrabold text-slate-900 truncate" title={doc.name}>
                      {doc.name}
                    </h4>
                    {doc.modifiedTime && (
                      <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        Diubah: {new Date(doc.modifiedTime).toLocaleDateString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>

                <a
                  href={doc.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 px-3 bg-white hover:bg-blue-600 hover:text-white text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>Buka di Google Docs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
