import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Generates an elegant PDF invoice for a completed order.
 * Saves the file to backend/public/bills/INV-[billNumber].pdf and returns the relative path.
 * 
 * @param restaurant The restaurant database object
 * @param order The order database object
 * @param billNumber The unique bill invoice code
 * @returns Relative path to the PDF (e.g. "/bills/INV-12345.pdf")
 */
export const generateBillPDF = (
  restaurant: any,
  order: any,
  billNumber: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const filename = `INV-${billNumber}.pdf`;
      const publicDir = path.join(__dirname, '../../public/bills');

      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }

      const filePath = path.join(publicDir, filename);
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Palette Configuration (Slate-based theme)
      const primaryColor = '#0f172a'; // slate-900
      const secondaryColor = '#475569'; // slate-600
      const borderColor = '#cbd5e1'; // slate-300

      // Restaurant Header - bold name
      doc.font('Helvetica-Bold')
         .fillColor(primaryColor)
         .fontSize(22)
         .text(restaurant.name, { align: 'center' });

      // Secondary details - normal weight
      doc.font('Helvetica')
         .fontSize(10)
         .fillColor(secondaryColor)
         .text(restaurant.address, { align: 'center' })
         .text(`Phone: ${restaurant.contact}`, { align: 'center' });

      if (restaurant.gstNumber) {
        doc.text(`GSTIN: ${restaurant.gstNumber}`, { align: 'center' });
      }

      doc.moveDown(1.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(borderColor).stroke();
      doc.moveDown(1);

      // Metadata Info block (Grid layout)
      const metaY = doc.y;
      doc.fillColor(primaryColor).fontSize(11);
      
      doc.font('Helvetica-Bold').text(`Bill No: `, 40, metaY);
      doc.font('Helvetica').text(billNumber, 100, metaY);

      doc.font('Helvetica-Bold').text(`Date: `, 40, metaY + 18);
      doc.font('Helvetica').text(new Date(order.createdAt).toLocaleString(), 100, metaY + 18);

      doc.font('Helvetica-Bold').text(`Table: `, 380, metaY);
      doc.font('Helvetica').text(`Table ${order.tableNumber}`, 440, metaY);

      doc.font('Helvetica-Bold').text(`Customer: `, 380, metaY + 18);
      doc.font('Helvetica').text(`${order.customerName} (${order.phoneNumber})`, 440, metaY + 18, { width: 115 });

      doc.moveDown(2.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(borderColor).stroke();
      doc.moveDown(1);

      // Items Table Header Helper
      const renderTableHeader = () => {
        let hY = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor(secondaryColor);
        doc.text('Item Description', 45, hY);
        doc.text('Qty', 320, hY, { width: 30, align: 'center' });
        doc.text('Price', 390, hY, { width: 60, align: 'right' });
        doc.text('Total', 485, hY, { width: 70, align: 'right' });

        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.8);
      };

      renderTableHeader();

      // Items List
      doc.fillColor(primaryColor);
      order.items.forEach((item: any) => {
        // Page boundary safety check for long bills
        if (doc.y > 700) {
          doc.addPage();
          renderTableHeader();
        }

        let itemY = doc.y;
        
        // Item Name in Bold (with word wrapping)
        doc.fontSize(10).font('Helvetica-Bold').text(item.name, 45, itemY, { width: 250 });
        
        // Customizations details
        let extraHeight = 0;
        if (item.customizations && item.customizations.length > 0) {
          const custText = item.customizations
            .map((c: any) => `${c.name}: ${c.selectedOption} (+Rs.${c.extraPrice})`)
            .join(', ');
          doc.fontSize(8).font('Helvetica').fillColor(secondaryColor).text(`  - ${custText}`, 45, doc.y + 2, { width: 250 });
          extraHeight = 12;
        }

        if (item.specialInstructions) {
          doc.fontSize(8).font('Helvetica').fillColor('#b45309').text(`  * Note: "${item.specialInstructions}"`, 45, doc.y + (extraHeight > 0 ? 2 : 4), { width: 250 });
          extraHeight += 12;
        }

        // Quantities & Calculations
        const extraPrice = item.customizations
          ? item.customizations.reduce((acc: number, cur: any) => acc + cur.extraPrice, 0)
          : 0;
        const unitPrice = item.price + extraPrice;
        const itemTotal = unitPrice * item.quantity;
        
        doc.fontSize(10).font('Helvetica').fillColor(primaryColor);
        doc.text(item.quantity.toString(), 320, itemY, { width: 30, align: 'center' });
        doc.text(`Rs. ${unitPrice.toFixed(2)}`, 390, itemY, { width: 60, align: 'right' });
        doc.text(`Rs. ${itemTotal.toFixed(2)}`, 485, itemY, { width: 70, align: 'right' });
        
        doc.moveDown(0.8);
        if (extraHeight > 0) {
          doc.y += extraHeight / 2;
        }
      });

      if (doc.y > 680) {
        doc.addPage();
      }

      doc.moveDown(1.5);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(borderColor).stroke();
      doc.moveDown(1);

      // Subtotals and Taxes block
      let totalY = doc.y;
      
      doc.fontSize(10).font('Helvetica').fillColor(secondaryColor);
      doc.text('Subtotal:', 340, totalY);
      doc.fillColor(primaryColor).text(`Rs. ${order.subtotal.toFixed(2)}`, 485, totalY, { align: 'right', width: 70 });

      totalY += 18;
      doc.fillColor(secondaryColor).text(`GST (${restaurant.taxRate !== undefined && restaurant.taxRate !== null ? restaurant.taxRate : 5}%):`, 340, totalY);
      doc.fillColor(primaryColor).text(`Rs. ${order.tax.toFixed(2)}`, 485, totalY, { align: 'right', width: 70 });

      totalY += 22;
      doc.fontSize(12).font('Helvetica-Bold').fillColor(primaryColor).text('Grand Total:', 340, totalY);
      doc.text(`Rs. ${order.totalAmount.toFixed(2)}`, 485, totalY, { align: 'right', width: 70 });

      doc.moveDown(3);
      doc.fontSize(10).font('Helvetica').fillColor(secondaryColor).text('Thank you for dining with us!', { align: 'center', oblique: true });
      
      doc.end();

      writeStream.on('finish', () => {
        resolve(`/bills/${filename}`);
      });
      
      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};
