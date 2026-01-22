'use client';

/**
 * Mobile Education Content Component (US-269)
 *
 * Displays educational articles and wellness tips
 * prescribed to the patient.
 */

import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  BookOpen,
  ChevronRight,
  CheckCircle,
  Clock,
  Lightbulb,
  User,
  Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Article {
  id: string;
  title: string;
  content: string;
  summary?: string;
  category: string;
  readingLevel: string;
  language: string;
  featuredImageUrl?: string;
  viewCount: number;
}

interface PrescribedArticle {
  id: string;
  isRead: boolean;
  readAt?: string;
  assignedAt: string;
  article: Article;
  prescriber: {
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

interface WellnessTip extends Article {}

interface MobileEducationContentProps {
  prescribedArticles: PrescribedArticle[];
  wellnessTips: WellnessTip[];
  onMarkRead: (prescribedArticleId: string) => Promise<void>;
  onViewArticle: (articleId: string) => void;
  isLoading?: boolean;
}

// Simple markdown-like text renderer for safe content display
function renderSafeContent(content: string): React.ReactNode[] {
  // Split by double newlines for paragraphs
  const paragraphs = content.split(/\n\n+/);

  return paragraphs.map((paragraph, index) => {
    // Check for headers
    if (paragraph.startsWith('# ')) {
      return (
        <h2 key={index} className="text-lg font-bold mt-4 mb-2">
          {paragraph.slice(2)}
        </h2>
      );
    }
    if (paragraph.startsWith('## ')) {
      return (
        <h3 key={index} className="text-base font-semibold mt-3 mb-2">
          {paragraph.slice(3)}
        </h3>
      );
    }
    if (paragraph.startsWith('### ')) {
      return (
        <h4 key={index} className="text-sm font-semibold mt-2 mb-1">
          {paragraph.slice(4)}
        </h4>
      );
    }

    // Check for bullet lists
    if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
      const items = paragraph.split('\n').filter(line => line.trim());
      return (
        <ul key={index} className="list-disc list-inside space-y-1 my-2">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-gray-700">
              {item.replace(/^[-*]\s*/, '')}
            </li>
          ))}
        </ul>
      );
    }

