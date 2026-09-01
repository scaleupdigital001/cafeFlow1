'use client';

import React, { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { useAuthStore } from '../../../store/authStore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Loader2, Store, MapPin, Phone, FileText, Percent, Smartphone, Save, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const { updateRestaurant } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [taxRate, setTaxRate] = useState(5);
  const [upiId, setUpiId] = useState('');
  const [upiPhone, setUpiPhone] = useState('');
  const [upiQrImage, setUpiQrImage] = useState('');

  // Client Handover Reset state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resettingData, setResettingData] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetTenantSales = async () => {
    if (resetConfirmInput !== 'RESET ALL TRANSACTIONS') {
      setResetError('Please type "RESET ALL TRANSACTIONS" to confirm.');
      return;
    }
    setResettingData(true);
    setResetError(null);
    try {
      const res = await api.post('/data-ops/reset-tenant-sales', {
        confirmText: 'RESET ALL TRANSACTIONS',
      });
      if (res.data.success) {
        setResetSuccess('All Overview sales, orders, bills, and session history reset to ZERO!');
        setResetModalOpen(false);
        setResetConfirmInput('');
      }
    } catch (err: any) {
      setResetError(err.response?.data?.message || 'Failed to reset sales data.');
    } finally {
      setResettingData(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/restaurants/my-restaurant');
        if (res.data.success) {
          const restaurant = res.data.data;
          updateRestaurant(restaurant);
          setName(restaurant.name || '');
          setAddress(restaurant.address || '');
          setContact(restaurant.contact || '');
          setGstNumber(restaurant.gstNumber || '');
          setTaxRate(restaurant.taxRate ?? 5);
          setUpiId(restaurant.paymentSettings?.upiId || '');
          setUpiPhone(restaurant.paymentSettings?.upiPhone || '');
          setUpiQrImage(restaurant.paymentSettings?.upiQrImage || '');
        }
      } catch (err: any) {
        console.error('Fetch settings error:', err);
        setError('Failed to load restaurant profile settings.');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [updateRestaurant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const response = await api.patch('/restaurants/my-restaurant', {
        name,
        address,
        contact,
        gstNumber,
        taxRate: Number(taxRate),
        paymentSettings: {
          upiId,
          upiPhone,
          upiQrImage,
        },
      });

      if (response.data.success) {
        const updatedRestaurant = response.data.data;
        updateRestaurant(updatedRestaurant);
        setSuccessMsg('Restaurant profile and UPI payment settings saved successfully!');
        // Clear message after 4 seconds
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Update settings error:', err);
      setError(err.response?.data?.message || 'Failed to update restaurant settings.');
    } finally {
      setSaving(false);
    }
  };
  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('File size too large. Please upload an image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setUpiQrImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-black tracking-tight">Cafe Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure your restaurant details, billing preferences, and peer-to-peer UPI payout settings.
        </p>
      </div>

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 text-xs p-4 rounded-xl flex items-center gap-2.5 animate-fade-in font-medium">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-4 rounded-xl font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="border border-border/60 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-serif font-black flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" /> General Profile
            </CardTitle>
            <CardDescription className="text-xs">Setup basic cafe coordinates seen on invoices and menu cards</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Cafe Name</label>
                <div className="relative">
                  <Store className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="e.g. Central Cafe"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Contact Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                  <input
                    type="text"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="e.g. +91 98765 43210"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Address Details</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="e.g. 102 Gourmet Boulevard, Suite 5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/30">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">GSTIN Number</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                  <input
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="e.g. 29AAAAA1111A1Z1"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Tax Rate (%)</label>
                <div className="relative">
                  <Percent className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                  <input
                    type="number"
                    required
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="5"
                  />
                </div>
              </div>
            </div>

            {/* UPI Settings Integration */}
            <div className="pt-4 border-t border-border/30 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-500" /> Direct UPI Payout (Zero-Fee payments)
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Enter your business UPI ID (VPA) and linked phone number. This lets customers pay directly without transaction fees.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">UPI Address (VPA)</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium font-mono focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="e.g. merchant@upi"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">UPI Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground/60" />
                    <input
                      type="text"
                      value={upiPhone}
                      onChange={(e) => setUpiPhone(e.target.value)}
                      className="w-full bg-secondary border border-border/80 rounded-xl py-2.5 pl-9 pr-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="e.g. +91 98765 43210"
                    />
                  </div>
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground block pl-1">
                Configure both fields so customers have backup payment methods (like copying the phone number or VPA) if their app blocks the dynamic link.
              </span>

              {/* Custom QR Code Image Upload */}
              <div className="space-y-2.5 pt-4 border-t border-border/25">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                  Custom merchant UPI QR Code
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                  Upload a screenshot or photo of your official merchant QR code (e.g. from GPay, PhonePe, or Paytm). This image will be shown directly to customers on checkout, resolving routing errors on personal VPAs.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-secondary/30 p-4 rounded-xl border border-border/40">
                  {/* QR Image Preview */}
                  <div className="w-32 h-32 bg-secondary rounded-lg border border-border flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {upiQrImage ? (
                      <>
                        <img src={upiQrImage} alt="Custom UPI QR Code" className="w-full h-full object-contain p-2 bg-white" />
                        <button
                          type="button"
                          onClick={() => setUpiQrImage('')}
                          className="absolute inset-0 bg-stone-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-all cursor-pointer rounded-lg border-none"
                        >
                          Clear Image
                        </button>
                      </>
                    ) : (
                      <span className="text-[9px] text-muted-foreground text-center px-2">No QR Code uploaded</span>
                    )}
                  </div>

                  {/* Upload action controls */}
                  <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                    <input
                      type="file"
                      id="upi-qr-upload"
                      accept="image/png, image/jpeg, image/jpg"
                      onChange={handleQrFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="upi-qr-upload"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-border rounded-xl bg-background hover:bg-secondary text-xs font-bold text-foreground transition-colors cursor-pointer shadow-sm"
                    >
                      Choose Image File
                    </label>
                    <p className="text-[9px] text-muted-foreground">
                      Accepts PNG, JPG or JPEG. Max size 1MB.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-secondary/40 px-6 py-4 flex justify-end border-t border-border/40 rounded-b-xl">
            <Button
              type="submit"
              disabled={saving}
              className="text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-white cursor-pointer shadow-md shadow-primary/10"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* DANGER ZONE / CLIENT HANDOVER RESET */}
      <Card className="border border-red-500/30 bg-red-950/10 dark:bg-red-950/20 shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-serif font-black text-red-500 flex items-center gap-2">
            Client Handover Data Reset (Start Fresh Tomorrow)
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Clear all previous test orders, bills, sales revenue, and session history for this cafe before giving access to the client.
            <strong> PRESERVES 100% of Menu items, Dishes, Prices, Tables, QR Codes, and Cafe Settings.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-500 text-xs font-bold mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {resetSuccess}
            </div>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setResetModalOpen(true);
              setResetError(null);
              setResetConfirmInput('');
            }}
            className="text-xs font-bold gap-1.5 cursor-pointer"
          >
            Reset Overview & Sales Data to Zero
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-red-500/40 bg-background shadow-2xl">
            <CardHeader>
              <CardTitle className="text-lg font-serif font-black text-red-500">
                Confirm Client Handover Reset
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                This action will delete all historical orders, bills, and overview metrics for this cafe so sales start from <strong>Rs. 0.00 tomorrow morning</strong>.
                Dishes, prices, tables, and settings will NOT be changed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {resetError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-semibold">
                  {resetError}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">
                  Type <span className="text-red-500 font-mono">RESET ALL TRANSACTIONS</span> to confirm:
                </label>
                <input
                  type="text"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value)}
                  placeholder="RESET ALL TRANSACTIONS"
                  className="w-full text-xs font-mono bg-secondary/50 border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2 bg-secondary/30 px-6 py-3 border-t border-border/40">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetModalOpen(false)}
                className="text-xs font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={resettingData || resetConfirmInput !== 'RESET ALL TRANSACTIONS'}
                onClick={handleResetTenantSales}
                className="text-xs font-bold cursor-pointer"
              >
                {resettingData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Reset to Zero'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
