/**
 * Thermal Receipt Printing Service for CafeFlow
 * 
 * Provides a clean abstraction layer for printing thermal receipts.
 * - Supports Epson POS ESC/POS hardware paper feed & cut commands (GS V 66 0).
 * - Executes sequential dual-copy receipt printing (CUSTOMER COPY -> CUT -> MERCHANT COPY -> CUT).
 * - Implements copy-level failure handling & independent retry functionality.
 */

export interface ThermalReceiptItem {
  name: string;
  quantity: number;
  price: number; // base or unit price
  customizations?: {
    name: string;
    selectedOption: string;
    extraPrice: number;
  }[];
  specialInstructions?: string;
}

export interface ThermalReceiptData {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantContact?: string;
  gstNumber?: string;
  billNumber: string;
  date: string;
  tableNumber: string;
  customerName: string;
  customerPhone?: string;
  items: ThermalReceiptItem[];
  subtotal: number;
  tax: number;
  taxRate?: number;
  totalAmount: number;
  paymentStatus?: string;
  paymentMethod?: string;
  copyLabel?: string;
}

/**
 * Format currency amount for thermal receipt
 */
const formatAmount = (amount: number): string => {
  return `Rs. ${amount.toFixed(2)}`;
};

/**
 * Builds clean, thermal-printer friendly HTML document optimized for 80mm / 58mm paper.
 */
