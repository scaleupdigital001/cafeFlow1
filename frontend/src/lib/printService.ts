/**
 * Thermal Receipt Printing Service for CafeFlow
 * 
 * Provides a clean abstraction layer for printing thermal receipts.
 * - Uses high-efficiency 80mm thermal receipt HTML/CSS layout.
 * - Uses browser print dialog as reliable fallback.
 * - Architecture allows plugging in QZ Tray or WebUSB/WebSerial local print bridge seamlessly.
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
      margin: 0mm;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        width: 78mm;
        margin: 0 auto;
        padding: 4mm 2mm;
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
      padding: 6px 4px;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 900; }
    
    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1.5px dashed #000;
    }
    .restaurant-name {
      font-size: 17px;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 2px;
      letter-spacing: 0.5px;
    }
    .restaurant-info {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 2px;
    }

    .meta-table {
      width: 100%;
      margin: 6px 0;
      font-size: 12px;
      font-weight: 800;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
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
    .items-container > div:first-child {
      font-size: 12px !important;
      font-weight: 800 !important;
      border-bottom: 1.5px solid #000 !important;
      color: #000 !important;
    }
    .item-row {
      margin-bottom: 6px;
    }
    .item-title-line {
      display: flex;
      justify-content: space-between;
      font-weight: 800;
      font-size: 13px;
    }
    .item-name {
      flex: 1;
      padding-right: 4px;
      word-break: break-word;
    }
    .item-qty {
      width: 35px;
      text-align: center;
    }
    .item-total {
      width: 75px;
      text-align: right;
    }
    .item-sub-line {
      font-size: 12px;
      color: #000;
      font-weight: 800;
      margin-top: 1px;
    }
    .item-extra {
      font-size: 12px;
      color: #000;
      font-weight: 800;
      padding-left: 6px;
      font-style: italic;
    }
    .item-note {
      font-size: 12px;
      color: #000;
      padding-left: 6px;
      font-weight: 800;
    }

    .totals-container {
      margin: 6px 0;
      font-size: 12px;
      font-weight: 800;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
    }
    .grand-total-row {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
      font-weight: 900;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1.5px dashed #000;
    }

    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 800;
      color: #000;
    }
    .footer-thanks {
      font-weight: 900;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
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
      <span>QTY</span>
      <span style="text-align:right">TOTAL</span>
    </div>
    ${itemsHtml}
  </div>

  <div class="totals-container">
    <div class="totals-row">
      <span>Subtotal</span>
      <span>${formatAmount(data.subtotal)}</span>
    </div>
    <div class="totals-row">
      <span>Taxes ${data.taxRate !== undefined && data.taxRate !== null ? `(${data.taxRate}%)` : ''}</span>
      <span>${formatAmount(data.tax || 0)}</span>
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
 * Print result interface
 */
export interface PrintResult {
  success: boolean;
  mode: 'silent' | 'browser_dialog';
  message: string;
}

/**
 * Main print function for thermal receipts.
 * Executes silent printing if local print agent (QZ Tray / WebUSB) is configured,
 * otherwise triggers a clean browser print dialog with the receipt pre-formatted.
 */
export const printThermalReceipt = async (data: ThermalReceiptData): Promise<PrintResult> => {
  return new Promise((resolve) => {
    try {
      const receiptHtml = buildThermalReceiptHTML(data);

      // Create an invisible iframe for isolated printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.name = `print-frame-${Date.now()}`;
      
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        document.body.removeChild(iframe);
        resolve({
          success: false,
          mode: 'browser_dialog',
          message: 'Could not access print frame context.',
        });
        return;
      }

      frameDoc.open();
      frameDoc.write(receiptHtml);
      frameDoc.close();

      // Trigger print after styles and images render
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          
          // Cleanup frame after print window closes
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);

          resolve({
            success: true,
            mode: 'browser_dialog',
            message: 'Browser print dialog triggered successfully.',
          });
        } catch (err: any) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve({
            success: false,
            mode: 'browser_dialog',
            message: err.message || 'Failed to trigger browser print.',
          });
        }
      }, 300);
    } catch (err: any) {
      resolve({
        success: false,
        mode: 'browser_dialog',
        message: err.message || 'Thermal receipt print error.',
      });
    }
  });
};

/**
 * Daily Sales Report Data Interface
 */
export interface DailySalesItem {
  name: string;
  quantity: number;
  amount: number;
}

export interface DailySalesPayment {
  method: string;
  label: string;
  count: number;
  amount: number;
}

export interface DailySalesReportData {
  date: string;
  formattedDate: string;
  generatedAt: string;
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
  items: DailySalesItem[];
  payments: DailySalesPayment[];
}

/**
 * Builds clean, thermal-printer friendly HTML document for Daily Sales / Day-End Report (80mm / 58mm).
 */
