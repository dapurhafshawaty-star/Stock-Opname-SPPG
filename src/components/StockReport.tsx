import React, { useState, useMemo } from 'react';
import { Ingredient, StockLog } from '../types';
import { 
  FileText, 
  Calendar, 
  Download, 
  Printer, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Boxes, 
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Building2,
  CalendarDays
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StockReportProps {
  ingredients: Ingredient[];
  logs: StockLog[];
  appName?: string;
}

// Helper function to format numbers in Indonesian locale (e.g. 2.950, 0,6, 4.120,3)
const formatIDNumber = (num: number) => {
  if (num === undefined || num === null || isNaN(num)) return '0';
  const isInteger = Number.isInteger(num);
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: isInteger ? 0 : 1,
    maximumFractionDigits: 2,
  });
};

const formatBarangMasuk = (val: number) => {
  return formatIDNumber(val);
};

const formatBarangKeluar = (val: number) => {
  return formatIDNumber(val);
};

// Helper function to format date with Day name in Indonesian (e.g. "Sabtu, 24 Juli 2026")
const formatIndonesianDateWithDay = (dateStr: string) => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dayName = days[d.getDay()];
  const dateNum = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dateNum} ${monthName} ${year}`;
};

// Generate Official Badan Gizi Nasional Logo Data URL for PDF and Print header
const getBadanGiziLogoDataUrl = (): string => {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = 250;
  const cy = 250;

  // 1. Outer Gold Metallic Double Ring
  ctx.beginPath();
  ctx.arc(cx, cy, 245, 0, Math.PI * 2);
  ctx.fillStyle = '#9b7a2b';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 240, 0, Math.PI * 2);
  ctx.strokeStyle = '#e2ba4f';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 235, 0, Math.PI * 2);
  ctx.strokeStyle = '#4e3a0d';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 2. Light Sky Blue Circular Ring Band
  ctx.beginPath();
  ctx.arc(cx, cy, 233, 0, Math.PI * 2);
  ctx.fillStyle = '#bce3f2';
  ctx.fill();

  // Inner Gold Ring border
  ctx.beginPath();
  ctx.arc(cx, cy, 168, 0, Math.PI * 2);
  ctx.fillStyle = '#081d42'; // Fill inner circle first
  ctx.fill();
  ctx.strokeStyle = '#c49e38';
  ctx.lineWidth = 6;
  ctx.stroke();

  // 3. Curved Text on Light Sky Blue Band ("BADAN GIZI NASIONAL" and "REPUBLIK INDONESIA")
  ctx.fillStyle = '#081e42';
  ctx.font = 'bold 31px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Helper for text along arc
  const drawArcText = (text: string, radius: number, startAngle: number, endAngle: number, forward: boolean = true) => {
    const chars = text.split('');
    const totalAngle = endAngle - startAngle;
    const anglePerChar = totalAngle / (chars.length - 1 || 1);

    chars.forEach((char, i) => {
      const angle = forward ? startAngle + i * anglePerChar : startAngle - i * anglePerChar;
      ctx.save();
      ctx.translate(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.rotate(angle + (forward ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  };

  // Top Text: "BADAN GIZI NASIONAL"
  drawArcText("BADAN GIZI NASIONAL", 201, -Math.PI * 0.81, -Math.PI * 0.19, true);

  // Bottom Text: "REPUBLIK INDONESIA"
  drawArcText("REPUBLIK INDONESIA", 201, Math.PI * 0.81, Math.PI * 0.19, false);

  // Left and Right Navy Dots
  ctx.beginPath();
  ctx.arc(cx - 200, cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#081e42';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx + 200, cy, 10, 0, Math.PI * 2);
  ctx.fill();

  // 4. Inner Deep Navy Blue Circle Background (#081d42)
  // Left & Right Gold Human Silhouettes
  ctx.fillStyle = '#daab34';
  
  // Left Silhouette
  ctx.beginPath();
  ctx.arc(122, 295, 20, 0, Math.PI * 2); // Head
  ctx.fill();
  ctx.beginPath(); // Arm & Torso
  ctx.moveTo(90, 380);
  ctx.quadraticCurveTo(110, 310, 142, 250);
  ctx.quadraticCurveTo(154, 250, 150, 275);
  ctx.quadraticCurveTo(126, 330, 152, 380);
  ctx.closePath();
  ctx.fill();

  // Right Silhouette
  ctx.beginPath();
  ctx.arc(378, 295, 20, 0, Math.PI * 2); // Head
  ctx.fill();
  ctx.beginPath(); // Arm & Torso
  ctx.moveTo(410, 380);
  ctx.quadraticCurveTo(390, 310, 358, 250);
  ctx.quadraticCurveTo(346, 250, 350, 275);
  ctx.quadraticCurveTo(374, 330, 348, 380);
  ctx.closePath();
  ctx.fill();

  // 5. Two Green Leaves at Bottom
  ctx.fillStyle = '#78ca49';
  // Left Leaf
  ctx.beginPath();
  ctx.moveTo(246, 420);
  ctx.quadraticCurveTo(200, 420, 168, 360);
  ctx.quadraticCurveTo(220, 355, 246, 420);
  ctx.fill();

  // Right Leaf
  ctx.beginPath();
  ctx.moveTo(254, 420);
  ctx.quadraticCurveTo(300, 420, 332, 360);
  ctx.quadraticCurveTo(280, 355, 254, 420);
  ctx.fill();

  // Center Leaf Vein Line
  ctx.strokeStyle = '#439220';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(246, 420);
  ctx.quadraticCurveTo(210, 390, 168, 360);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(254, 420);
  ctx.quadraticCurveTo(290, 390, 332, 360);
  ctx.stroke();

  // 6. GARUDA PANCASILA EMBLEM AT CENTER
  const gx = 250;
  const gy = 205;

  // Wings (Gold #e5b835)
  ctx.fillStyle = '#e5b835';
  ctx.strokeStyle = '#9c7314';
  ctx.lineWidth = 2;

  // Left Wing
  ctx.beginPath();
  ctx.moveTo(gx - 10, gy - 15);
  ctx.quadraticCurveTo(gx - 60, gy - 80, gx - 92, gy - 50);
  ctx.quadraticCurveTo(gx - 80, gy, gx - 45, gy + 35);
  ctx.quadraticCurveTo(gx - 75, gy - 10, gx - 92, gy - 50);
  ctx.fill();
  ctx.stroke();

  // Right Wing
  ctx.beginPath();
  ctx.moveTo(gx + 10, gy - 15);
  ctx.quadraticCurveTo(gx + 60, gy - 80, gx + 92, gy - 50);
  ctx.quadraticCurveTo(gx + 80, gy, gx + 45, gy + 35);
  ctx.quadraticCurveTo(gx + 75, gy - 10, gx + 92, gy - 50);
  ctx.fill();
  ctx.stroke();

  // Feathers details on wings
  ctx.beginPath();
  for (let i = 1; i <= 7; i++) {
    ctx.moveTo(gx - 20 - i * 9, gy - 20 - i * 4);
    ctx.lineTo(gx - 10 - i * 10, gy + 15 + i * 2);

    ctx.moveTo(gx + 20 + i * 9, gy - 20 - i * 4);
    ctx.lineTo(gx + 10 + i * 10, gy + 15 + i * 2);
  }
  ctx.strokeStyle = '#b08212';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tail feathers (7 feathers)
  ctx.fillStyle = '#e5b835';
  ctx.beginPath();
  ctx.moveTo(gx - 22, gy + 50);
  ctx.lineTo(gx - 30, gy + 95);
  ctx.lineTo(gx, gy + 102);
  ctx.lineTo(gx + 30, gy + 95);
  ctx.lineTo(gx + 22, gy + 50);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Garuda Head facing left
  ctx.beginPath();
  ctx.arc(gx - 2, gy - 40, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Crown feathers
  ctx.beginPath();
  ctx.moveTo(gx - 4, gy - 52);
  ctx.lineTo(gx - 2, gy - 62);
  ctx.lineTo(gx + 4, gy - 52);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.moveTo(gx - 12, gy - 42);
  ctx.lineTo(gx - 24, gy - 38);
  ctx.lineTo(gx - 12, gy - 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(gx - 6, gy - 43, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Chest Shield
  const sx = gx - 28;
  const sy = gy - 28;
  const sw = 56;
  const sh = 64;

  // Shield base
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + sw, sy);
  ctx.lineTo(sx + sw, sy + sh * 0.65);
  ctx.quadraticCurveTo(gx, sy + sh * 1.15, sx, sy + sh * 0.65);
  ctx.closePath();
  ctx.fill();

  // Red top-left & bottom-right quadrants
  ctx.fillStyle = '#d32f2f';
  // Top Left
  ctx.fillRect(sx, sy, sw / 2, sh / 2);
  // Bottom Right
  ctx.beginPath();
  ctx.moveTo(gx, sy + sh / 2);
  ctx.lineTo(sx + sw, sy + sh / 2);
  ctx.lineTo(sx + sw, sy + sh * 0.65);
  ctx.quadraticCurveTo(gx + sw * 0.25, sy + sh * 0.95, gx, sy + sh * 0.82);
  ctx.closePath();
  ctx.fill();

  // Thick Gold Shield Border
  ctx.strokeStyle = '#f5b025';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Center Heart Black Shield with Gold Star
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(gx, gy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5b025';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Gold Star in Center
  ctx.fillStyle = '#fbc02d';
  ctx.font = 'bold 15px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', gx, gy + 1);

  // White Scroll / Ribbon at Feet ("BHINNEKA TUNGGAL IKA")
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(gx - 50, gy + 82);
  ctx.quadraticCurveTo(gx, gy + 88, gx + 50, gy + 82);
  ctx.lineTo(gx + 55, gy + 94);
  ctx.quadraticCurveTo(gx, gy + 100, gx - 55, gy + 94);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 7px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BHINNEKA TUNGGAL IKA', gx, gy + 89);

  return canvas.toDataURL('image/png');
};

export default function StockReport({ ingredients, logs, appName = 'Dapur SPPG' }: StockReportProps) {
  // Date filter state: defaults to today's date
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 25;

  // Presets
  const setPresetDate = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    const now = new Date();
    if (type === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (type === 'yesterday') {
      const y = new Date();
      y.setDate(now.getDate() - 1);
      const d = y.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (type === 'week') {
      const w = new Date();
      w.setDate(now.getDate() - 7);
      setStartDate(w.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (type === 'month') {
      const m = new Date();
      m.setDate(1); // 1st of current month
      setStartDate(m.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    }
    setCurrentPage(1);
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = ingredients.map((ing) => ing.category);
    return ['All', ...Array.from(new Set(cats))];
  }, [ingredients]);

  // Calculate report rows for each ingredient based on selected date range
  const reportRows = useMemo(() => {
    const startRange = new Date(`${startDate}T00:00:00.000`);
    const endRange = new Date(`${endDate}T23:59:59.999`);

    return ingredients.map((ing) => {
      const currentStock = ing.batches && ing.batches.length > 0
        ? ing.batches.reduce((sum, b) => sum + b.quantity, 0)
        : (ing.currentStock || 0);

      const ingLogs = logs.filter((l) => l.ingredientId === ing.id);

      // KELUAR logs after endRange (for historical date filter)
      const keluarLogsAfterEnd = ingLogs.filter(
        (l) => l.type === 'KELUAR' && new Date(l.timestamp) > endRange
      );
      const totalKeluarAfterEnd = keluarLogsAfterEnd.reduce((sum, l) => sum + Math.abs(l.quantity), 0);

      // Stock Akhir at endRange = currentStock + totalKeluarAfterEnd
      const stockAkhir = Math.max(0, currentStock + totalKeluarAfterEnd);

      // KELUAR logs in selected date range
      const keluarLogsInRange = ingLogs.filter((l) => {
        if (l.type !== 'KELUAR') return false;
        const t = new Date(l.timestamp);
        return t >= startRange && t <= endRange;
      });

      const barangKeluar = keluarLogsInRange.reduce((sum, l) => sum + Math.abs(l.quantity), 0);

      // Stock Awal before KELUAR in date range
      const stockAwal = parseFloat((stockAkhir + barangKeluar).toFixed(3));

      return {
        id: ing.id,
        name: ing.name,
        category: ing.category,
        unit: ing.unit,
        stockAwal,
        barangKeluar,
        stockAkhir,
      };
    });
  }, [ingredients, logs, startDate, endDate]);

  // Filter report rows by search & category
  const filteredRows = useMemo(() => {
    return reportRows.filter((row) => {
      const matchesSearch = 
        !searchTerm.trim() ||
        row.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        row.id.toLowerCase().includes(searchTerm.toLowerCase().trim());

      const matchesCategory = selectedCategory === 'All' || row.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [reportRows, searchTerm, selectedCategory]);

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredRows, currentPage]);

  // Aggregated Summary Totals
  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        stockAwal: acc.stockAwal + r.stockAwal,
        barangKeluar: acc.barangKeluar + r.barangKeluar,
        stockAkhir: acc.stockAkhir + r.stockAkhir,
      }),
      { stockAwal: 0, barangKeluar: 0, stockAkhir: 0 }
    );
  }, [filteredRows]);

  // Format Date Range Label (e.g., "25 Juli 2026")
  const dateRangeLabel = useMemo(() => {
    const startFormatted = new Date(startDate).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const endFormatted = new Date(endDate).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (startDate === endDate) return startFormatted;
    return `${startFormatted} s/d ${endFormatted}`;
  }, [startDate, endDate]);

  // EXPORT TO EXCEL (.xlsx)
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const exportData = filteredRows.map((row, idx) => ({
      'No': idx + 1,
      'Nama Bahan Baku': row.name,
      'Satuan': row.unit,
      'Stock Awal': formatIDNumber(row.stockAwal),
      'Barang Keluar': formatBarangKeluar(row.barangKeluar),
      'Stock Akhir': formatIDNumber(row.stockAkhir),
    }));

    // Add Summary Row
    exportData.push({
      'No': 'TOTAL' as any,
      'Nama Bahan Baku': `Total (${filteredRows.length} Bahan)`,
      'Satuan': '-',
      'Stock Awal': formatIDNumber(totals.stockAwal),
      'Barang Keluar': formatBarangKeluar(totals.barangKeluar),
      'Stock Akhir': formatIDNumber(totals.stockAkhir),
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan_Stok');
    XLSX.writeFile(workbook, `Laporan_Stok_${appName.replace(/\s+/g, '_')}_${startDate}_sd_${endDate}.xlsx`);
  };

  // EXPORT TO PDF (.pdf) - Matching exact official document format
  const handleExportPDF = () => {
    if (filteredRows.length === 0) {
      alert('Tidak ada data untuk dicetak.');
      return;
    }

    const doc = new jsPDF('portrait', 'pt', 'a4');

    // 1. KOP SURAT HEADER
    const logoDataUrl = getBadanGiziLogoDataUrl();
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 36, 26, 48, 48);
    }

    // Kop Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text('BADAN GIZI NASIONAL (NATIONAL NUTRITION AGENCY)', 92, 38);

    doc.setFontSize(9);
    doc.text('SPPG PROBOLINGGO KREJENGAN TEMENGGUNGAN', 92, 50);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('YAYASAN HAFSHAWATY ZAINUL HASAN', 92, 61);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(50, 50, 50);
    doc.text('Dusun Krajan RT/RW 003/004, Desa Temenggungan, Kec. Krejengan, Kab. Probolinggo', 92, 72);

    // Double Divider Line
    doc.setLineWidth(1.5);
    doc.setDrawColor(0, 0, 0);
    doc.line(36, 82, 559, 82);
    doc.setLineWidth(0.5);
    doc.line(36, 84.5, 559, 84.5);

    // 2. DOCUMENT TITLE
    const dateFormatted = startDate === endDate 
      ? formatIndonesianDateWithDay(startDate)
      : `${formatIndonesianDateWithDay(startDate)} s/d ${formatIndonesianDateWithDay(endDate)}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 0, 0);
    doc.text('LAPORAN STOCK OPNAME BAHAN BAKU', 297.6, 104, { align: 'center' });

    doc.setFontSize(9.5);
    doc.text('SPPG KREJENGAN TEMENGGUNGAN – YAYASAN HAFSHAWATY', 297.6, 117, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Hari & Tanggal: ${dateFormatted}`, 297.6, 129, { align: 'center' });

    // 3. TABLE COLUMNS & ROWS
    const tableColumn = [
      'No',
      'Nama Bahan Baku',
      'Satuan',
      'Stock\nAwal',
      'Barang\nKeluar',
      'Stock\nAkhir'
    ];

    const tableRows = filteredRows.map((row, idx) => [
      idx + 1,
      row.name,
      row.unit,
      formatIDNumber(row.stockAwal),
      formatBarangKeluar(row.barangKeluar),
      formatIDNumber(row.stockAkhir),
    ]);

    // Summary Row if data exists
    tableRows.push([
      'TOTAL',
      `Total (${filteredRows.length} Bahan)`,
      '-',
      formatIDNumber(totals.stockAwal),
      formatBarangKeluar(totals.barangKeluar),
      formatIDNumber(totals.stockAkhir),
    ]);

    // Render Table
    autoTable(doc, {
      startY: 142,
      margin: { left: 36, right: 36, top: 36, bottom: 36 },
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 35 },
        1: { halign: 'left', cellWidth: 218 },
        2: { halign: 'center', cellWidth: 50 },
        3: { halign: 'right', cellWidth: 72 },
        4: { halign: 'right', cellWidth: 74 },
        5: { halign: 'right', cellWidth: 74 },
      },
      styles: {
        fontSize: 8,
        cellPadding: 4,
        font: 'helvetica',
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
        textColor: [0, 0, 0],
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      didParseCell: (data) => {
        if (data.section === 'head') {
          data.cell.styles.halign = 'center';
        }
        if (data.section === 'body' && data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 253, 244]; // emerald light background for total
          if (data.column.index === 0) {
            data.cell.styles.halign = 'center';
          }
        }
      },
    });

    // 4. SIGNATURE BLOCK (MENGETAHUI)
    let finalY = (doc as any).lastAutoTable.finalY + 25;
    if (finalY + 110 > 800) {
      doc.addPage();
      finalY = 40;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Mengetahui', 36, finalY);

    const sigY = finalY + 16;
    const nameY = sigY + 55;

    // Col 1: Asisten Lapangan
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Disusun Oleh', 36, sigY);
    doc.text('Asisten Lapangan', 36, sigY + 12);
    doc.setFont('helvetica', 'bold');
    doc.text('(Qoidul Muttaqin, M. E)', 36, nameY);

    // Col 2: Pengawas Keuangan
    doc.setFont('helvetica', 'normal');
    doc.text('Diperiksa Oleh', 230, sigY);
    doc.text('Pengawas Keuangan', 230, sigY + 12);
    doc.setFont('helvetica', 'bold');
    doc.text('(Muhammad Fadil, S. E)', 230, nameY);

    // Col 3: Kepala SPPG
    doc.setFont('helvetica', 'normal');
    doc.text('Disetujui Oleh', 410, sigY);
    doc.text('Kepala SPPG', 410, sigY + 12);
    doc.setFont('helvetica', 'bold');
    doc.text('(SRI ROHAYU, S. Pd)', 410, nameY);

    // Save PDF file
    doc.save(`Laporan_Stok_Opname_${startDate}_sd_${endDate}.pdf`);
  };

  // Direct Print Layout
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* Print CSS styling injection */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          @page {
            size: portrait;
            margin: 12mm;
          }
        }
      `}</style>

      {/* Top Header Card (Hidden on print) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-emerald-600" /> Cetak Laporan Stock Bahan Baku
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rekapitulasi persediaan stock awal, barang masuk, barang keluar, dan stock akhir per periode tanggal.
          </p>
        </div>

        {/* Action Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4 text-rose-200" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Cetak / Print</span>
          </button>
        </div>
      </div>

      {/* Date & Filter Controls (Hidden on print) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4 print:hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Pilih Tanggal Laporan
            </h3>
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setPresetDate('today')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                startDate === todayStr && endDate === todayStr
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => setPresetDate('yesterday')}
              className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            >
              Kemarin
            </button>
            <button
              type="button"
              onClick={() => setPresetDate('week')}
              className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => setPresetDate('month')}
              className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            >
              Bulan Ini
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value > endDate) setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
            />
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
              Cari Nama / ID
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari bahan baku..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-emerald-500 transition-all text-slate-800 font-medium"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
              Kategori
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500 font-semibold cursor-pointer"
            >
              <option value="All">Semua Kategori</option>
              {categories.filter((c) => c !== 'All').map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats Grid (Hidden on print) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Stock Awal</p>
            <p className="text-lg font-black text-slate-800 mt-0.5">{formatIDNumber(totals.stockAwal)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Barang Keluar</p>
            <p className="text-lg font-black text-rose-600 mt-0.5">{formatBarangKeluar(totals.barangKeluar)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Stock Akhir</p>
            <p className="text-lg font-black text-teal-700 mt-0.5">{formatIDNumber(totals.stockAkhir)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* PRINT-ONLY HEADER AND CONTENT (Matching exact official document) */}
      <div className="hidden print:block mb-4 font-serif text-slate-900">
        {/* Kop Surat Header */}
        <div className="flex items-center gap-4 pb-2 border-b-2 border-black">
          <img 
            src={getBadanGiziLogoDataUrl()} 
            alt="Badan Gizi Nasional Logo" 
            className="w-16 h-16 object-contain flex-shrink-0"
          />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">
              BADAN GIZI NASIONAL <span className="font-normal italic text-xs">(NATIONAL NUTRITION AGENCY)</span>
            </h1>
            <h2 className="text-xs font-bold text-slate-900 mt-0.5">
              SPPG PROBOLINGGO KREJENGAN TEMENGGUNGAN
            </h2>
            <p className="text-[11px] font-medium text-slate-800">
              YAYASAN HAFSHAWATY ZAINUL HASAN
            </p>
            <p className="text-[10px] italic text-slate-600">
              Dusun Krajan RT/RW 003/004, Desa Temenggungan, Kec. Krejengan, Kab. Probolinggo
            </p>
          </div>
        </div>
        <div className="border-b border-black mt-[1px] mb-4"></div>

        {/* Document Title */}
        <div className="text-center my-4">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            LAPORAN STOCK OPNAME BAHAN BAKU
          </h2>
          <h3 className="text-xs font-bold uppercase mt-0.5">
            SPPG KREJENGAN TEMENGGUNGAN – YAYASAN HAFSHAWATY
          </h3>
          <p className="text-xs font-medium mt-1">
            Hari & Tanggal: {startDate === endDate 
              ? formatIndonesianDateWithDay(startDate) 
              : `${formatIndonesianDateWithDay(startDate)} s/d ${formatIndonesianDateWithDay(endDate)}`}
          </p>
        </div>
      </div>

      {/* Report Table Card (Screen & Print) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden print:border-none print:shadow-none">
        
        {/* Active Date Banner (Hidden on print) */}
        <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50/80 border-b border-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-black text-emerald-950">
              Periode Laporan: <strong className="text-emerald-700 bg-white/80 px-2 py-0.5 rounded-md border border-emerald-200/60 shadow-2xs ml-1">{dateRangeLabel}</strong>
            </span>
          </div>
          <span className="text-[11px] font-black text-emerald-900 bg-emerald-100/60 px-2.5 py-1 rounded-full border border-emerald-200/60">
            {filteredRows.length} Bahan Baku
          </span>
        </div>

        {/* SCREEN TABLE (Paginated - Modern Elegant Style) */}
        <div className="overflow-x-auto print:hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white text-[11px] font-black uppercase tracking-wider shadow-2xs">
                <th className="py-3.5 px-3 w-12 text-center border-r border-emerald-600/30">No</th>
                <th className="py-3.5 px-4 min-w-[200px] border-r border-emerald-600/30">Nama Bahan Baku</th>
                <th className="py-3.5 px-3 min-w-[80px] text-center border-r border-emerald-600/30">Satuan</th>
                <th className="py-3.5 px-4 min-w-[120px] text-right border-r border-emerald-600/30">Stock Awal</th>
                <th className="py-3.5 px-4 min-w-[120px] text-right border-r border-emerald-600/30">Barang Keluar</th>
                <th className="py-3.5 px-4 min-w-[130px] text-right">Stock Akhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-800 bg-white">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    Tidak ada data bahan baku yang ditemukan untuk periode ini.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => {
                  const itemIndex = (currentPage - 1) * itemsPerPage + index + 1;
                  const isEven = index % 2 === 0;
                  return (
                    <tr 
                      key={row.id} 
                      className={`${isEven ? 'bg-white' : 'bg-slate-50/50'} hover:bg-emerald-50/40 transition-colors group`}
                    >
                      <td className="py-3 px-3 text-center text-slate-400 font-medium text-[11px] border-r border-slate-100">
                        {itemIndex}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-100">
                        <div className="font-bold text-slate-900 group-hover:text-emerald-950 transition-colors">
                          {row.name}
                        </div>
                        {row.category && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            {row.category}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center border-r border-slate-100">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-semibold">
                          {row.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700 font-mono border-r border-slate-100">
                        {formatIDNumber(row.stockAwal)}
                      </td>
                      <td className="py-3 px-4 text-right border-r border-slate-100">
                        {row.barangKeluar > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-rose-700 bg-rose-50 border border-rose-200/80 font-bold px-2.5 py-0.5 rounded-md font-mono text-[11px]">
                            {formatBarangKeluar(row.barangKeluar)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-block font-mono font-extrabold px-3 py-1 rounded-lg text-[11px] shadow-2xs ${
                          row.stockAkhir > 0 
                            ? 'bg-emerald-700 text-white' 
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}>
                          {formatIDNumber(row.stockAkhir)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Screen Table Footer Totals */}
            <tfoot>
              <tr className="bg-slate-900 text-white text-xs font-bold border-t-2 border-slate-800">
                <td className="py-3.5 px-3 text-center text-emerald-400 font-black border-r border-slate-800">TOTAL</td>
                <td className="py-3.5 px-4 font-black text-emerald-300 border-r border-slate-800">
                  Total ({filteredRows.length} Bahan Baku)
                </td>
                <td className="py-3.5 px-3 text-center text-slate-500 border-r border-slate-800">-</td>
                <td className="py-3.5 px-4 text-right font-black font-mono border-r border-slate-800 text-slate-200">
                  {formatIDNumber(totals.stockAwal)}
                </td>
                <td className="py-3.5 px-4 text-right font-black font-mono border-r border-slate-800 text-rose-300">
                  {formatBarangKeluar(totals.barangKeluar)}
                </td>
                <td className="py-3.5 px-4 text-right font-black font-mono text-emerald-300 bg-slate-950/80">
                  {formatIDNumber(totals.stockAkhir)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* PRINT-ONLY TABLE & SIGNATURES (Full rows, matching official screenshot) */}
        <div className="hidden print:block">
          <table className="w-full text-left border-collapse border border-black font-serif text-xs">
            <thead>
              <tr className="bg-white text-black font-bold border-b border-black">
                <th className="py-2 px-1.5 w-10 text-center border border-black">No</th>
                <th className="py-2 px-2 border border-black text-left">Nama Bahan Baku</th>
                <th className="py-2 px-1.5 w-16 text-center border border-black">Satuan</th>
                <th className="py-2 px-2 w-24 text-center border border-black">Stock<br/>Awal</th>
                <th className="py-2 px-2 w-24 text-center border border-black">Barang<br/>Keluar</th>
                <th className="py-2 px-2 w-24 text-center border border-black">Stock<br/>Akhir</th>
              </tr>
            </thead>
            <tbody className="text-black">
              {filteredRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="py-1.5 px-1.5 text-center border border-black">{index + 1}</td>
                  <td className="py-1.5 px-2 border border-black font-medium">{row.name}</td>
                  <td className="py-1.5 px-1.5 text-center border border-black">{row.unit}</td>
                  <td className="py-1.5 px-2 text-right border border-black">{formatIDNumber(row.stockAwal)}</td>
                  <td className="py-1.5 px-2 text-right border border-black">{formatBarangKeluar(row.barangKeluar)}</td>
                  <td className="py-1.5 px-2 text-right border border-black">{formatIDNumber(row.stockAkhir)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50/50 text-xs font-bold text-black">
                <td className="py-2 px-1.5 text-center border border-black font-black">TOTAL</td>
                <td className="py-2 px-2 border border-black font-black">Total ({filteredRows.length} Bahan)</td>
                <td className="py-2 px-1.5 text-center border border-black">-</td>
                <td className="py-2 px-2 text-right border border-black font-black">{formatIDNumber(totals.stockAwal)}</td>
                <td className="py-2 px-2 text-right border border-black font-black">{formatBarangKeluar(totals.barangKeluar)}</td>
                <td className="py-2 px-2 text-right border border-black font-black">{formatIDNumber(totals.stockAkhir)}</td>
              </tr>
            </tfoot>
          </table>

          {/* SIGNATURE BLOCK FOR PRINT */}
          <div className="mt-8 text-black font-serif text-xs">
            <p className="font-bold mb-3">Mengetahui</p>
            <div className="grid grid-cols-3 text-center gap-4">
              <div>
                <p className="font-semibold">Disusun Oleh</p>
                <p className="text-[11px] text-slate-800">Asisten Lapangan</p>
                <div className="h-16"></div>
                <p className="font-bold underline">(Qoidul Muttaqin, M. E)</p>
              </div>
              <div>
                <p className="font-semibold">Diperiksa Oleh</p>
                <p className="text-[11px] text-slate-800">Pengawas Keuangan</p>
                <div className="h-16"></div>
                <p className="font-bold underline">(Muhammad Fadil, S. E)</p>
              </div>
              <div>
                <p className="font-semibold">Disetujui Oleh</p>
                <p className="text-[11px] text-slate-800">Kepala SPPG</p>
                <div className="h-16"></div>
                <p className="font-bold underline">(SRI ROHAYU, S. Pd)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pagination (Hidden on print) */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between print:hidden">
            <span className="text-xs text-slate-500 font-bold">
              Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredRows.length)} dari {filteredRows.length} item
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