export const buildThermalReceiptHTML = (data: ThermalReceiptData): string => {
  const formattedDate = data.date ? new Date(data.date).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const labelText = data.copyLabel || 'CUSTOMER COPY';

  const itemsHtml = data.items.map((item) => {
    const extraPrice = item.customizations
      ? item.customizations.reduce((sum, c) => sum + (c.extraPrice || 0), 0)
      : 0;
    const unitPrice = item.price + extraPrice;
    const lineTotal = unitPrice * item.quantity;

    let custHtml = '';
    if (item.customizations && item.customizations.length > 0) {
      const custText = item.customizations
        .map((c) => `${c.name}: ${c.selectedOption}${c.extraPrice ? ` (+${c.extraPrice})` : ''}`)
        .join(', ');
      custHtml = `<div class="item-extra">+ ${custText}</div>`;
    }

    let noteHtml = '';
    if (item.specialInstructions) {
      noteHtml = `<div class="item-note">* Note: ${item.specialInstructions}</div>`;
    }

    return `
      <div class="item-row">
        <div class="item-title-line">
          <span class="item-name">${item.name}</span>
          <span class="item-qty">x${item.quantity}</span>
          <span class="item-total">${formatAmount(lineTotal)}</span>
        </div>
        <div class="item-sub-line">
          <span>@ ${formatAmount(unitPrice)} each</span>
        </div>
        ${custHtml}
        ${noteHtml}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt - ${data.billNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 3mm 2mm;
    }
    @media print {
      html, body {
        width: 74mm !important;
        max-width: 74mm !important;
        margin: 0 auto !important;
        padding: 2mm 2mm !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, 'Helvetica Neue', Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.35;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      -webkit-font-smoothing: none;
      -webkit-text-stroke: 0.35px #000;
      text-rendering: optimizeLegibility;
      width: 78mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 3mm;
      overflow-x: hidden;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 900; }
    
    .copy-banner {
      text-align: center;
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 3px 0;
      margin-bottom: 4px;
      border-bottom: 2px solid #000;
      page-break-inside: avoid;
    }

    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1.5px dashed #000;
      page-break-inside: avoid;
    }
    .restaurant-name {
      font-size: 17px;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 2px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      letter-spacing: 0.5px;
    }
    .restaurant-info {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 2px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .meta-table {
      width: 100%;
      margin: 6px 0;
      font-size: 12px;
      font-weight: 800;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
      page-break-inside: avoid;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }

    .items-container {
      margin: 6px 0;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 6px;
    }
    .item-row {
      margin-bottom: 6px;
      page-break-inside: avoid;
    }
    .item-title-line {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-weight: 900;
      font-size: 13px;
      width: 100%;
    }
    .item-name {
      flex: 1;
      padding-right: 4px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-word;
      white-space: normal;
    }
    .item-qty {
      width: 32px;
      text-align: center;
      flex-shrink: 0;
      font-weight: 900;
    }
    .item-total {
      width: 80px;
      text-align: right;
      flex-shrink: 0;
      white-space: nowrap;
      font-weight: 900;
    }
    .item-sub-line {
      font-size: 11.5px;
      color: #000;
      font-weight: 800;
      margin-top: 1px;
    }
    .item-extra {
      font-size: 11.5px;
      color: #000;
      font-weight: 800;
      padding-left: 6px;
      font-style: italic;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .item-note {
      font-size: 11.5px;
      color: #000;
      padding-left: 6px;
      font-weight: 900;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .totals-container {
      margin: 6px 0;
      font-size: 12px;
      font-weight: 800;
      border-bottom: 2px double #000;
      padding-bottom: 6px;
      page-break-inside: avoid;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
      width: 100%;
    }
    .grand-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: bold;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dashed #000;
      width: 100%;
    }

    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 10px;
      page-break-inside: avoid;
    }
    .footer-thanks {
      font-weight: bold;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <div class="copy-banner">*** ${labelText} ***</div>

  <div class="header">
    <div class="restaurant-name">${data.restaurantName}</div>
    ${data.restaurantAddress ? `<div class="restaurant-info">${data.restaurantAddress}</div>` : ''}
    ${data.restaurantContact ? `<div class="restaurant-info">Ph: ${data.restaurantContact}</div>` : ''}
    ${data.gstNumber ? `<div class="restaurant-info">GSTIN: ${data.gstNumber}</div>` : ''}
  </div>

  <div class="meta-table">
    <div class="meta-row">
      <span>Bill #: <span class="bold">${data.billNumber}</span></span>
      <span>Table: <span class="bold">T-${data.tableNumber}</span></span>
    </div>
    <div class="meta-row">
      <span>Date: ${formattedDate}</span>
    </div>
    <div class="meta-row">
      <span>Customer: ${data.customerName || 'Guest'}</span>
      ${data.customerPhone ? `<span>Ph: ${data.customerPhone}</span>` : ''}
    </div>
  </div>

  <div class="items-container">
    <div style="display:flex; justify-content:space-between; font-weight:900; font-size:12px; border-bottom:1.5px solid #000; padding-bottom:3px; margin-bottom:6px; color:#000;">
      <span>ITEM</span>
      <span style="width:32px; text-align:center;">QTY</span>
      <span style="width:80px; text-align:right;">TOTAL</span>
    </div>
    ${itemsHtml}
  </div>

  <div class="totals-container">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>${formatAmount(data.subtotal)}</span>
    </div>
    <div class="totals-row">
      <span>Taxes ${data.taxRate ? `(${data.taxRate}%)` : ''}</span>
      <span>${formatAmount(data.tax)}</span>
    </div>
    <div class="grand-total-row">
      <span>GRAND TOTAL</span>
      <span>${formatAmount(data.totalAmount)}</span>
    </div>
    ${data.paymentMethod ? `
    <div class="totals-row" style="margin-top:4px; font-size:12px; font-weight:900;">
      <span>Payment Status</span>
      <span class="bold" style="text-transform:uppercase">${data.paymentStatus || 'Paid'} (${data.paymentMethod === 'cash' ? 'CASH' : 'UPI'})</span>
    </div>` : ''}
  </div>

  <div class="footer">
    <div class="footer-thanks">*** THANK YOU FOR YOUR VISIT ***</div>
    <div>Powered by CafeFlow POS</div>
  </div>
</body>
</html>
  `;
};

/**
 * Builds raw ESC/POS command byte array for Epson POS hardware receipt printers.
 * Specially engineered for 80mm thermal receipt printers (Font A: 48 chars/line, 44-col safe printable area).
 * Enforces hardware cut: GS V 66 3 (0x1D 0x56 0x42 0x03 - Feed 3 lines & Cut).
 */
export const buildEpsonEscPosBytes = (data: ThermalReceiptData, copyLabel?: string): Uint8Array => {
  const bytes: number[] = [];
  const textEncoder = new TextEncoder();

  const addText = (str: string) => {
    const encoded = textEncoder.encode(str);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  // 1. ESC @ - Initialize Printer
  bytes.push(0x1B, 0x40);

  // 2. ESC 7 - Set Heat Density & Heating Time (Heat dots = 288, max heat density)
  bytes.push(0x1B, 0x37, 0x07, 0xF0, 0x02);

  // 3. ESC M 0 - Select Font A (48 characters/line)
  bytes.push(0x1B, 0x4D, 0x00);

  // 4. ESC t 0 - Select Character Code Page CP437
  bytes.push(0x1B, 0x74, 0x00);

  const LINE_WIDTH = 42;
  const DASH_LINE = '-'.repeat(LINE_WIDTH) + '\n';
  const DOUBLE_LINE = '='.repeat(LINE_WIDTH) + '\n';

  // Helper to wrap text into lines of at most LINE_WIDTH chars
  const addWrappedText = (str: string) => {
    if (str.length <= LINE_WIDTH) {
      addText(`${str}\n`);
      return;
    }
    const words = str.split(' ');
    let currentLine = '';
    for (const w of words) {
      if ((currentLine + (currentLine ? ' ' : '') + w).length <= LINE_WIDTH) {
        currentLine += (currentLine ? ' ' : '') + w;
      } else {
        if (currentLine) addText(`${currentLine}\n`);
        currentLine = w.length > LINE_WIDTH ? w.substring(0, LINE_WIDTH) : w;
      }
    }
    if (currentLine) addText(`${currentLine}\n`);
  };

  // 5. Banner Copy Label
  const label = copyLabel || data.copyLabel || 'CUSTOMER COPY';
  bytes.push(0x1B, 0x61, 0x01); // Center Align
  bytes.push(0x1B, 0x45, 0x01); // Bold On
  addText(`*** ${label.toUpperCase()} ***\n\n`);

  // 6. Restaurant Header
  bytes.push(0x1D, 0x21, 0x01); // Double Height
  addWrappedText(data.restaurantName.toUpperCase());
  bytes.push(0x1D, 0x21, 0x00); // Normal Size
  bytes.push(0x1B, 0x45, 0x00); // Bold Off

  if (data.restaurantAddress) addWrappedText(data.restaurantAddress);
  if (data.restaurantContact) addWrappedText(`Ph: ${data.restaurantContact}`);
  if (data.gstNumber) addWrappedText(`GSTIN: ${data.gstNumber}`);
  addText(DASH_LINE);

  // 7. Metadata (Left Align)
  bytes.push(0x1B, 0x61, 0x00); // Left Align
  const billStr = `Bill #: ${data.billNumber}`;
  const tblStr = `Table: T-${data.tableNumber}`;
  const billMeta = billStr.padEnd(24, ' ') + tblStr.padStart(18, ' ');
  addText(`${billMeta}\n`);
  addWrappedText(`Date: ${new Date(data.date || Date.now()).toLocaleString()}`);
  addWrappedText(`Customer: ${data.customerName || 'Guest'}`);
  addText(DASH_LINE);

  // 8. Items Header (Deterministic 42-col table: ITEM=22, QTY=5, TOTAL=15)
  bytes.push(0x1B, 0x45, 0x01); // Bold On
  const headerCol = 'ITEM'.padEnd(22, ' ') + 'QTY'.padStart(5, ' ') + 'TOTAL'.padStart(15, ' ');
  addText(`${headerCol}\n`);
  bytes.push(0x1B, 0x45, 0x00); // Bold Off
  addText(DASH_LINE);

  // 9. Items Loop
  data.items.forEach((item) => {
    const extra = item.customizations ? item.customizations.reduce((s, c) => s + (c.extraPrice || 0), 0) : 0;
    const unitPrice = item.price + extra;
    const lineTotal = unitPrice * item.quantity;
    
    // Intelligently wrap/truncate item name to 22 chars
    const itemName = item.name.length > 22 ? item.name.substring(0, 22) : item.name.padEnd(22, ' ');
    const qtyStr = `x${item.quantity}`.padStart(5, ' ');
    const totalStr = `Rs.${lineTotal.toFixed(2)}`.padStart(15, ' ');
    
    addText(`${itemName}${qtyStr}${totalStr}\n`);
    addWrappedText(`  @ Rs.${unitPrice.toFixed(2)} each`);

    if (item.customizations && item.customizations.length > 0) {
      const custStr = item.customizations.map((c) => `${c.name}: ${c.selectedOption}`).join(', ');
      addWrappedText(`  + ${custStr}`);
    }
    if (item.specialInstructions) {
      addWrappedText(`  * Note: ${item.specialInstructions}`);
    }
  });

  addText(DASH_LINE);

  // 10. Totals Section
  const formatTotalRow = (labelStr: string, val: number): string => {
    const valStr = `Rs.${val.toFixed(2)}`;
    const labelPadded = labelStr.padEnd(24, ' ');
    const valPadded = valStr.padStart(18, ' ');
    return `${labelPadded}${valPadded}\n`;
  };

  addText(formatTotalRow('Subtotal:', data.subtotal));
  addText(formatTotalRow(`Taxes (${data.taxRate || 5}%):`, data.tax));
  addText(DASH_LINE);

  // Grand Total (Bold)
  bytes.push(0x1B, 0x45, 0x01); // Bold On
  const grandTotalValStr = `Rs.${data.totalAmount.toFixed(2)}`;
  addText('GRAND TOTAL:'.padEnd(22, ' ') + grandTotalValStr.padStart(20, ' ') + '\n');

  if (data.paymentMethod) {
    addText(`Payment: ${(data.paymentStatus || 'PAID').toUpperCase()} (${data.paymentMethod.toUpperCase()})\n`);
  }
  bytes.push(0x1B, 0x45, 0x00); // Bold Off
  addText(DOUBLE_LINE);

  // 11. Footer & Feed & Hardware Cut
  bytes.push(0x1B, 0x61, 0x01); // Center Align
  addText('*** THANK YOU FOR YOUR VISIT ***\n');
  addText('Powered by CafeFlow POS\n\n');

  // ESC d 3 (Feed 3 lines) + GS V 66 3 (Feed 3 lines & Partial Cut)
  bytes.push(0x1B, 0x64, 0x03);
  bytes.push(0x1D, 0x56, 0x42, 0x03);

  return new Uint8Array(bytes);
};

/**
 * Print result interface
 */
export interface PrintResult {
  success: boolean;
  mode: 'silent' | 'browser_dialog';
  message: string;
}

/**
 * Dual print result interface for sequence tracking
 */
export interface DualPrintResult {
  success: boolean;
  copy1Success: boolean;
  copy2Success: boolean;
  message: string;
}

/**
 * Prints a single receipt copy with a specific label banner (e.g. CUSTOMER COPY vs MERCHANT COPY).
 */
export const printSingleCopy = async (
  data: ThermalReceiptData,
  copyLabel: string = 'CUSTOMER COPY'
): Promise<PrintResult> => {
  return new Promise((resolve) => {
    try {
      const copyData = { ...data, copyLabel };
      const receiptHtml = buildThermalReceiptHTML(copyData);

      // Create an isolated iframe for clean single-job printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.name = `print-frame-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve({
          success: false,
          mode: 'browser_dialog',
          message: `Could not access frame context for ${copyLabel}.`,
        });
        return;
      }

      frameDoc.open();
      frameDoc.write(receiptHtml);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2500);

          resolve({
            success: true,
            mode: 'browser_dialog',
            message: `${copyLabel} dispatched successfully.`,
          });
        } catch (err: any) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve({
            success: false,
            mode: 'browser_dialog',
            message: err.message || `Failed to print ${copyLabel}.`,
          });
        }
      }, 350);
    } catch (err: any) {
      resolve({
        success: false,
        mode: 'browser_dialog',
        message: err.message || `Print error on ${copyLabel}.`,
      });
    }
  });
};

