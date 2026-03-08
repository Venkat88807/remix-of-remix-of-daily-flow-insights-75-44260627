import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ActivityCategory, getAllCategoryEntries, addCustomCategory } from '@/types/activity';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface CategorySelectProps {
  value: ActivityCategory;
  onValueChange: (value: ActivityCategory) => void;
  id?: string;
}

export const CategorySelect: React.FC<CategorySelectProps> = ({ value, onValueChange, id }) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [entries, setEntries] = useState(getAllCategoryEntries);

  const refreshEntries = () => setEntries(getAllCategoryEntries());

  const handleAddCustom = () => {
    if (!customLabel.trim()) return;
    const cat = addCustomCategory(customLabel.trim());
    refreshEntries();
    onValueChange(cat.key);
    setCustomLabel('');
    setShowCustomInput(false);
  };

  if (showCustomInput) {
    return (
      <div className="flex gap-2">
        <Input
          value={customLabel}
          onChange={e => setCustomLabel(e.target.value)}
          placeholder="Category name..."
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); }
            if (e.key === 'Escape') setShowCustomInput(false);
          }}
          className="flex-1"
        />
        <Button size="sm" onClick={handleAddCustom} disabled={!customLabel.trim()}>Add</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowCustomInput(false)}>✕</Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => {
      if (v === '__add_custom__') {
        setShowCustomInput(true);
        return;
      }
      onValueChange(v as ActivityCategory);
    }}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent side="bottom" avoidCollisions={false} className="max-h-[200px]">
        {entries.map(([key, label]) => (
          <SelectItem key={key} value={key}>{label}</SelectItem>
        ))}
        <SelectItem value="__add_custom__" className="text-primary font-medium">
          <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add Custom</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
};