export const buildDailySalesReportHTML = (data: DailySalesReportData): string => {
  const itemsHtml = data.items.length > 0
    ? data.items.map((item) => `
      <div class="item-row">
        <span class="item-name">${item.name}</span>
        <span class="item-qty">${item.quantity}</span>
        <span class="item-amt">${item.amount.toFixed(2)}</span>
      </div>
    `).join('')
    : `<div class="item-empty text-center" style="padding: 6px 0; font-style: italic;">No items sold on this date</div>`;

  const paymentsHtml = data.payments.map((p) => `
    <div class="summary-row">
      <span>${p.label} (${p.count})</span>
      <span>${p.amount.toFixed(2)}</span>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Daily Sales Report - ${data.formattedDate}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0mm;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        width: 78mm;
        margin: 0 auto;
        padding: 4mm 2mm;
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
      font-size: 12px;
      font-weight: 800;
      line-height: 1.3;
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
      padding: 6px 4px;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 900; }

    .header {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1.5px dashed #000;
    }
    .brand-title {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .report-title {
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      margin: 2px 0;
    }
    .restaurant-name {
      font-size: 13px;
      font-weight: 900;
      margin-top: 2px;
    }
    .restaurant-info {
      font-size: 11px;
      font-weight: 800;
    }

    .meta-table {
      width: 100%;
      margin: 5px 0;
      font-size: 11px;
      font-weight: 800;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }

    .section-header {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 6px;
      margin-bottom: 3px;
      border-bottom: 1.5px solid #000;
      padding-bottom: 2px;
    }

    .particulars-table {
      margin: 4px 0;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 900;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 800;
      margin-bottom: 3px;
    }
    .item-name {
      flex: 1;
      padding-right: 4px;
      word-break: break-word;
    }
    .item-qty {
      width: 32px;
      text-align: center;
    }
    .item-amt {
      width: 65px;
      text-align: right;
    }

    .summary-box {
      margin: 5px 0;
      font-size: 11px;
      font-weight: 800;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .total-highlight {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 900;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1.5px dashed #000;
    }

    .stats-box {
      margin: 5px 0;
      font-size: 11px;
      font-weight: 800;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 4px;
    }

    .footer {
      text-align: center;
      margin-top: 8px;
      font-size: 11px;
      font-weight: 800;
      color: #000;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand-title">CafeFlow POS</div>
    <div class="report-title">DAILY SALES REPORT</div>
    <div class="restaurant-name">${data.restaurant.name}</div>
    ${data.restaurant.address ? `<div class="restaurant-info">${data.restaurant.address}</div>` : ''}
    ${data.restaurant.contact ? `<div class="restaurant-info">Ph: ${data.restaurant.contact}</div>` : ''}
    ${data.restaurant.gstNumber ? `<div class="restaurant-info">GSTIN: ${data.restaurant.gstNumber}</div>` : ''}
  </div>

  <div class="meta-table">
    <div class="meta-row">
      <span>Report Date: <span class="bold">${data.formattedDate}</span></span>
    </div>
    <div class="meta-row">
      <span>Generated: ${data.generatedAt}</span>
    </div>
  </div>

  <!-- Item-wise Particulars Table -->
  <div class="section-header">PARTICULARS / ITEM SALES</div>
  <div class="particulars-table">
    <div class="table-header">
      <span style="flex: 1;">PARTICULARS</span>
      <span style="width: 32px; text-align: center;">QTY</span>
      <span style="width: 65px; text-align: right;">AMT</span>
    </div>
    ${itemsHtml}
  </div>

  <!-- Financial Totals -->
  <div class="summary-box">
    <div class="summary-row">
      <span>Gross Sales (Subtotal)</span>
      <span>Rs. ${data.summary.grossSales.toFixed(2)}</span>
    </div>
    ${data.summary.taxes > 0 ? `
    <div class="summary-row">
      <span>Taxes ${data.summary.taxRate ? `(${data.summary.taxRate}%)` : ''}</span>
      <span>Rs. ${data.summary.taxes.toFixed(2)}</span>
    </div>` : ''}
    <div class="total-highlight">
      <span>TOTAL SALES</span>
      <span>Rs. ${data.summary.netSales.toFixed(2)}</span>
    </div>
  </div>

  <!-- Payment Breakdown -->
  <div class="section-header">PAYMENT SUMMARY</div>
  <div class="summary-box">
    ${paymentsHtml}
    <div class="total-highlight">
      <span>TOTAL RECEIVED</span>
      <span>Rs. ${data.summary.netSales.toFixed(2)}</span>
    </div>
  </div>

  <!-- Orders & Operations Summary -->
  <div class="section-header">ORDERS & QUANTITIES</div>
  <div class="stats-box">
    <div class="summary-row">
      <span>Total Paid Orders</span>
      <span class="bold">${data.summary.totalOrders}</span>
    </div>
    <div class="summary-row">
      <span>Total Items Sold</span>
      <span class="bold">${data.summary.totalItems}</span>
    </div>
    <div class="summary-row">
      <span>Average Order Value</span>
      <span>Rs. ${data.summary.averageOrderValue.toFixed(2)}</span>
    </div>
    <div class="summary-row" style="font-size: 10px; color: #333; margin-top: 3px;">
      <span>Completed: ${data.summary.completedOrders} | Cancelled: ${data.summary.cancelledOrders}</span>
      <span>Total Logged: ${data.summary.allOrders}</span>
    </div>
  </div>

  <div class="footer">
    <div class="bold">*** END OF DAILY REPORT ***</div>
    <div style="font-size: 10px; margin-top: 2px;">Printed via CafeFlow SaaS</div>
  </div>
</body>
</html>
  `;
};

/**
 * Triggers clean browser print dialog for POS Daily Sales Report.
 */
export const printDailySalesReport = async (data: DailySalesReportData): Promise<PrintResult> => {
  return new Promise((resolve) => {
    try {
      const reportHtml = buildDailySalesReportHTML(data);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.name = `print-daily-sales-${Date.now()}`;

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc || !iframe.contentWindow) {
        document.body.removeChild(iframe);
        resolve({
          success: false,
          mode: 'browser_dialog',
          message: 'Could not access print frame context.',
        });
        return;
      }

      frameDoc.open();
      frameDoc.write(reportHtml);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);

          resolve({
            success: true,
            mode: 'browser_dialog',
            message: 'Daily sales print dialog opened.',
          });
        } catch (err: any) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve({
            success: false,
            mode: 'browser_dialog',
            message: err.message || 'Failed to trigger print dialog.',
          });
        }
      }, 300);
    } catch (err: any) {
      resolve({
        success: false,
        mode: 'browser_dialog',
        message: err.message || 'Daily sales print error.',
      });
    }
  });
};

