'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCartStore } from '../../../../../../store/cartStore';
import api from '../../../../../../lib/axios';
import { Loader2, Coffee, CheckCircle2 } from 'lucide-react';

export default function TableLandingPage() {
  const params = useParams();
  const router = useRouter();
  const setTableContext = useCartStore((state) => state.setTableContext);

  const slug = params.slug as string;
  const tableNum = params.tableNum as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('');

  useEffect(() => {
    if (!slug || !tableNum) return;

    const fetchTenantAndSetup = async () => {
      try {
        const response = await api.get(`/restaurants/slug/${slug}`);
        const restaurant = response.data.data;

        if (!restaurant) {
          setError('We could not find this restaurant.');
          setLoading(false);
          return;
        }

        // Set table details in client-side state
        const safeTaxRate = restaurant.taxRate !== undefined && restaurant.taxRate !== null ? Number(restaurant.taxRate) : 5;
        setTableContext(restaurant._id, tableNum, safeTaxRate);
        setRestaurantName(restaurant.name);

        // Allow 1.5 seconds for visual feedback then redirect to menu
        setTimeout(() => {
          router.push(`/r/${slug}/menu`);
        }, 1500);
      } catch (err: any) {
        console.error('Table landing load error:', err);
        setError(err.response?.data?.message || 'Failed to connect to the restaurant table system.');
        setLoading(false);
      }
    };

    fetchTenantAndSetup();
  }, [slug, tableNum, setTableContext, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 p-6 text-center relative overflow-hidden">
      {/* Decorative background gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-primary/10 blur-3xl" />

      <div className="z-10 max-w-md w-full space-y-6">
        {loading ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 animate-spin">
              <Coffee className="w-8 h-8" />
            </div>
            
            <h2 className="font-serif text-2xl font-bold text-foreground">
              Connecting to Table {tableNum}...
            </h2>
            
            <p className="text-sm text-muted-foreground animate-pulse">
              Setting up your digital dining experiences, please wait...
            </p>
            
            <Loader2 className="w-6 h-6 animate-spin text-primary mt-2" />
          </div>
        ) : error ? (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl p-6 space-y-3">
            <h3 className="font-serif text-lg font-bold">Unable to Scan QR</h3>
            <p className="text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs font-semibold px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            
            <h2 className="font-serif text-2xl font-bold text-foreground">
              Welcome to {restaurantName}!
            </h2>
            
            <p className="text-sm text-muted-foreground">
              Table {tableNum} successfully detected. Opening digital menu...
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
