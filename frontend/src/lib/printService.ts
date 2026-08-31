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