/**
 * Main dual-copy printing engine for Epson POS receipts.
 * Strictly executes:
 * 1. PRINT COPY 1 (CUSTOMER COPY) -> FEED & CUT
 * 2. Inter-job delay (800ms)
 * 3. PRINT COPY 2 (MERCHANT COPY) -> FEED & CUT
 * 
 * Returns detailed copy-level status for failure tracking and copy-2 retry!
 */
export const printDualThermalReceipt = async (data: ThermalReceiptData): Promise<DualPrintResult> => {
  // Step 1: Execute Copy 1 (Customer Copy)
  const res1 = await printSingleCopy(data, 'CUSTOMER COPY');
  if (!res1.success) {
    return {
      success: false,
      copy1Success: false,
      copy2Success: false,
      message: `Customer Copy print failed: ${res1.message}`,
    };
  }

  // Inter-job delay (800ms) to allow paper feed and printer hardware cutter cycle
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Step 2: Execute Copy 2 (Merchant Copy)
  const res2 = await printSingleCopy(data, 'MERCHANT COPY');
  if (!res2.success) {
    return {
      success: false,
      copy1Success: true,
      copy2Success: false,
      message: 'Customer Copy printed successfully. Merchant Copy failed to print.',
    };
  }

  return {
    success: true,
    copy1Success: true,
    copy2Success: true,
    message: 'Both Customer Copy and Merchant Copy printed and cut successfully.',
  };
};

