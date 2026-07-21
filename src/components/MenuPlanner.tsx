import React, { useState } from 'react';
import { Ingredient, MenuItem, StockLog } from '../types';
import { Plus, Trash2, Calendar, ChefHat, CheckCircle2, AlertTriangle, ArrowRight, ShoppingCart, Utensils, RefreshCw, Sparkles, PlusCircle } from 'lucide-react';

interface MenuPlannerProps {
  ingredients: Ingredient[];
  menus: MenuItem[];
  onAddMenu: (menu: MenuItem) => Promise<void>;
  onDeleteMenu: (id: string) => Promise<void>;
  onUpdateIngredient: (item: Ingredient) => Promise<void>;
  onLogTransaction: (log: StockLog) => Promise<void>;
  userName: string;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function MenuPlanner({
  ingredients,
  menus,
  onAddMenu,
  onDeleteMenu,
  onUpdateIngredient,
  onLogTransaction,
  userName,
}: MenuPlannerProps) {
  // New Menu Form States
  const [showAddModal, setShowAddModal] = useState(false);
  const [menuName, setMenuName] = useState('');
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  
  // Recipe ingredient binding
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [ingredientQtyRequired, setIngredientQtyRequired] = useState<number | ''>('');
  const [recipeIngredients, setRecipeIngredients] = useState<{
    ingredientId: string;
    name: string;
    quantityRequired: number;
    unit: string;
  }[]>([]);

  // Shopping List Modal States
  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [shoppingMenu, setShoppingMenu] = useState<MenuItem | null>(null);

  const [loading, setLoading] = useState(false);

  // Add Ingredient to Recipe Form
  const handleAddIngredientToRecipe = () => {
    if (!selectedIngredientId || !ingredientQtyRequired || Number(ingredientQtyRequired) <= 0) return;

    const matched = ingredients.find(i => i.id === selectedIngredientId);
    if (!matched) return;

    // Check duplicate
    if (recipeIngredients.some(item => item.ingredientId === selectedIngredientId)) {
      alert('Bahan ini sudah dimasukkan ke dalam resep menu ini.');
      return;
    }

    setRecipeIngredients([
      ...recipeIngredients,
      {
        ingredientId: matched.id,
        name: matched.name,
        quantityRequired: Number(ingredientQtyRequired),
        unit: matched.unit,
      },
    ]);

    setSelectedIngredientId('');
    setIngredientQtyRequired('');
  };

  // Remove ingredient from recipe creator
  const handleRemoveRecipeIngredient = (id: string) => {
    setRecipeIngredients(recipeIngredients.filter(item => item.ingredientId !== id));
  };

  // Save full Menu Recipe
  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuName.trim() || recipeIngredients.length === 0) {
      alert('Beri nama menu masakan dan masukkan minimal 1 bahan resep.');
      return;
    }