    // Check for numbered lists
    if (/^\d+\.\s/.test(paragraph)) {
      const items = paragraph.split('\n').filter(line => line.trim());
      return (
        <ol key={index} className="list-decimal list-inside space-y-1 my-2">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-gray-700">
              {item.replace(/^\d+\.\s*/, '')}
            </li>
          ))}
        </ol>
      );
    }

    // Regular paragraph
    const lines = paragraph.split('\n');
    return (
      <p key={index} className="text-sm text-gray-700 my-2">
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            {line}
            {i < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export function MobileEducationContent({
  prescribedArticles,
  wellnessTips,
  onMarkRead,
  isLoading = false,
}: MobileEducationContentProps) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedPrescribedId, setSelectedPrescribedId] = useState<string | null>(null);
  const [showArticleDialog, setShowArticleDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMarking, setIsMarking] = useState(false);

  const unreadArticles = prescribedArticles.filter((a) => !a.isRead);
  const readArticles = prescribedArticles.filter((a) => a.isRead);

  const handleOpenArticle = async (article: Article, prescribedId?: string) => {
    setSelectedArticle(article);
    setSelectedPrescribedId(prescribedId || null);
    setShowArticleDialog(true);
  };

  const handleMarkAsRead = async () => {
    if (!selectedPrescribedId) return;

    setIsMarking(true);
    try {
      await onMarkRead(selectedPrescribedId);
    } finally {
      setIsMarking(false);
    }
  };

  const getReadingLevelBadge = (level: string) => {
    switch (level) {
      case 'SIMPLE':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Easy Read</Badge>;
      case 'STANDARD':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Standard</Badge>;
      case 'DETAILED':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Detailed</Badge>;
      default:
        return null;
    }
  };

  const filteredTips = useMemo(() => {
    return wellnessTips.filter((tip) =>
      tip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tip.summary?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [wellnessTips, searchQuery]);

  const selectedPrescribed = useMemo(() => {
    return prescribedArticles.find((p) => p.id === selectedPrescribedId);
  }, [prescribedArticles, selectedPrescribedId]);

  return (
    <div className="space-y-4 px-4 pb-4">
      {/* Unread Count Banner */}
      {unreadArticles.length > 0 && (
        <Card className="bg-gradient-to-r from-[#053e67] to-[#0a5a94]">
          <CardContent className="py-4">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold">{unreadArticles.length} Unread</div>
                  <div className="text-sm text-white/80">Articles from your provider</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/60" />
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="prescribed" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="prescribed">
            Prescribed ({prescribedArticles.length})
          </TabsTrigger>
          <TabsTrigger value="tips">
            Wellness Tips ({wellnessTips.length})
          </TabsTrigger>
        </TabsList>

        {/* Prescribed Articles Tab */}
        <TabsContent value="prescribed" className="space-y-3 mt-4">
          {prescribedArticles.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <BookOpen className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Prescribed Articles
                </h3>
                <p className="text-gray-500 text-sm">
                  Your provider hasn&apos;t assigned any educational content yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Unread Articles */}
              {unreadArticles.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Unread
                  </h3>
                  {unreadArticles.map((prescribed) => (
                    <Card
                      key={prescribed.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors border-l-4 border-l-[#c90000]"
                      onClick={() => handleOpenArticle(prescribed.article, prescribed.id)}
                    >
                      <CardContent className="py-4 px-4">
                        <div className="flex gap-3">
                          {prescribed.article.featuredImageUrl && (
                            <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                              <img
                                src={prescribed.article.featuredImageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-medium text-gray-900 line-clamp-2">
                                {prescribed.article.title}
                              </h4>
                              <Badge className="bg-[#c90000] flex-shrink-0">New</Badge>
                            </div>
                            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                              {prescribed.article.summary}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                              <User className="w-3 h-3" />
                              <span>
                                Dr. {prescribed.prescriber.user.firstName}{' '}
                                {prescribed.prescriber.user.lastName}
                              </span>
                              <span>•</span>
                              <span>
                                {format(new Date(prescribed.assignedAt), 'MMM d')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Read Articles */}
              {readArticles.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Completed
                  </h3>
                  {readArticles.map((prescribed) => (
                    <Card
                      key={prescribed.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors opacity-75"
                      onClick={() => handleOpenArticle(prescribed.article, prescribed.id)}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-700 truncate">
                              {prescribed.article.title}
                            </h4>
                            <p className="text-xs text-gray-500">
                              Read {prescribed.readAt && format(new Date(prescribed.readAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Wellness Tips Tab */}
        <TabsContent value="tips" className="space-y-3 mt-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search wellness tips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredTips.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Lightbulb className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery ? 'No Results Found' : 'No Wellness Tips'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery
                    ? 'Try a different search term.'
                    : 'Wellness tips based on your care plan will appear here.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTips.map((tip) => (
                <Card
                  key={tip.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => handleOpenArticle(tip)}
                >
                  <CardContent className="py-4 px-4">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-gray-900 line-clamp-2">
                            {tip.title}
                          </h4>
                          {getReadingLevelBadge(tip.readingLevel)}
                        </div>
                        {tip.summary && (
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                            {tip.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {tip.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Article Reader Dialog */}
      <Dialog open={showArticleDialog} onOpenChange={setShowArticleDialog}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="pr-8">{selectedArticle?.title}</DialogTitle>
          </DialogHeader>

          {selectedArticle && (
            <div className="space-y-4">
              {/* Featured Image */}
              {selectedArticle.featuredImageUrl && (
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={selectedArticle.featuredImageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Metadata */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{selectedArticle.category}</Badge>
                {getReadingLevelBadge(selectedArticle.readingLevel)}
              </div>

              {/* Content - using safe renderer */}
              <ScrollArea className="h-[40vh]">
                <div className="prose prose-sm max-w-none">
                  {renderSafeContent(selectedArticle.content)}
                </div>
              </ScrollArea>

              {/* Mark as Read Button */}
              {selectedPrescribedId && !selectedPrescribed?.isRead && (
                <Button
                  onClick={handleMarkAsRead}
                  disabled={isMarking}
                  className="w-full bg-[#053e67] hover:bg-[#042e4e]"
                >
                  {isMarking ? 'Marking...' : 'Mark as Read'}
                  <CheckCircle className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