/**
 * Fallback backward-compatible single print function
 */
export const printThermalReceipt = async (data: ThermalReceiptData): Promise<PrintResult> => {
  return printSingleCopy(data, data.copyLabel || 'CUSTOMER COPY');
};

export interface DailySalesReportData {
  date?: string;
  formattedDate?: string;
  generatedAt?: string;
  restaurant: {
    name: string;
    address?: string;
    contact?: string;
    gstNumber?: string;
    taxRate?: number;
  };
  summary: {
    grossSales: number;
    taxes: number;
    taxRate?: number;
    netSales: number;
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    allOrders: number;
    totalItems: number;
    averageOrderValue: number;
  };
  items: {
    name: string;
    quantity: number;
    amount: number;
    isAdjusted?: boolean;
    originalQty?: number;
    adjustedByName?: string;
    adjustedAt?: string;
    reason?: string;
  }[];
  payments: {
    method: string;
    label: string;
    count: number;
    amount: number;
  }[];
  adjustments?: any[];
  // Legacy / fallback fields
  restaurantName?: string;
  startDate?: string;
  endDate?: string;
  totalOrders?: number;
  totalRevenue?: number;
  totalTax?: number;
}

/**
 * Helper to format a Date into "DD MMM YYYY" (e.g., "26 Aug 2026")
 */