    setLoading(true);
    try {
      const newMenu: MenuItem = {
        id: 'MENU-' + Date.now(),
        name: menuName.trim(),
        day: selectedDay,
        ingredients: recipeIngredients,
      };

      await onAddMenu(newMenu);
      setShowAddModal(false);
      
      // Reset creator
      setMenuName('');
      setSelectedDay(DAYS[0]);
      setRecipeIngredients([]);
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan menu masakan.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Menu Recipe
  const handleDeleteMenu = async (menu: MenuItem) => {
    const confirmDelete = window.confirm(`Hapus menu masakan "${menu.name}" dari daftar operasional harian?`);
    if (!confirmDelete) return;

    setLoading(true);
    try {
      await onDeleteMenu(menu.id);
    } catch (err) {
      console.error(err);
      alert('Gagal menghapus menu.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Cooking Deduction (subtract ingredients from inventory)
  const handleCookMenu = async (menu: MenuItem) => {
    // Check first if there are enough ingredients
    const deficits = checkMenuStockDeficits(menu);
    
    if (deficits.length > 0) {
      const proceedWithDeficit = window.confirm(
        `PERHATIAN: Ada ${deficits.length} bahan makanan yang kurang untuk menu ini.\n\n` +
        deficits.map(d => `- ${d.name}: Butuh ${d.required}, Kurang ${d.deficit} ${d.unit}`).join('\n') +
        `\n\nApakah Anda tetap ingin menggunakan bahan yang ada & mengupdate stok sisa (stok akan dikurangi hingga maksimal habis / 0)?`
      );
      if (!proceedWithDeficit) return;
    } else {
      const proceed = window.confirm(`Gunakan bahan untuk memasak menu "${menu.name}"? Ini akan secara otomatis mengurangi stok sisa bahan di gudang.`);
      if (!proceed) return;
    }

    setLoading(true);
    try {
      const timestamp = new Date().toISOString();

      // Loop ingredients and subtract
      for (const reqItem of menu.ingredients) {
        const inventoryItem = ingredients.find(i => i.id === reqItem.ingredientId);
        if (!inventoryItem) continue;

        const oldStock = inventoryItem.currentStock;
        const subQty = reqItem.quantityRequired;
        const newStock = Math.max(0, oldStock - subQty); // cannot go below 0

        const updatedItem: Ingredient = {
          ...inventoryItem,
          currentStock: newStock,
          lastUpdated: timestamp,
        };

        await onUpdateIngredient(updatedItem);
        await onLogTransaction({
          id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          timestamp,
          ingredientId: inventoryItem.id,
          ingredientName: inventoryItem.name,
          type: 'KELUAR',
          quantity: -(oldStock - newStock), // actual subtracted qty
          prevStock: oldStock,
          newStock,
          user: userName,
          notes: `Keperluan masak menu harian: ${menu.name}`,
        });
      }

      alert(`Bahan untuk menu "${menu.name}" berhasil dipotong dari inventaris secara otomatis.`);
    } catch (err: any) {
      console.error(err);
      alert('Gagal memproses bahan masakan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Check ingredient deficits for a menu
  const checkMenuStockDeficits = (menu: MenuItem) => {
    const deficits: { name: string; required: number; available: number; deficit: number; unit: string }[] = [];

    menu.ingredients.forEach(req => {
      const inv = ingredients.find(i => i.id === req.ingredientId);
      const available = inv ? inv.currentStock : 0;
      if (available < req.quantityRequired) {
        deficits.push({
          name: req.name,
          required: req.quantityRequired,
          available,
          deficit: req.quantityRequired - available,
          unit: req.unit,
        });
      }
    });

    return deficits;
  };

  // Open Shopping List compiler
  const openShoppingList = (menu: MenuItem) => {
    setShoppingMenu(menu);
    setShowShoppingModal(true);
  };

  return (
    <div className="space-y-6 font-sans text-slate-800">
      
      {/* Top Controller Panel */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <ChefHat className="w-5 h-5 text-emerald-500 animate-pulse" /> Jadwal & Resep Masak Harian SPPG
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Pantau kecukupan bahan makanan yang masuk sesuai menu dapur.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Tambah Menu Masak
        </button>
      </div>

      {/* Daily Menus Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {DAYS.map((day) => {
          // Filter menus for this specific day
          const dayMenus = menus.filter(menu => menu.day === day);

          return (
            <div key={day} className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between overflow-hidden">
              {/* Day Header Banner */}
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                <span className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-500" /> {day}
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                  {dayMenus.length} Menu
                </span>
              </div>

              {/* Day Menus List */}
              <div className="p-5 flex-1 divide-y divide-slate-100 min-h-[160px]">
                {dayMenus.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8 text-slate-400 gap-1">
                    <Utensils className="w-7 h-7 text-slate-200" />
                    <p className="text-xs font-semibold">Tidak Ada Menu</p>
                    <p className="text-[10px] text-slate-400 max-w-[150px]">Belum dijadwalkan memasak di hari {day}.</p>
                  </div>
                ) : (
                  dayMenus.map((menu) => {
                    const deficits = checkMenuStockDeficits(menu);
                    const isSufficient = deficits.length === 0;

                    return (
                      <div key={menu.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm leading-tight">{menu.name}</h4>
                            <p className="text-[10px] text-slate-400 mt-1">{menu.ingredients.length} Jenis Bahan</p>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteMenu(menu)}
                            className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                            title="Hapus Menu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* List Ingredients Required */}
                        <div className="space-y-1 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                          {menu.ingredients.slice(0, 3).map((ing, i) => {
                            const invItem = ingredients.find(inv => inv.id === ing.ingredientId);
                            const hasEnough = invItem ? invItem.currentStock >= ing.quantityRequired : false;
                            return (
                              <div key={i} className="flex justify-between text-[10px] items-center">
                                <span className="text-slate-600 font-medium truncate max-w-[120px]">{ing.name}</span>
                                <div className="flex gap-1.5 items-center">
                                  <span className="text-slate-500">{ing.quantityRequired} {ing.unit}</span>
                                  <span className={`w-1.5 h-1.5 rounded-full ${hasEnough ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                </div>
                              </div>
                            );
                          })}
                          {menu.ingredients.length > 3 && (
                            <p className="text-[9px] text-slate-400 text-center font-medium mt-1">
                              + {menu.ingredients.length - 3} bahan resep lainnya...
                            </p>
                          )}
                        </div>

                        {/* Stock Check Indicator */}
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          {isSufficient ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Stok Cukup
                            </span>
                          ) : (
                            <span className="text-red-500 font-bold flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5" /> Kurang {deficits.length} Bahan
                            </span>
                          )}

                          {/* Interactive Action buttons */}
                          <div className="flex gap-1">
                            {!isSufficient && (
                              <button
                                onClick={() => openShoppingList(menu)}
                                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-100 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                                title="Lihat Daftar Belanja Bahan yang Kurang"
                              >
                                <ShoppingCart className="w-3 h-3" /> Belanja
                              </button>
                            )}
                            <button
                              onClick={() => handleCookMenu(menu)}
                              disabled={loading}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                              title="Kurangi sisa stok bahan otomatis karena dipakai memasak"
                            >
                              <Utensils className="w-3 h-3" /> Masak
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 1. ADD NEW MENU MASAKAN MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-slate-100 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                Jadwalkan Menu Masakan Baru
              </h3>
              <p className="text-xs text-slate-400 mb-5">
                Kaitkan resep bahan makanan dari master stok agar kecukupan bahan terdeteksi otomatis.
              </p>

              <form onSubmit={handleSaveMenu} className="space-y-4">
                {/* Day Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Hari Masak</label>
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {DAYS.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  {/* Menu Name */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 block mb-1">Nama Menu Hidangan</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Soto Ayam Lamongan"
                      value={menuName}
                      onChange={(e) => setMenuName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Binding Ingredients Selector Section */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Tambah Bahan ke Resep Menu
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <select
                        value={selectedIngredientId}
                        onChange={(e) => setSelectedIngredientId(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 bg-white focus:outline-none"
                      >
                        <option value="">-- Pilih Bahan --</option>
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        type="number"
                        min={0.1}
                        step="any"
                        placeholder="Jumlah"
                        value={ingredientQtyRequired}
                        onChange={(e) => setIngredientQtyRequired(e.target.value !== '' ? Number(e.target.value) : '')}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 bg-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddIngredientToRecipe}
                    className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition-colors"
                  >
                    Kaitkan Bahan Masak
                  </button>
                </div>

                {/* Recipe Ingredient List Review */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 block">Daftar Kebutuhan Resep ({recipeIngredients.length})</label>
                  {recipeIngredients.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">Belum ada bahan resep terikat untuk menu ini.</p>
                  ) : (
                    <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 bg-slate-50/50 p-2 max-h-[160px] overflow-y-auto">
                      {recipeIngredients.map((item) => (
                        <div key={item.ingredientId} className="flex justify-between items-center text-[10px] py-1.5 first:pt-0 last:pb-0">
                          <span className="font-medium text-slate-700 truncate max-w-[180px]">{item.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600">{item.quantityRequired} {item.unit}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveRecipeIngredient(item.ingredientId)}
                              className="text-red-500 hover:text-red-700 font-bold"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Form buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setRecipeIngredients([]);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Jadwalkan Menu'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2. SHOPPING LIST MODAL */}
      {showShoppingModal && shoppingMenu && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-500 mb-1">
                <ShoppingCart className="w-5 h-5" />
                <h3 className="text-base font-bold text-slate-900">Daftar Belanja Kebutuhan Bahan</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Daftar kekurangan bahan makanan di gudang untuk memasak menu: <strong className="font-bold text-slate-700">{shoppingMenu.name}</strong>
              </p>

              {/* Deficit Items List */}
              <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-50 bg-slate-50/50 p-2 max-h-[250px] overflow-y-auto">
                {checkMenuStockDeficits(shoppingMenu).map((item, i) => (
                  <div key={i} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{item.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Tersedia: {item.available} {item.unit} • Dibutuhkan: {item.required} {item.unit}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 font-bold rounded text-[10px]">
                        Kurang {item.deficit} {item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  // Copy to Clipboard feature for sharing with suppliers
                  const text = `Daftar Belanja Kekurangan Bahan Dapur SPPG (${shoppingMenu.name}):\n` +
                    checkMenuStockDeficits(shoppingMenu).map(d => `- ${d.name}: Kurang ${d.deficit} ${d.unit}`).join('\n');
                  navigator.clipboard.writeText(text);
                  alert('Daftar belanja disalin ke clipboard! Bagikan ke penyuplai bahan makanan.');
                }}
                className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold rounded-xl text-xs transition-colors"
              >
                Salin Daftar Belanja ke Clipboard
              </button>
              <button
                type="button"
                onClick={() => setShowShoppingModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
