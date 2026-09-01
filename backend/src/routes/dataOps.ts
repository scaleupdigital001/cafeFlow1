import mongoose from 'mongoose';
import { Router, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import jwt from 'jsonwebtoken';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';
import Order from '../models/Order';
import Bill from '../models/Bill';
import WaiterRequest from '../models/WaiterRequest';
import Otp from '../models/Otp';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-1234';

// HARDCODED CONSTANT WHITELIST FOR PURGEABLE MODELS ONLY.
// IMMUTABLE CORE MODELS (Table, Dish, Restaurant, User) ARE ABSOLUTELY EXCLUDED AND CAN NEVER BE TOUCHED BY THIS ROUTE.
const ALLOWED_PURGE_MODELS = ['Order', 'Bill', 'WaiterRequest', 'Otp'] as const;

/**
 * Convert JSON array to CSV string safely
 */
function jsonToCsv(items: any[]): string {
  if (!items || items.length === 0) return '';
  const keys = Array.from(new Set(items.flatMap((item) => Object.keys(item))));
  let csv = keys.join(',') + '\n';
  items.forEach((item) => {
    const row = keys.map((k) => {
      let val = item[k];
      if (val === null || val === undefined) return '';
      if (val instanceof Date) return val.toISOString();
      if (typeof val === 'object' && typeof val.toHexString === 'function') return val.toHexString();
      if (typeof val === 'object' && typeof val.toString === 'function' && !Array.isArray(val) && val.constructor?.name === 'ObjectId') {
        return val.toString();
      }
      if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csv += row.join(',') + '\n';
  });
  return csv;
}

/**
 * Parse CSV string back to JSON objects safely
 */
function csvToJson(csvText: string): any[] {
  if (!csvText || !csvText.trim()) return [];
  const lines = csvText.trim().split('\n');
  if (lines.length <= 1) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur);
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseLine(lines[i]);
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      let val: any = values[idx] ?? '';
      if (typeof val === 'string') {
        val = val.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
      }
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try {
          val = JSON.parse(val);
        } catch (_) {}
      } else if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (typeof val === 'string' && /^\d+(\.\d+)?$/.test(val) && !h.toLowerCase().includes('id') && !h.toLowerCase().includes('number') && !h.toLowerCase().includes('contact') && !h.toLowerCase().includes('phone')) {
        val = Number(val);
      }
      obj[h] = val;
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * @route   POST /api/data-ops/backup
 * @desc    Export transactional data (Orders, Bills, WaiterRequests) into a zipped CSV package
 * @access  Private (Super Admin only)
 */
router.post('/backup', protect, restrictTo('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { restaurantId, months } = req.body;
    const filter: any = {};
    if (restaurantId && restaurantId !== 'all') {
      filter.restaurantId = restaurantId;
    }

    if (months && Number(months) > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - Number(months));
      filter.updatedAt = { $lt: cutoff };
    }

    const orders = await Order.find(filter).lean();
    const bills = await Bill.find(filter).lean();
    const requests = await WaiterRequest.find(filter).lean();

    const zip = new AdmZip();
    zip.addFile('orders.csv', Buffer.from(jsonToCsv(orders), 'utf-8'));
    zip.addFile('bills.csv', Buffer.from(jsonToCsv(bills), 'utf-8'));
    zip.addFile('waiter_requests.csv', Buffer.from(jsonToCsv(requests), 'utf-8'));

    const zipBuffer = zip.toBuffer();

    // Generate signed verification token required for purge confirmation
    const backupToken = jwt.sign(
      {
        type: 'DATA_BACKUP',
        restaurantId: restaurantId || 'all',
        months: months || 0,
        count: orders.length + bills.length + requests.length,
        timestamp: Date.now(),
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const dateStr = new Date().toISOString().split('T')[0];
    const targetStr = restaurantId && restaurantId !== 'all' ? `rest_${restaurantId}` : 'all_tenants';
    const filename = `cafeflow_backup_${targetStr}_${dateStr}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('X-Backup-Token', backupToken);
    res.setHeader('Access-Control-Expose-Headers', 'X-Backup-Token, Content-Disposition');

    return res.status(200).send(zipBuffer);
  } catch (error: any) {
    console.error('Backup error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate backup.', error: error.message });
  }
});

/**
 * @route   POST /api/data-ops/clean
 * @desc    Purge transactional data older than N months WITH mandatory verified backup token check
 * @access  Private (Super Admin only)
 */
router.post('/clean', protect, restrictTo('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { restaurantId, months, backupToken, confirmText } = req.body;

    // 1. Mandatory Backup Verification Guard
    if (!backupToken) {
      return res.status(400).json({
        success: false,
        message: 'Clean blocked: A verified backup must be completed first before purging database records.',
      });
    }

    try {
      const decoded = jwt.verify(backupToken, JWT_SECRET) as any;
      if (decoded.type !== 'DATA_BACKUP') {
        return res.status(400).json({ success: false, message: 'Clean blocked: Invalid backup token.' });
      }
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Clean blocked: Expired or invalid backup token.' });
    }

    // 2. Validate Cutoff Months Input
    if (!months || Number(months) <= 0) {
      return res.status(400).json({ success: false, message: 'Months parameter must be a positive number.' });
    }

    // 3. Confirm text check
    const expectedConfirm = restaurantId && restaurantId !== 'all' ? 'CONFIRM PURGE' : 'CONFIRM PURGE ALL';
    if (confirmText !== expectedConfirm) {
      return res.status(400).json({ success: false, message: `Please type "${expectedConfirm}" to confirm purge.` });
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - Number(months));

    const filter: any = { updatedAt: { $lt: cutoffDate } };
    if (restaurantId && restaurantId !== 'all') {
      filter.restaurantId = restaurantId;
    }

    // 4. Strict Enforced Whitelist Execution: Delete ONLY Order, Bill, WaiterRequest, Otp
    const [orderRes, billRes, reqRes, otpRes] = await Promise.all([
      Order.deleteMany(filter),
      Bill.deleteMany(filter),
      WaiterRequest.deleteMany(filter),
      Otp.deleteMany({ expiresAt: { $lt: new Date() } }),
    ]);

    return res.json({
      success: true,
      message: `Successfully purged records older than ${months} months.`,
      purged: {
        orders: orderRes.deletedCount || 0,
        bills: billRes.deletedCount || 0,
        waiterRequests: reqRes.deletedCount || 0,
        otps: otpRes.deletedCount || 0,
      },
    });
  } catch (error: any) {
    console.error('Clean error:', error);
    return res.status(500).json({ success: false, message: 'Failed to purge data.', error: error.message });
  }
});

/**
 * @route   POST /api/data-ops/reset-tenant-sales
 * @desc    Purge ALL transactional & sales data for a restaurant tenant for fresh client handover.
 *          PRESERVES: Restaurant, Users/Staff, Categories, Dishes, Tables & QR codes 100%.
 *          DELETES: Orders, Bills, TableSessions, WaiterRequests, OTPs.
 * @access  Private (Restaurant Admin / Super Admin)
 */
router.post('/reset-tenant-sales', protect, restrictTo('restaurant_admin', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { confirmText } = req.body;
    let restaurantId = req.user?.restaurantId || req.body.restaurantId;

    if (!restaurantId && req.user?.role !== 'super_admin') {
      return res.status(400).json({ success: false, message: 'Restaurant identifier is required.' });
    }

    if (confirmText !== 'RESET ALL TRANSACTIONS') {
      return res.status(400).json({
        success: false,
        message: 'Please type "RESET ALL TRANSACTIONS" to confirm complete transactional data reset.',
      });
    }

    const filter: any = {};
    if (restaurantId) {
      filter.restaurantId = restaurantId;
    }

    // Perform targeted deletion of transactional documents ONLY
    const TableSessionModule = require('../models/TableSession').default;
    const [delOrders, delBills, delSessions, delRequests, delOtps] = await Promise.all([
      Order.deleteMany(filter),
      Bill.deleteMany(filter),
      TableSessionModule.deleteMany(filter),
      WaiterRequest.deleteMany(filter),
      Otp.deleteMany({}),
    ]);

    console.log(`[DataOps] Tenant transactional reset executed for restaurant: ${restaurantId || 'all'}`);
    console.log(`  ├─ Orders deleted: ${delOrders.deletedCount}`);
    console.log(`  ├─ Bills deleted: ${delBills.deletedCount}`);
    console.log(`  ├─ TableSessions deleted: ${delSessions.deletedCount}`);
    console.log(`  ├─ WaiterRequests deleted: ${delRequests.deletedCount}`);
    console.log(`  └─ Otps deleted: ${delOtps.deletedCount}`);

    return res.json({
      success: true,
      message: 'All transactional sales, orders, bills, and active session records reset to ZERO for client handover.',
      purged: {
        orders: delOrders.deletedCount || 0,
        bills: delBills.deletedCount || 0,
        tableSessions: delSessions.deletedCount || 0,
        waiterRequests: delRequests.deletedCount || 0,
        otps: delOtps.deletedCount || 0,
      },
    });
  } catch (error: any) {
    console.error('Reset tenant sales error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset transactional data.', error: error.message });
  }
});

/**
 * Helper to cast ObjectIds and Date strings prior to MongoDB upsert
 */
function prepareDoc(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const doc: Record<string, any> = {};
  for (const key of Object.keys(item)) {
    let val = item[key];
    if (typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
      val = new mongoose.Types.ObjectId(val);
    } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      val = new Date(val);
    } else if (Array.isArray(val)) {
      val = val.map((v) => prepareDoc(v));
    }
    doc[key] = val;
  }
  return doc;
}

/**
 * @route   POST /api/data-ops/restore
 * @desc    Idempotently restore transactional data from backup ZIP package
 * @access  Private (Super Admin only)
 */
router.post('/restore', protect, restrictTo('super_admin'), upload.single('backupZip'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a valid backup ZIP file.' });
    }

    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    let restoredOrdersCount = 0;
    let restoredBillsCount = 0;
    let restoredRequestsCount = 0;

    for (const entry of zipEntries) {
      const fileName = entry.entryName.toLowerCase();

      // Defensive Model Guard: Ignore Table, Dish, Restaurant, User even if hand-edited into ZIP
      if (fileName.includes('table') || fileName.includes('dish') || fileName.includes('restaurant') || fileName.includes('user')) {
        console.warn(`[Restore] Ignoring non-transactional file in backup: ${entry.entryName}`);
        continue;
      }

      const content = entry.getData().toString('utf-8');
      const records = csvToJson(content);

      if (fileName.includes('orders')) {
        for (const item of records) {
          if (!item._id) continue;
          const doc = prepareDoc(item);
          await Order.collection.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
          restoredOrdersCount++;
        }
      } else if (fileName.includes('bills')) {
        for (const item of records) {
          if (!item._id) continue;
          const doc = prepareDoc(item);
          await Bill.collection.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
          restoredBillsCount++;
        }
      } else if (fileName.includes('waiter_requests') || fileName.includes('requests')) {
        for (const item of records) {
          if (!item._id) continue;
          const doc = prepareDoc(item);
          await WaiterRequest.collection.updateOne({ _id: doc._id }, { $setOnInsert: doc }, { upsert: true });
          restoredRequestsCount++;
        }
      }
    }

    return res.json({
      success: true,
      message: `Restore completed successfully. Processed ${restoredOrdersCount} orders, ${restoredBillsCount} bills, ${restoredRequestsCount} waiter requests.`,
      restored: {
        orders: restoredOrdersCount,
        bills: restoredBillsCount,
        waiterRequests: restoredRequestsCount,
      },
    });
  } catch (error: any) {
    console.error('Restore error:', error);
    return res.status(500).json({ success: false, message: 'Failed to restore backup.', error: error.message });
  }
});

export default router;