export const formatDateToDDMMMYYYY = (dateInput?: string | Date): string => {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

/**
 * Formats report date range into "DD MMM YYYY to DD MMM YYYY"
 * If single-day report, duplicates date to guarantee "26 Aug 2026 to 26 Aug 2026"
 */
export const formatReportDateRangeText = (data: DailySalesReportData): string => {
  if (data.startDate && data.endDate) {
    return `${formatDateToDDMMMYYYY(data.startDate)} to ${formatDateToDDMMMYYYY(data.endDate)}`;
  }
  const dateStr = data.date || data.formattedDate || new Date().toISOString().split('T')[0];
  const formatted = formatDateToDDMMMYYYY(dateStr);
  return `${formatted} to ${formatted}`;
};

/**
 * Formats footer print timestamp as "DD-MMM-YYYY, HH:mm" (e.g. "26-Aug-2026, 21:08")
 */
export const formatFooterPrintTimestamp = (d: Date = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year}, ${hours}:${mins}`;
};

/**
 * Builds HTML report template for Daily Sales Report matching exact layout specification.
 * Enforces heavy bold fonts (font-weight: 900 !important) everywhere for crisp thermal printing.
 */
export const buildDailySalesReportHTML = (data: DailySalesReportData): string => {
  const restName = data.restaurant?.name || data.restaurantName || 'CafeFlow Restaurant';
  const dateRangeText = formatReportDateRangeText(data);
  const timestampText = formatFooterPrintTimestamp();

  // Sequence number formatting (e.g. SEQ-20260826-0001)
  const cleanDateStr = (data.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const sequenceNumber = `SEQ-${cleanDateStr}-0001`;

  // Sort items ALPHABETICALLY by item name
  const sortedItems = [...(data.items || [])].sort((a, b) => a.name.localeCompare(b.name));

  // Compute Total line amount summing all line amounts
  const totalLineAmount = sortedItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  const itemsHtml = sortedItems.map((item) => `
    <div class="item-row">
      <span class="col-particulars">${item.name}${item.isAdjusted ? ' <small style="font-size:10px; font-weight:900;">[ADJUSTED]</small>' : ''}</span>
      <span class="col-qty">${item.quantity}</span>
      <span class="col-amt">Rs. ${item.amount.toFixed(2)}</span>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sale Report - ${dateRangeText}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 2mm 2mm;
    }
    @media print {
      html, body {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 auto !important;
        padding: 1mm 1mm !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
      font-weight: 900 !important;
      color: #000 !important;
      -webkit-font-smoothing: none !important;
      -webkit-text-stroke: 0.4px #000 !important;
      text-rendering: optimizeLegibility !important;
    }
    html, body, div, span, p, h1, h2, h3, header, footer {
      font-weight: 900 !important;
      color: #000 !important;
      -webkit-text-stroke: 0.4px #000 !important;
    }
    body {
      width: 78mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 3mm 2mm;
      background: #fff;
    }
    .text-center { text-align: center !important; }
    .text-right { text-align: right !important; }
    .text-left { text-align: left !important; }

    .header-box {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 2px solid #000;
    }
    .restaurant-title {
      font-size: 15px;
      font-weight: 900 !important;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .report-title {
      font-size: 18px;
      font-weight: 900 !important;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 2px 0;
    }
    .date-range-text {
      font-size: 12.5px;
      font-weight: 900 !important;
      margin-top: 2px;
    }

    .table-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 900 !important;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 4px 0;
      margin: 6px 0 4px 0;
      text-transform: uppercase;
    }

    .items-container {
      margin: 4px 0;
    }

    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 12.5px;
      font-weight: 900 !important;
      padding: 4px 0;
      border-bottom: 1px dashed #666;
      page-break-inside: avoid;
    }

    .col-particulars {
      flex: 1;
      padding-right: 6px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-word;
      font-weight: 900 !important;
    }
    .col-qty {
      width: 42px;
      text-align: center;
      flex-shrink: 0;
      font-weight: 900 !important;
    }
    .col-amt {
      width: 80px;
      text-align: right;
      flex-shrink: 0;
      white-space: nowrap;
      font-weight: 900 !important;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 15px;
      font-weight: 900 !important;
      border-top: 2px solid #000;
      border-bottom: 3px double #000;
      padding: 6px 0;
      margin: 8px 0 10px 0;
      text-transform: uppercase;
    }

    .footer-box {
      text-align: center;
      border-top: 1px dashed #000;
      padding-top: 6px;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 900 !important;
    }
    .footer-line {
      margin-bottom: 2px;
      font-weight: 900 !important;
    }
  </style>
