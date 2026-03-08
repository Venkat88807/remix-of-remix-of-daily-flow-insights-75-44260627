import React, { useState, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ParsedActivity, Activity, getCustomCategories } from '@/types/activity';
import { getCategoryCorrections } from '@/hooks/useActivities';

const MAX_INPUT_LENGTH = 500;

interface ActivityInputProps {
  onActivityParsed: (activity: ParsedActivity) => void;
  hasOngoingActivity: boolean;
  ongoingActivity?: Activity;
}

export const ActivityInput: React.FC<ActivityInputProps> = ({
  onActivityParsed,
  hasOngoingActivity,
  ongoingActivity,
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isSubmittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent rapid double-clicks
    if (isSubmittingRef.current || !input.trim() || isLoading) return;
    
    // Validate input length
    if (input.trim().length > MAX_INPUT_LENGTH) {
      toast.error(`Description must be ${MAX_INPUT_LENGTH} characters or less. Current: ${input.trim().length}`);
      return;
    }
    
    isSubmittingRef.current = true;
    setIsLoading(true);
    try {
      // Get recent category corrections for AI learning
      const corrections = getCategoryCorrections();
      
      const { data, error } = await supabase.functions.invoke('parse-activity', {
        body: { 
          message: input.trim(),
          hasOngoingActivity,
          categoryCorrections: corrections.slice(-20),
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to parse activity');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      onActivityParsed(data as ParsedActivity);
      setInput('');
      
      // Show feedback based on intent
      if (data.intent === 'stop') {
        toast.success(`Stopped: ${data.description}`);
      } else if (data.intent === 'switch') {
        toast.success(`Switched to: ${data.description}`);
      } else {
        toast.success(`Started: ${data.description}`);
      }
    } catch (error) {
      console.error('Error parsing activity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse activity';
      // Provide user-friendly message for common errors
      if (errorMessage.includes('non-2xx status code')) {
        toast.error('Unable to process your input. Please try a shorter description.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="w-full">
      {hasOngoingActivity && ongoingActivity && (
        <div className="mb-3 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-sm text-muted-foreground">
            Currently tracking:{' '}
            <span className="font-medium text-foreground">{ongoingActivity.description}</span>
          </p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            hasOngoingActivity
              ? "What are you doing now? (e.g., 'taking a break', 'stopped working')"
              : "What are you doing? (e.g., 'started coding', 'having lunch')"
          }
          disabled={isLoading}
          className="flex-1 h-12 text-base"
          maxLength={MAX_INPUT_LENGTH + 50}
          aria-label="Activity description"
        />
        <Button 
          type="submit" 
          disabled={!input.trim() || isLoading}
          size="lg"
          className="h-12 px-6"
          aria-label="Submit activity"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </form>
      
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Just describe what you're doing — time is captured automatically</span>
        <span className={input.length > MAX_INPUT_LENGTH ? 'text-destructive' : ''}>
          {input.length}/{MAX_INPUT_LENGTH}
        </span>
      </div>
    </div>
  );
};
