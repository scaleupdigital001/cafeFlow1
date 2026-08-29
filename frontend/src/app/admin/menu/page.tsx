'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '../../../lib/axios';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { 
  Loader2, Plus, Edit, Trash2, CheckCircle2, XCircle, Coffee, 
  Search, ToggleLeft, ToggleRight, Info, AlertTriangle, Eye, Sparkles
} from 'lucide-react';

interface CustomizationOption {
  name: string;
  extraPrice: number;
}

interface CustomizationGroup {
  name: string;
  type: 'single' | 'multiple';
  options: CustomizationOption[];
}

interface Dish {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  category: string;
  price: number;
  veg: boolean;
  available: boolean;
  customizations: CustomizationGroup[];
}

export default function AdminMenuPage() {
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Coffee');
  const [customCategory, setCustomCategory] = useState('');
  const [price, setPrice] = useState('');
  const [veg, setVeg] = useState(true);
  const [image, setImage] = useState('');
  const [customizations, setCustomizations] = useState<CustomizationGroup[]>([]);

  // Temp customization group builder fields
  const [tempGroupName, setTempGroupName] = useState('');
  const [tempGroupType, setTempGroupType] = useState<'single' | 'multiple'>('single');
  const [tempOptionName, setTempOptionName] = useState('');
  const [tempOptionPrice, setTempOptionPrice] = useState('');
  const [tempOptionsList, setTempOptionsList] = useState<CustomizationOption[]>([]);

  const visibleCategories = useMemo(() => {
    const defaultCategories = ['Coffee', 'Tea', 'Mocktails', 'Snacks', 'Breakfast', 'Lunch', 'Dinner', 'Desserts'];
    const activeCategories = Array.from(new Set(dishes.map((d) => d.category))).filter(Boolean);
    const categoriesList = Array.from(new Set([...defaultCategories, ...activeCategories]));
    return categoriesList.filter((cat) => dishes.some((d) => d.category === cat));
  }, [dishes]);

  // Automatically reset category filter to 'All' if selected category becomes empty (e.g. last item deleted/moved)
  useEffect(() => {
    if (categoryFilter !== 'All' && !visibleCategories.includes(categoryFilter)) {
      setCategoryFilter('All');
    }
  }, [visibleCategories, categoryFilter]);

  // Load menu items
  const loadMenu = async () => {
    setLoading(true);
    setError(null);
    try {
      const dishesResponse = await api.get('/dishes/my-restaurant');
      setDishes(dishesResponse.data.data);
    } catch (err: any) {
      console.error('Error loading admin menu:', err);
      setError('Failed to retrieve restaurant menu items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMenu();
  }, []);

  const openAddModal = () => {
    setEditingDish(null);
    setName('');
    setDescription('');
    setCategory('Coffee');
    setCustomCategory('');
    setPrice('');
    setVeg(true);
    setImage('');
    setCustomizations([]);
    clearTempGroup();
    setIsFormOpen(true);
  };

  const openEditModal = (dish: Dish) => {
    setEditingDish(dish);
    setName(dish.name);
    setDescription(dish.description || '');
    setCategory(dish.category);
    setCustomCategory('');
    setPrice(dish.price.toString());
    setVeg(dish.veg);
    setImage(dish.image || '');
    setCustomizations(dish.customizations || []);
    clearTempGroup();
    setIsFormOpen(true);
  };

  const clearTempGroup = () => {
    setTempGroupName('');
    setTempGroupType('single');
    setTempOptionName('');
    setTempOptionPrice('');
    setTempOptionsList([]);
  };

  // Add options to custom builder lists
  const handleAddTempOption = () => {
    if (!tempOptionName || !tempOptionPrice) return;
    setTempOptionsList((prev) => [
      ...prev,
      { name: tempOptionName.trim(), extraPrice: Number(tempOptionPrice) },
    ]);
    setTempOptionName('');
    setTempOptionPrice('');
  };

  // Save the customization group to form array
  const handleSaveCustomizationGroup = () => {
    if (!tempGroupName || tempOptionsList.length === 0) return;
    const newGroup: CustomizationGroup = {
      name: tempGroupName.trim(),
      type: tempGroupType,
      options: tempOptionsList,
    };
    setCustomizations((prev) => [...prev, newGroup]);
    clearTempGroup();
  };

  const handleRemoveCustomizationGroup = (idx: number) => {
    setCustomizations((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleToggleAvailability = async (dishId: string) => {
    try {
      const res = await api.patch(`/dishes/${dishId}/toggle-availability`);
      if (res.data.success) {
        setDishes((prev) =>
          prev.map((d) => (d._id === dishId ? { ...d, available: !d.available } : d))
        );
      }
    } catch (err: any) {
      alert('Failed to toggle availability.');
    }
  };

  const handleDeleteDish = async (dishId: string) => {
    if (!window.confirm('Are you sure you want to delete this menu dish permanently?')) return;
    try {
      const res = await api.delete(`/dishes/${dishId}`);
      if (res.data.success) {
        setDishes((prev) => prev.filter((d) => d._id !== dishId));
      }
    } catch (err: any) {
      alert('Failed to delete dish.');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = category === 'custom_add_new' ? customCategory.trim() : category;
    if (!name || !price || !finalCategory) return;

    const payload = {
      name,
      description,
      price: Number(price),
      category: finalCategory,
      veg,
      image: image.trim() || undefined,
      customizations,
    };

    try {
      if (editingDish) {
        // Edit Mode
        const res = await api.patch(`/dishes/${editingDish._id}`, payload);
        if (res.data.success) {
          loadMenu();
          setIsFormOpen(false);
        }
      } else {
        // Add Mode
        const res = await api.post('/dishes', payload);
        if (res.data.success) {
          loadMenu();
          setIsFormOpen(false);
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save menu dish.');
    }
  };

  const filteredDishes = useMemo(() => {
    return dishes.filter((dish) => {
      const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            dish.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = categoryFilter === 'All' || dish.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [dishes, searchQuery, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-black text-2xl tracking-tight">Menu Management</h2>
          <p className="text-xs text-muted-foreground">Add new dishes, manage category listings, and set options.</p>
        </div>

        <Button onClick={openAddModal} className="cursor-pointer gap-1.5 h-10 font-bold shadow-md">
          <Plus className="w-5 h-5" /> Add Menu Dish
        </Button>
      </div>

      {/* Filters Section */}
      <Card className="border border-border/50 shadow-sm p-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active dishes..."
              className="w-full text-sm bg-secondary/50 border border-border rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-none pb-1 md:pb-0">
            <button
              onClick={() => setCategoryFilter('All')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer ${
                categoryFilter === 'All'
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'bg-secondary/40 text-muted-foreground border-border hover:bg-secondary'
              }`}
            >
              All Categories
            </button>
            {visibleCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-secondary/40 text-muted-foreground border-border hover:bg-secondary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Dishes List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredDishes.length === 0 ? (
        <Card className="border-2 border-dashed border-border/60 py-20 text-center space-y-2">
          <Coffee className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <h3 className="font-serif font-bold text-muted-foreground">No dishes matching filters</h3>
          <p className="text-xs text-muted-foreground/80">Click 'Add Menu Dish' above to create menu items.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDishes.map((dish) => (
            <Card key={dish._id} className="overflow-hidden border border-border/60 hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="h-44 bg-stone-200 relative overflow-hidden">
                  <img
                    src={dish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'}
                    alt={dish.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 bg-card px-2.5 py-0.5 rounded-full shadow text-[10px] font-bold flex items-center gap-1 border border-border/40">
                    <span className={`w-2 h-2 rounded-full ${dish.veg ? 'bg-green-600' : 'bg-red-600'}`} />
                    {dish.veg ? 'Veg' : 'Non-Veg'}
                  </div>

                  <button
                    onClick={() => handleToggleAvailability(dish._id)}
                    className="absolute top-3 right-3 p-1.5 rounded-full bg-card shadow border border-border/40 hover:bg-secondary cursor-pointer"
                    title={dish.available ? 'Toggle out-of-stock' : 'Toggle in-stock'}
                  >
                    {dish.available ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4.5 h-4.5 text-destructive" />
                    )}
                  </button>
                </div>

                <div className="p-5 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{dish.category}</span>
                    <Badge variant={dish.available ? 'success' : 'secondary'} className="text-[9px] py-0.5 font-bold">
                      {dish.available ? 'In Stock' : 'Out of Stock'}
                    </Badge>
                  </div>
                  <h3 className="font-serif font-bold text-base leading-snug">{dish.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{dish.description}</p>

                  {/* Options tags preview */}
                  {dish.customizations && dish.customizations.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1.5">
                      {dish.customizations.map((c, i) => (
                        <span key={i} className="text-[9px] bg-secondary text-muted-foreground border border-border px-2 py-0.5 rounded font-bold">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-border/40 bg-secondary/10 flex items-center justify-between gap-3">
                <span className="font-extrabold text-sm text-foreground">Rs. {dish.price.toFixed(2)}</span>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(dish)}
                    className="p-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-primary transition-all cursor-pointer"
                    title="Edit Item"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteDish(dish._id)}
                    className="p-2 rounded-lg border border-border bg-background text-muted-foreground hover:text-destructive transition-all cursor-pointer"
                    title="Delete Item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dish Form Modal Dialog Overlay */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-2xl rounded-2xl border border-border shadow-2xl overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-lg">{editingDish ? 'Edit Menu Dish' : 'Create Menu Dish'}</h3>
                <span className="text-xs text-muted-foreground">Set up dish details and customization modifiers</span>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Dish Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Hazelnut Espresso"
                    className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Base Price (Rs.)</label>
                  <input
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 180"
                    className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all cursor-pointer"
                  >
                    {categoriesList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="custom_add_new">+ Add New Category</option>
                  </select>
                </div>

                {category === 'custom_add_new' && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">New Category Name</label>
                    <input
                      type="text"
                      required
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="e.g. Soups, Juices"
                      className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                    />
                  </div>
                )}

                <div className="flex items-center pt-6">
                  <button
                    type="button"
                    onClick={() => setVeg(!veg)}
                    className={`px-4 py-2 border rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      veg 
                        ? 'bg-green-600/10 text-green-600 border-green-600/20' 
                        : 'bg-red-600/10 text-red-600 border-red-600/20'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${veg ? 'bg-green-600' : 'bg-red-600'}`} />
                    {veg ? 'Marked Veg' : 'Marked Non-Veg'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Rich dark coffee bean extract brewed freshly with organic milk..."
                  className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl p-3 h-20 resize-none outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Image URL (Optional)</label>
                <input
                  type="url"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://images.unsplash.com/... or blank for default"
                  className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                />
              </div>

              {/* Nested Customizations Builder */}
              <div className="border-t border-border/50 pt-4">
                <span className="text-xs font-bold text-primary uppercase tracking-widest block mb-3">Customization modifiers</span>
                
                {/* List added groups */}
                {customizations.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {customizations.map((g, i) => (
                      <div key={i} className="flex justify-between items-center bg-secondary/40 p-3 rounded-xl border border-border/50">
                        <div>
                          <span className="font-bold text-xs">{g.name} </span>
                          <span className="text-[10px] bg-secondary text-muted-foreground px-2 py-0.5 rounded font-semibold capitalize ml-1">{g.type}</span>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            Options: {g.options.map(o => `${o.name} (+Rs.${o.extraPrice})`).join(', ')}
                          </div>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomizationGroup(i)}
                          className="text-xs font-bold text-destructive hover:underline cursor-pointer focus:outline-none"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Build new group form */}
                <div className="bg-secondary/20 p-4 rounded-xl border border-border/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground mb-1 uppercase">Group Name</label>
                      <input
                        type="text"
                        value={tempGroupName}
                        onChange={(e) => setTempGroupName(e.target.value)}
                        placeholder="e.g. Spice Level"
                        className="w-full text-xs bg-background text-foreground border border-border rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground mb-1 uppercase">Selection Type</label>
                      <select
                        value={tempGroupType}
                        onChange={(e) => setTempGroupType(e.target.value as any)}
                        className="w-full text-xs bg-background text-foreground border border-border rounded-lg px-2.5 py-2 outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="single">Single Select (Radio buttons)</option>
                        <option value="multiple">Multi Select (Checkboxes)</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-3 space-y-2">
                    <span className="text-[10px] font-bold text-foreground uppercase block">Add Option Items</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tempOptionName}
                        onChange={(e) => setTempOptionName(e.target.value)}
                        placeholder="e.g. Extra Spicy"
                        className="flex-1 text-xs bg-background text-foreground border border-border rounded-lg px-2.5 py-2 outline-none"
                      />
                      <input
                        type="number"
                        value={tempOptionPrice}
                        onChange={(e) => setTempOptionPrice(e.target.value)}
                        placeholder="Price (Rs.)"
                        className="w-24 text-xs bg-background text-foreground border border-border rounded-lg px-2.5 py-2 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddTempOption}
                        className="px-3 py-2 bg-secondary hover:bg-muted text-xs font-bold rounded-lg cursor-pointer border border-border"
                      >
                        Add Option
                      </button>
                    </div>

                    {/* Temp Option List */}
                    {tempOptionsList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tempOptionsList.map((o, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 bg-background border border-border text-[10px] px-2 py-0.5 rounded font-semibold text-foreground">
                            {o.name}: +Rs.{o.extraPrice}
                            <button
                              type="button"
                              onClick={() => setTempOptionsList(prev => prev.filter((_, i) => i !== idx))}
                              className="text-muted-foreground hover:text-destructive font-black ml-1 text-xs"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveCustomizationGroup}
                    disabled={!tempGroupName || tempOptionsList.length === 0}
                    className="w-full py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg cursor-pointer disabled:opacity-40"
                  >
                    Save Customization Group
                  </button>
                </div>
              </div>

              <div className="p-4 border-t border-border flex items-center justify-end gap-3 bg-secondary/10">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} className="cursor-pointer font-bold">
                  Cancel
                </Button>
                <Button type="submit" className="cursor-pointer font-bold">
                  {editingDish ? 'Update Dish' : 'Create Dish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
