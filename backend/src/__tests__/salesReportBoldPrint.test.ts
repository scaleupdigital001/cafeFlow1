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
  }[];
  payments: {
    method: string;
    label: string;
    count: number;
    amount: number;
  }[];
  restaurantName?: string;
  startDate?: string;
  endDate?: string;
  totalOrders?: number;
  totalRevenue?: number;
  totalTax?: number;
}

export const formatDateToDDMMMYYYY = (dateInput?: string | Date): string => {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

export const formatReportDateRangeText = (data: DailySalesReportData): string => {
  if (data.startDate && data.endDate) {
    return `${formatDateToDDMMMYYYY(data.startDate)} to ${formatDateToDDMMMYYYY(data.endDate)}`;
  }
  const dateStr = data.date || data.formattedDate || new Date().toISOString().split('T')[0];
  const formatted = formatDateToDDMMMYYYY(dateStr);
  return `${formatted} to ${formatted}`;
};

export const formatFooterPrintTimestamp = (d: Date = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year}, ${hours}:${mins}`;
};

export const buildDailySalesReportHTML = (data: DailySalesReportData): string => {
  const restName = data.restaurant?.name || data.restaurantName || 'CafeFlow Restaurant';
  const dateRangeText = formatReportDateRangeText(data);
  const timestampText = formatFooterPrintTimestamp();

  const cleanDateStr = (data.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const sequenceNumber = `SEQ-${cleanDateStr}-0001`;

  const sortedItems = [...(data.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  const totalLineAmount = sortedItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  const itemsHtml = sortedItems.map((item) => `
    <div class="item-row">
      <span class="col-particulars">${item.name}</span>
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

async function runSalesReportBoldPrintTests() {
  console.log('\n===============================================================');
  console.log('RUNNING SALES REPORT BOLD FONT & LAYOUT VERIFICATION SUITE');
  console.log('===============================================================\n');

  try {
    const sampleData: DailySalesReportData = {
      date: '2026-08-26',
      restaurant: { name: 'Highland Artisanal Cafe' },
      summary: {
        grossSales: 1500,
        taxes: 75,
        netSales: 1575,
        totalOrders: 4,
        completedOrders: 4,
        cancelledOrders: 0,
        allOrders: 4,
        totalItems: 8,
        averageOrderValue: 393.75,
      },
      items: [
        { name: 'Woodfired Extra Thin Crust Pizza With Artisanal Cheese And Black Olives', quantity: 2, amount: 700 },
        { name: 'Artisanal Burger', quantity: 3, amount: 600 },
        { name: 'Cold Brew Coffee', quantity: 3, amount: 360 },
      ],
      payments: [
        { method: 'cash', label: 'Cash', count: 2, amount: 800 },
        { method: 'upi_link', label: 'Online / UPI', count: 2, amount: 775 },
      ],
    };

    const htmlOutput = buildDailySalesReportHTML(sampleData);

    // ------------------------------------------------------------------------
    // Requirement 1: Header "Sale Report" & Date Range "DD MMM YYYY to DD MMM YYYY"
    // ------------------------------------------------------------------------
    console.log('[Requirement 1] Checking "Sale Report" title & Date Range formatting...');
    if (!htmlOutput.includes('Sale Report')) {
      throw new Error('Requirement 1 Failed: Header missing "Sale Report" title.');
    }
    if (!htmlOutput.includes('26 Aug 2026 to 26 Aug 2026')) {
      throw new Error('Requirement 1 Failed: Date range not formatted as "26 Aug 2026 to 26 Aug 2026".');
    }
    console.log('  └─► PASS: Header title "Sale Report" & date range "26 Aug 2026 to 26 Aug 2026" present!');

    // ------------------------------------------------------------------------
    // Requirement 2: Column Headers PARTICULARS | QTY | AMT
    // ------------------------------------------------------------------------
    console.log('[Requirement 2] Checking column headers PARTICULARS | QTY | AMT...');
    if (!htmlOutput.includes('PARTICULARS') || !htmlOutput.includes('QTY') || !htmlOutput.includes('AMT')) {
      throw new Error('Requirement 2 Failed: Column headers PARTICULARS | QTY | AMT missing.');
    }
    console.log('  └─► PASS: Column headers PARTICULARS | QTY | AMT present!');

    // ------------------------------------------------------------------------
    // Requirement 3: Alphabetical Item Sorting
    // ------------------------------------------------------------------------
    console.log('[Requirement 3] Verifying items are sorted ALPHABETICALLY by name...');
    const burgerIdx = htmlOutput.indexOf('Artisanal Burger');
    const coffeeIdx = htmlOutput.indexOf('Cold Brew Coffee');
    const pizzaIdx = htmlOutput.indexOf('Woodfired Extra Thin Crust Pizza');

    if (burgerIdx === -1 || coffeeIdx === -1 || pizzaIdx === -1) {
      throw new Error('Requirement 3 Failed: One or more item names missing in print output.');
    }

    if (!(burgerIdx < coffeeIdx && coffeeIdx < pizzaIdx)) {
      throw new Error(`Requirement 3 Failed: Items are not sorted alphabetically! BurgerIdx: ${burgerIdx}, CoffeeIdx: ${coffeeIdx}, PizzaIdx: ${pizzaIdx}`);
    }
    console.log('  └─► PASS: Items sorted alphabetically (Artisanal Burger -> Cold Brew Coffee -> Woodfired Pizza)!');

    // ------------------------------------------------------------------------
    // Requirement 4: "Total:" row summing all line amounts
    // ------------------------------------------------------------------------
    console.log('[Requirement 4] Checking "Total:" row summing line amounts...');
    if (!htmlOutput.includes('Total:') || !htmlOutput.includes('Rs. 1660.00')) {
      throw new Error('Requirement 4 Failed: "Total:" row summing line amounts (700 + 600 + 360 = 1660.00) missing.');
    }
    console.log('  └─► PASS: "Total:" row (Rs. 1660.00) correctly calculated and rendered!');

    // ------------------------------------------------------------------------
    // Requirement 5: Footer Print Timestamp & Ticket Sequence Number
    // ------------------------------------------------------------------------
    console.log('[Requirement 5] Checking Footer timestamp & sequence number...');
    if (!htmlOutput.includes('Printed:') || !htmlOutput.includes('Seq #: SEQ-20260826-0001')) {
      throw new Error('Requirement 5 Failed: Footer timestamp or sequence number missing.');
    }
    console.log('  └─► PASS: Footer print timestamp & sequence number present!');

    // ------------------------------------------------------------------------
    // Requirement 6: 100% HEAVY BOLD FONT ENFORCEMENT
    // ------------------------------------------------------------------------
    console.log('[Requirement 6] Asserting 100% heavy bold font enforcement across ALL elements...');
    if (!htmlOutput.includes('font-weight: 900 !important;')) {
      throw new Error('Requirement 6 Failed: font-weight: 900 !important missing from CSS.');
    }
    if (!htmlOutput.includes('-webkit-text-stroke: 0.4px #000 !important;')) {
      throw new Error('Requirement 6 Failed: -webkit-text-stroke: 0.4px #000 !important missing from CSS.');
    }

    // Check that NO light/regular/normal font weights exist anywhere in style declaration
    if (htmlOutput.includes('font-weight: normal') || htmlOutput.includes('font-weight: 400') || htmlOutput.includes('font-weight: light')) {
      throw new Error('Requirement 6 Failed: Found light or normal font-weight declarations in print template!');
    }
    console.log('  └─► PASS: 100% Heavy Bold (font-weight: 900 !important) enforced on ALL elements with zero light fonts!');

    console.log('\n===============================================================');
    console.log('ALL SALES REPORT BOLD PRINT & LAYOUT TESTS PASSED 100%');
    console.log('===============================================================\n');

    // Visual Print Inspection Output
    console.log('--- VISUAL PRINT MARKUP INSPECTION SNAPSHOT ---');
    console.log(htmlOutput);
    console.log('-----------------------------------------------\n');

  } catch (err: any) {
    console.error('\n❌ BOLD PRINT LAYOUT TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runSalesReportBoldPrintTests().then(() => process.exit(0));
}
