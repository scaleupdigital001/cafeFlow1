'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../../lib/axios';
import { Loader2, Clock, Phone, MapPin, Star, Coffee, Utensils, Award } from 'lucide-react';
import Link from 'next/link';

interface Restaurant {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  address: string;
  contact: string;
  gstNumber?: string;
  taxRate: number;
}

interface Dish {
  _id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  category: string;
  veg: boolean;
}

import { useCartStore } from '../../../store/cartStore';

export default function RestaurantLandingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const cartTableNumber = useCartStore((state) => state.tableNumber);
  const menuHref = cartTableNumber ? `/r/${slug}/menu/table/${cartTableNumber}` : `/r/${slug}/menu`;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [featuredDishes, setFeaturedDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    const fetchLandingData = async () => {
      try {
        const tenantRes = await api.get(`/restaurants/slug/${slug}`);
        setRestaurant(tenantRes.data.data);

        const dishesRes = await api.get(`/dishes/slug/${slug}`);
        // Select first 3 or 4 dishes as featured items
        setFeaturedDishes(dishesRes.data.data.slice(0, 4));
      } catch (err: any) {
        console.error('Landing page load error:', err);
        setError('Failed to load restaurant page.');
      } finally {
        setLoading(false);
      }
    };

    fetchLandingData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 p-6 text-center">
        <h2 className="font-serif text-2xl font-bold text-foreground mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-4">The restaurant slug you are trying to access does not exist on our platform.</p>
        <Link href="/login" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90">
          Go to Partner Login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Premium Navigation Header */}
      <header className="sticky top-0 z-50 glass-light dark:glass border-b border-border/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant.logo ? (
              <img src={restaurant.logo} alt={restaurant.name} className="w-10 h-10 rounded-full object-cover border border-primary/20" />
            ) : (
              <div className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                {restaurant.name.charAt(0)}
              </div>
            )}
            <span className="font-serif font-bold text-lg md:text-xl tracking-tight">
              {restaurant.name}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#about" className="hover:text-primary transition-colors">About Us</a>
            <a href="#featured" className="hover:text-primary transition-colors">Featured Menu</a>
            <a href="#gallery" className="hover:text-primary transition-colors">Gallery</a>
            <a href="#contact" className="hover:text-primary transition-colors">Contact</a>
          </nav>

          <Link
            href={menuHref}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/95 shadow-md shadow-primary/15 transition-all hover:scale-105"
          >
            Order Online
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center text-center py-20 px-4 bg-stone-900 text-stone-100 overflow-hidden">
        {/* Unsplash Background Banner */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop"
            alt="Cafe Interior"
            className="w-full h-full object-cover opacity-35 scale-105 filter blur-[1px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-900/60 to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto space-y-6 animate-fade-in">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-widest uppercase mb-2">
            <Award className="w-3.5 h-3.5" /> Welcome to {restaurant.name}
          </span>
          <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl font-extrabold text-stone-50 tracking-tight leading-[1.1]">
            Artisanal Flavors <br />
            <span className="text-primary italic font-light">Crafted with Love</span>
          </h1>
          <p className="text-base sm:text-xl text-stone-300 max-w-2xl mx-auto font-light">
            Indulge in a premium dining experience featuring local organic beans, handmade pastas, and mouthwatering desserts. Scan our table QR for instant contactless service.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href={menuHref}
              className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground font-bold rounded-full shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all hover:scale-105 text-center"
            >
              Explore Digital Menu
            </Link>
            <a
              href="#about"
              className="w-full sm:w-auto px-8 py-3.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700/50 font-bold rounded-full transition-all text-center"
            >
              Our Story
            </a>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-primary text-xs font-bold tracking-wider uppercase block">About {restaurant.name}</span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              A culinary journey dedicated to quality and freshness.
            </h2>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Founded with a passion for creating memorable dining moments, {restaurant.name} combines local seasonal ingredients with globally inspired techniques. Every single cup of coffee is ground fresh from high-altitude beans, and our chefs prepare dishes from scratch daily to guarantee quality.
          </p>
          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-bold text-foreground text-sm">Opening Hours</h4>
                <p className="text-xs text-muted-foreground mt-1">Mon - Sun: 8:00 AM - 10:30 PM</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-bold text-foreground text-sm">Reservations</h4>
                <p className="text-xs text-muted-foreground mt-1">{restaurant.contact}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative h-96 sm:h-[450px] rounded-3xl overflow-hidden shadow-2xl group">
          <img
            src="https://images.unsplash.com/photo-1543007630-9710e4a00a20?q=80&w=600&auto=format&fit=crop"
            alt="Our Kitchen"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-primary/5 group-hover:bg-transparent transition-colors" />
        </div>
      </section>

      {/* Featured Dishes Section */}
      <section id="featured" className="py-20 bg-stone-50 dark:bg-stone-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-primary text-xs font-bold tracking-wider uppercase">Menu Highlights</span>
            <h2 className="font-serif text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Savor Chef's Top Curations
            </h2>
            <p className="text-muted-foreground text-sm">
              A quick preview of our customer favorites. Open the full digital menu to order table-side.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredDishes.map((dish) => (
              <div key={dish._id} className="bg-card text-card-foreground border border-border/50 rounded-2xl overflow-hidden shadow-md group hover:shadow-xl transition-all duration-300 flex flex-col">
                <div className="h-48 overflow-hidden relative">
                  <img
                    src={dish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'}
                    alt={dish.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3 bg-card px-2 py-0.5 rounded-full text-[10px] font-bold shadow flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${dish.veg ? 'bg-green-600' : 'bg-red-600'}`} />
                    {dish.veg ? 'Veg' : 'Non-Veg'}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase text-primary font-bold tracking-wider">{dish.category}</span>
                    <h3 className="font-serif font-bold text-base line-clamp-1 group-hover:text-primary transition-colors">{dish.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{dish.description}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <span className="font-extrabold text-sm text-foreground">Rs. {dish.price.toFixed(2)}</span>
                    <span className="text-xs text-primary font-bold flex items-center gap-0.5">
                      Order <Utensils className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center pt-4">
            <Link
              href={menuHref}
              className="inline-flex items-center gap-2 px-6 py-3 border border-primary text-primary font-bold rounded-full hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              View Full Menu <Utensils className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section id="gallery" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <span className="text-primary text-xs font-bold tracking-wider uppercase">Visual Showcase</span>
          <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground">Cafe & Food Gallery</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=400&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1498804103079-a6351b050096?q=80&w=400&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?q=80&w=400&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=400&auto=format&fit=crop',
          ].map((imgUrl, i) => (
            <div key={i} className="h-64 rounded-2xl overflow-hidden shadow-md group relative cursor-pointer">
              <img
                src={imgUrl}
                alt="Gallery Item"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-stone-950/20 group-hover:bg-stone-950/40 transition-colors" />
            </div>
          ))}
        </div>
      </section>

      {/* Reviews Section */}
      <section className="py-20 bg-stone-50 dark:bg-stone-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-primary text-xs font-bold tracking-wider uppercase">Testimonials</span>
            <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground">What Customers Say</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Elena Rostova',
                review: 'The best pumpkin spice latte in the city! Staff was incredibly friendly, and table QR code ordering is fast and convenient.',
                rating: 5,
              },
              {
                name: 'Karan Sharma',
                review: 'Perfect place to work or hang out. The Avocado toast was fresh and customized exactly to my spice requirements.',
                rating: 5,
              },
              {
                name: 'Michael Chen',
                review: 'Beautiful ambient vibes. The Penne pasta was al dente and packed with rich Italian tomato flavor. 10/10 recommended!',
                rating: 4.8,
              },
            ].map((r, i) => (
              <div key={i} className="bg-card text-card-foreground border border-border/50 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-1 text-primary">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star key={idx} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm italic text-muted-foreground">"{r.review}"</p>
                <div className="border-t border-border/40 pt-3">
                  <h5 className="font-bold text-xs text-foreground">{r.name}</h5>
                  <span className="text-[10px] text-muted-foreground">Verified Diner</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Location Section */}
      <section id="contact" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h2 className="font-serif text-3xl font-bold text-foreground">Find Us Here</h2>
          <p className="text-muted-foreground text-sm">
            Visit us today or get in touch for custom events, parties, or bulk catering requests.
          </p>

          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-primary shrink-0" />
              <span>{restaurant.address}</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-primary shrink-0" />
              <span>{restaurant.contact}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary shrink-0" />
              <span>Open Daily: 8:00 AM - 10:30 PM</span>
            </div>
          </div>
        </div>

        {/* Embedded Map Visual Mock */}
        <div className="h-64 md:h-80 bg-stone-200 dark:bg-stone-800 rounded-3xl relative overflow-hidden shadow-lg border border-border/50">
          <div className="absolute inset-0 bg-stone-300 dark:bg-stone-700 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <MapPin className="w-10 h-10 text-primary animate-bounce mb-2" />
            <h4 className="font-bold text-foreground text-sm mb-1">Gourmet Food District Maps</h4>
            <p className="text-xs text-stone-500 max-w-xs">{restaurant.address}</p>
          </div>
        </div>
      </section>

      {/* Social Footer */}
      <footer className="border-t border-border bg-stone-900 text-stone-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Coffee className="w-6 h-6 text-primary" />
            <span className="font-serif text-stone-100 font-bold text-lg">{restaurant.name}</span>
          </div>

          <p className="text-xs text-stone-500">
            &copy; {new Date().getFullYear()} {restaurant.name}. Powered by CafeFlow SaaS Platform.
          </p>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="hover:text-primary cursor-pointer">Instagram</span>
            <span className="hover:text-primary cursor-pointer">Facebook</span>
            <span className="hover:text-primary cursor-pointer">Twitter</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