</head>
<body>
  <div class="header-box">
    ${restName ? `<div class="restaurant-title">${restName}</div>` : ''}
    <div class="report-title">Sale Report</div>
    <div class="date-range-text">${dateRangeText}</div>
  </div>

  <div class="table-header-row">
    <span class="col-particulars">PARTICULARS</span>
    <span class="col-qty">QTY</span>
    <span class="col-amt">AMT</span>
  </div>

  <div class="items-container">
    ${sortedItems.length === 0 ? '<div class="item-row"><span class="col-particulars">No items sold</span></div>' : itemsHtml}
  </div>

  <div class="total-row">
    <span>Total:</span>
    <span>Rs. ${totalLineAmount.toFixed(2)}</span>
  </div>

  <div class="footer-box">
    <div class="footer-line">Printed: ${timestampText}</div>
    <div class="footer-line">Seq #: ${sequenceNumber}</div>
  </div>
</body>
</html>
  `;
};

export const printDailySalesReport = async (data: DailySalesReportData): Promise<PrintResult> => {
  return new Promise((resolve) => {
    try {
      const htmlContent = buildDailySalesReportHTML(data);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.name = `print-daily-report-${Date.now()}`;

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve({
          success: false,
          mode: 'browser_dialog',
          message: 'Could not access frame context for Daily Sales Report print.',
        });
        return;
      }

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2500);

          resolve({
            success: true,
            mode: 'browser_dialog',
            message: 'Daily Sales Report dispatched to printer.',
          });
        } catch (err: any) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve({
            success: false,
            mode: 'browser_dialog',
            message: err.message || 'Failed to print Daily Sales Report.',
          });
        }
      }, 350);
    } catch (err: any) {
      resolve({
        success: false,
        mode: 'browser_dialog',
        message: err.message || 'Print error on Daily Sales Report.',
      });
    }
  });
};

export interface QuickTicketPrintData {
  restaurantName?: string;
  ticketNumber: string;
  tableNumber: string;
  createdAt?: string;
  items: {
    name: string;
    quantity: number;
    notes?: string;
  }[];
}

/**
 * Builds kitchen-optimized thermal HTML markup for Kitchen Order Tickets (KOT / QT).
 * Features large legible fonts for quantities & dish names, table banner, and excludes billing prices.
 */
export const buildQuickTicketHTML = (data: QuickTicketPrintData): string => {
  const formattedTime = data.createdAt ? new Date(data.createdAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const itemsHtml = (data.items || []).map((item) => {
    let noteHtml = '';
    if (item.notes) {
      noteHtml = `<div class="item-notes">* Note: ${item.notes}</div>`;
    }

    return `
      <div class="item-row">
        <div class="item-main">
          <span class="item-qty">x${item.quantity}</span>
          <span class="item-name">${item.name}</span>
        </div>
        ${noteHtml}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KOT - ${data.ticketNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 2mm 2mm;
    }
    @media print {
      html, body {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 auto !important;
        padding: 1mm 1mm !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.3;
      color: #000;
      background: #fff;
      width: 78mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 3mm 2mm;
    }
    .text-center { text-align: center; }
    .bold { font-weight: 900; }
    
    .kot-banner {
      text-align: center;
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 4px 0;
      margin-bottom: 4px;
      border-bottom: 2px solid #000;
      border-top: 2px solid #000;
    }

    .restaurant-name {
      font-size: 15px;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .table-display {
      text-align: center;
      font-size: 24px;
      font-weight: 900;
      margin: 6px 0;
      padding: 5px 0;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      background: #f0f0f0;
      text-transform: uppercase;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 800;
      margin: 4px 0 8px 0;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
    }

    .items-header {
      font-size: 13px;
      font-weight: 900;
      border-bottom: 1.5px solid #000;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    .items-container {
      margin: 6px 0;
    }

    .item-row {
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px dashed #bbb;
      page-break-inside: avoid;
    }
    .item-main {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .item-qty {
      font-size: 20px;
      font-weight: 900;
      min-width: 42px;
      background: #000;
      color: #fff;
      text-align: center;
      border-radius: 4px;
      padding: 1px 6px;
      flex-shrink: 0;
    }
    .item-name {
      font-size: 17px;
      font-weight: 900;
      flex: 1;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .item-notes {
      font-size: 12.5px;
      font-weight: 900;
      margin-top: 4px;
      margin-left: 50px;
      padding: 3px 6px;
      border: 1px solid #000;
      background: #fff8e1;
      font-style: italic;
    }

    .footer {
      text-align: center;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 2px solid #000;
      font-size: 11px;
      font-weight: 900;
    }
  </style>
</head>
<body>
  ${data.restaurantName ? `<div class="restaurant-name text-center">${data.restaurantName}</div>` : ''}
  <div class="kot-banner">*** KITCHEN ORDER TICKET ***</div>

  <div class="table-display">TABLE: ${data.tableNumber}</div>

  <div class="meta-row">
    <span>Ticket #: <strong>${data.ticketNumber}</strong></span>
    <span>Time: <strong>${formattedTime}</strong></span>
  </div>

  <div class="items-header">
    <span>QTY & DISH ITEMS</span>
  </div>

  <div class="items-container">
    ${itemsHtml}
  </div>

  <div class="footer">
    <div>*** END OF TICKET ***</div>
    <div style="font-size:9px; margin-top:2px; font-weight:normal;">Powered by CafeFlow POS</div>
  </div>
</body>
</html>
  `;
};

/**
 * Triggers thermal ticket print dialog for a Quick Ticket (KOT / QT).
 */
export const printQuickTicket = async (qt: any, restaurantName?: string): Promise<PrintResult> => {
  return new Promise((resolve) => {
    try {
      const kotData: QuickTicketPrintData = {
        restaurantName: restaurantName || 'CafeFlow Restaurant',
        ticketNumber: qt.ticketNumber || 'QT-0001',
        tableNumber: qt.tableNumber || 'N/A',
        createdAt: qt.createdAt || new Date().toISOString(),
        items: (qt.items || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          notes: item.notes,
        })),
      };

      const htmlContent = buildQuickTicketHTML(kotData);

      // Create isolated print iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.name = `print-kot-${Date.now()}`;

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
        resolve({
          success: false,
          mode: 'browser_dialog',
          message: 'Could not access frame context for KOT print.',
        });
        return;
      }

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2500);

          resolve({
            success: true,
            mode: 'browser_dialog',
            message: `KOT ${kotData.ticketNumber} dispatched to printer.`,
          });
        } catch (err: any) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve({
            success: false,
            mode: 'browser_dialog',
            message: err.message || 'Failed to print KOT.',
          });
        }
      }, 350);
    } catch (err: any) {
      resolve({
        success: false,
        mode: 'browser_dialog',
        message: err.message || 'Print error on KOT.',
      });
    }
  });
};
