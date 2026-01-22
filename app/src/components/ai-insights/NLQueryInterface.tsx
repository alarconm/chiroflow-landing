'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  Send,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  History,
  Lightbulb,
} from 'lucide-react';

interface QueryResult {
  query: string;
  intent: string;
  responseType: string;
  data: {
    value?: number;
    formatted?: string;
    period?: string;
    count?: number;
    breakdown?: Record<string, number>;
  } | null;
  explanation: string;
  suggestedFollowUps?: string[];
  executionTimeMs: number;
}

export function NLQueryInterface() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: suggestedQueries } = trpc.aiInsights.getSuggestedQueries.useQuery();
  const { data: queryHistory } = trpc.aiInsights.getQueryHistory.useQuery(
    { limit: 10, onlyMine: true },
    { enabled: showHistory }
  );

  const executeQuery = trpc.aiInsights.query.useMutation({
    onSuccess: (data) => {
      setResult(data as QueryResult);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      executeQuery.mutate({ query: query.trim() });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    executeQuery.mutate({ query: suggestion });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Ask Your Data
        </CardTitle>
        <CardDescription>
          Ask questions about your practice in plain English
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., How much revenue did we make this month?"
            className="flex-1"
          />
          <Button type="submit" disabled={executeQuery.isPending || !query.trim()}>
            {executeQuery.isPending ? (
              <Sparkles className="h-4 w-4 animate-pulse" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Suggested queries */}
        {!result && suggestedQueries && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
              <Lightbulb className="h-4 w-4" />
              Try asking:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.slice(0, 4).map((suggestion, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {executeQuery.isPending && (
          <div className="mt-4 p-4 border rounded-lg">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-1/2 mt-2" />
            <Skeleton className="h-4 w-full mt-4" />
          </div>
        )}

        {/* Result */}
        {result && !executeQuery.isPending && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline">{result.intent.replace('_', ' ')}</Badge>
              <span className="text-xs text-muted-foreground">
                {result.executionTimeMs}ms
              </span>
            </div>

            {/* Value display */}
            {result.data && result.responseType === 'number' && (
              <div className="text-center py-4">
                <p className="text-4xl font-bold text-primary">
                  {result.data.formatted || result.data.value}
                </p>
                {result.data.period && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Period: {result.data.period}
                  </p>
                )}
              </div>
            )}

            {/* Table display */}
            {result.data && result.responseType === 'table' && result.data.breakdown && (
              <div className="py-4">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(result.data.breakdown).map(([key, value]) => (
                      <tr key={key} className="border-b">
                        <td className="py-2">{key}</td>
                        <td className="py-2 text-right font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Explanation */}
            <p className="text-sm mt-4">{result.explanation}</p>

            {/* Suggested follow-ups */}
            {result.suggestedFollowUps && result.suggestedFollowUps.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">You might also ask:</p>
                <div className="flex flex-wrap gap-2">
                  {result.suggestedFollowUps.slice(0, 3).map((suggestion, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">Was this helpful?</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm">
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <ThumbsDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Query history */}
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="text-muted-foreground"
          >
            <History className="h-4 w-4 mr-1" />
            {showHistory ? 'Hide History' : 'Show History'}
          </Button>

          {showHistory && queryHistory && (
            <div className="mt-2 space-y-1">
              {queryHistory.map((item, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left text-sm font-normal"
                  onClick={() => handleSuggestionClick(item.query)}
                >
                  <span className="truncate">{item.query}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
