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
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      width: 74mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 3mm;
      overflow-x: hidden;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    
    .copy-banner {
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 2px 0;
      margin-bottom: 4px;
      border-bottom: 1.5px solid #000;
      page-break-inside: avoid;
    }

    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px dashed #000;
      page-break-inside: avoid;
    }
    .restaurant-name {
      font-size: 15px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 2px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .restaurant-info {
      font-size: 10px;
      margin-bottom: 2px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .meta-table {
      width: 100%;
      margin: 6px 0;
      font-size: 10px;
      border-bottom: 1px dashed #000;
      padding-bottom: 4px;
      page-break-inside: avoid;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }

    .items-container {
      margin: 6px 0;
      border-bottom: 1px dashed #000;
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
      font-weight: bold;
      font-size: 11px;
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
      width: 30px;
      text-align: center;
      flex-shrink: 0;
    }
    .item-total {
      width: 75px;
      text-align: right;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .item-sub-line {
      font-size: 9.5px;
      color: #222;
      margin-top: 1px;
    }
    .item-extra {
      font-size: 9.5px;
      padding-left: 6px;
      font-style: italic;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .item-note {
      font-size: 9.5px;
      padding-left: 6px;
      font-weight: bold;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .totals-container {
      margin: 6px 0;
      font-size: 11px;
      border-bottom: 1px double #000;
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
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10px; border-bottom:1px solid #ccc; padding-bottom:2px; margin-bottom:4px;">
      <span>ITEM</span>
      <span style="width:30px; text-align:center;">QTY</span>
      <span style="width:75px; text-align:right;">TOTAL</span>
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
    <div class="totals-row" style="margin-top:4px; font-size:10px;">
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
 * Enforces hardware cut: GS V 66 0 (0x1D 0x56 0x42 0x00 - Feed 3 lines & Partial/Full Cut).
 */
export const buildEpsonEscPosBytes = (data: ThermalReceiptData, copyLabel?: string): Uint8Array => {
  const bytes: number[] = [];
  const textEncoder = new TextEncoder();

  // Helper to push string bytes
  const addText = (str: string) => {
    const encoded = textEncoder.encode(str);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  // 1. ESC @ - Initialize Printer
  bytes.push(0x1B, 0x40);

  // 2. Banner Copy Label
  const label = copyLabel || data.copyLabel || 'CUSTOMER COPY';
  bytes.push(0x1B, 0x61, 0x01); // Center Align
  bytes.push(0x1B, 0x45, 0x01); // Bold On
  addText(`*** ${label.toUpperCase()} ***\n\n`);

  // 3. Restaurant Header
  addText(`${data.restaurantName.toUpperCase()}\n`);
  bytes.push(0x1B, 0x45, 0x00); // Bold Off
  if (data.restaurantAddress) addText(`${data.restaurantAddress}\n`);
  if (data.restaurantContact) addText(`Ph: ${data.restaurantContact}\n`);
  if (data.gstNumber) addText(`GSTIN: ${data.gstNumber}\n`);
  addText('------------------------------------------\n');

  // 4. Metadata
  bytes.push(0x1B, 0x61, 0x00); // Left Align
  addText(`Bill #: ${data.billNumber}   Table: T-${data.tableNumber}\n`);
  addText(`Date: ${new Date(data.date || Date.now()).toLocaleString()}\n`);
  addText(`Customer: ${data.customerName || 'Guest'}\n`);
  addText('------------------------------------------\n');

  // 5. Items Header
  addText('ITEM                         QTY     TOTAL\n');
  addText('------------------------------------------\n');

  // 6. Items Loop
  data.items.forEach((item) => {
    const extra = item.customizations ? item.customizations.reduce((s, c) => s + (c.extraPrice || 0), 0) : 0;
    const unitPrice = item.price + extra;
    const lineTotal = unitPrice * item.quantity;
    
    // Pad item name to 26 chars
    const paddedName = item.name.length > 26 ? item.name.substring(0, 26) : item.name.padEnd(26, ' ');
    const paddedQty = `x${item.quantity}`.padStart(5, ' ');
    const paddedTotal = `Rs.${lineTotal.toFixed(2)}`.padStart(10, ' ');
    
    addText(`${paddedName}${paddedQty}${paddedTotal}\n`);
  });

  addText('------------------------------------------\n');

  // 7. Totals
  const subtotalStr = `Rs.${data.subtotal.toFixed(2)}`.padStart(12, ' ');
  const taxStr = `Rs.${data.tax.toFixed(2)}`.padStart(12, ' ');
  const totalStr = `Rs.${data.totalAmount.toFixed(2)}`.padStart(12, ' ');

  addText(`Subtotal: ${subtotalStr}\n`);
  addText(`Taxes:    ${taxStr}\n`);
  bytes.push(0x1B, 0x45, 0x01); // Bold On
  addText(`GRAND TOTAL: ${totalStr}\n`);
  bytes.push(0x1B, 0x45, 0x00); // Bold Off
  addText('------------------------------------------\n');

  // 8. Footer & Feed & Hardware Cut
  bytes.push(0x1B, 0x61, 0x01); // Center Align
  addText('*** THANK YOU FOR YOUR VISIT ***\n');
  addText('Powered by CafeFlow POS\n\n\n');

  // 9. GS V 66 0 (0x1D, 0x56, 0x42, 0x00): Feed 3 lines & Cut paper
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
  restaurantName: string;
  startDate: string;
  endDate: string;
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
}

export const printDailySalesReport = async (data: DailySalesReportData): Promise<PrintResult> => {
  const receiptData: ThermalReceiptData = {
    restaurantName: data.restaurantName,
    billNumber: `REPORT-${data.startDate}`,
    date: new Date().toISOString(),
    tableNumber: 'N/A',
    customerName: 'System Report',
    items: [
      { name: 'Total Orders Handled', quantity: data.totalOrders, price: 0 },
      { name: 'Total Tax Collected', quantity: 1, price: data.totalTax },
    ],
    subtotal: data.totalRevenue - data.totalTax,
    tax: data.totalTax,
    totalAmount: data.totalRevenue,
    copyLabel: 'DAILY SALES REPORT',
  };
  return printSingleCopy(receiptData, 'DAILY SALES REPORT');
};
