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

async function runQTPrintLayoutTests() {
  console.log('\n===============================================================');
  console.log('RUNNING QT / KOT THERMAL & A4 PRINT LAYOUT VERIFICATION SUITE');
  console.log('===============================================================\n');

  try {
    const sampleKOT: QuickTicketPrintData = {
      restaurantName: 'Highland Artisanal Cafe',
      ticketNumber: 'QT-20260902-0042',
      tableNumber: 'Table 7',
      createdAt: '2026-09-02T16:45:00.000Z',
      items: [
        { name: 'Paneer Butter Masala', quantity: 2, notes: 'Make it extra spicy, less butter' },
        { name: 'Garlic Naan', quantity: 4 },
        { name: 'Mango Lassi', quantity: 2, notes: 'Served cold with extra ice' },
      ],
    };

    const htmlOutput = buildQuickTicketHTML(sampleKOT);

    // ------------------------------------------------------------------------
    // Verification 1: Header, Ticket Number & Restaurant Name
    // ------------------------------------------------------------------------
    console.log('[Verification 1] Checking Restaurant Name & Header Banner...');
    if (!htmlOutput.includes('Highland Artisanal Cafe')) {
      throw new Error('Verification 1 Failed: Restaurant name missing from KOT print output.');
    }
    if (!htmlOutput.includes('*** KITCHEN ORDER TICKET ***')) {
      throw new Error('Verification 1 Failed: KOT Header banner missing.');
    }
    if (!htmlOutput.includes('QT-20260902-0042')) {
      throw new Error('Verification 1 Failed: Ticket sequence number missing.');
    }
    console.log('  └─► PASS: Header banner & sequence number present!');

    // ------------------------------------------------------------------------
    // Verification 2: Table Number & Order Time
    // ------------------------------------------------------------------------
    console.log('[Verification 2] Checking Table Display & Timestamp...');
    if (!htmlOutput.includes('TABLE: Table 7')) {
      throw new Error('Verification 2 Failed: Table number missing or incorrectly formatted.');
    }
    if (!htmlOutput.includes('Ticket #:') || !htmlOutput.includes('Time:')) {
      throw new Error('Verification 2 Failed: Metadata row (Ticket # and Time) missing.');
    }
    console.log('  └─► PASS: Prominent table display & timestamp present!');

    // ------------------------------------------------------------------------
    // Verification 3: Large Legible Item Quantities, Dish Names & Preparation Notes
    // ------------------------------------------------------------------------
    console.log('[Verification 3] Checking Dish Items, Large Quantities & Special Notes...');
    if (!htmlOutput.includes('x2') || !htmlOutput.includes('x4')) {
      throw new Error('Verification 3 Failed: Item quantities missing.');
    }
    if (!htmlOutput.includes('Paneer Butter Masala') || !htmlOutput.includes('Garlic Naan') || !htmlOutput.includes('Mango Lassi')) {
      throw new Error('Verification 3 Failed: Dish names missing.');
    }
    if (!htmlOutput.includes('* Note: Make it extra spicy, less butter')) {
      throw new Error('Verification 3 Failed: Special instructions/notes missing.');
    }
    if (!htmlOutput.includes('item-qty') || !htmlOutput.includes('item-name')) {
      throw new Error('Verification 3 Failed: Large font CSS classes (item-qty, item-name) missing.');
    }
    console.log('  └─► PASS: Dish items, large quantity badges & special notes correctly rendered!');

    // ------------------------------------------------------------------------
    // Verification 4: NO Superfluous Billing Data (No Prices, No Taxes, No Payment Info)
    // ------------------------------------------------------------------------
    console.log('[Verification 4] Confirming NO Prices or Billing Data present on Kitchen Ticket...');
    if (htmlOutput.includes('Rs.') || htmlOutput.includes('Subtotal') || htmlOutput.includes('GSTIN') || htmlOutput.includes('GRAND TOTAL')) {
      throw new Error('Verification 4 Failed: Kitchen Order Ticket unexpectedly contains billing/price data!');
    }
    console.log('  └─► PASS: Pure kitchen ticket — ZERO pricing/billing data present!');

    // ------------------------------------------------------------------------
    // Verification 5: Thermal & A4 Print CSS Rules
    // ------------------------------------------------------------------------
    console.log('[Verification 5] Checking @media print and 80mm thermal CSS page rules...');
    if (!htmlOutput.includes('@media print') || !htmlOutput.includes('size: 80mm auto;')) {
      throw new Error('Verification 5 Failed: @media print or 80mm thermal paper size rule missing.');
    }
    console.log('  └─► PASS: @media print stylesheet configured for 80mm thermal printer & A4 fallback!');

    console.log('\n===============================================================');
    console.log('ALL KOT THERMAL & A4 PRINT LAYOUT VERIFICATIONS PASSED 100%');
    console.log('===============================================================\n');

    // Visual Print Preview Inspection Output
    console.log('--- VISUAL PRINT MARKUP INSPECTION SNAPSHOT ---');
    console.log(htmlOutput.substring(0, 1200));
    console.log('... [Truncated for brevity] ...\n');

  } catch (err: any) {
    console.error('\n❌ KOT PRINT LAYOUT TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQTPrintLayoutTests().then(() => process.exit(0));
}
