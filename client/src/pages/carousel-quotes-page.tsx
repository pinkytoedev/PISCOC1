import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CarouselQuote, InsertCarouselQuote } from "@shared/schema";
import { Plus, Edit, Trash2, Loader2, Quote, CloudUpload, RefreshCw, Upload, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function CarouselQuotesPage() {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<CarouselQuote | null>(null);
  const [formData, setFormData] = useState<InsertCarouselQuote & { externalId?: string }>({
    carousel: "",
    quote: "",
    main: "",
    philo: "",
  });

  const { data: quotes, isLoading } = useQuery<CarouselQuote[]>({
    queryKey: ['/api/carousel-quotes'],
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (quote: InsertCarouselQuote) => {
      const res = await apiRequest(
        editQuote ? "PUT" : "POST",
        editQuote ? `/api/carousel-quotes/${editQuote.id}` : "/api/carousel-quotes",
        quote
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/carousel-quotes'] });
      toast({
        title: editQuote ? "Quote updated" : "Quote created",
        description: editQuote
          ? "The quote has been updated successfully."
          : "The quote has been created successfully.",
      });
      handleCloseModal();
    },
    onError: (error) => {
      toast({
        title: editQuote ? "Error updating quote" : "Error creating quote",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/carousel-quotes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/carousel-quotes'] });
      toast({
        title: "Quote deleted",
        description: "The quote has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting quote",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  // New mutation to update quotes directly in Airtable
  // Pull from Airtable (sync quotes from Airtable to our application)
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/airtable/sync/carousel-quotes");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/carousel-quotes'] });
      toast({
        title: "Quotes pulled from Airtable",
        description: `Successfully synced quotes: ${data.results.created} created, ${data.results.updated} updated`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error pulling from Airtable",
        description: error.message || "Failed to sync quotes from Airtable. Please check your connection settings.",
        variant: "destructive",
      });
    },
  });

  // Push all quotes to Airtable (batch update)
  const pushMutation = useMutation({
    mutationFn: async () => {
      // We'll create an endpoint for this
      const res = await apiRequest("POST", "/api/airtable/push/carousel-quotes");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/carousel-quotes'] });
      toast({
        title: "Quotes pushed to Airtable",
        description: `Successfully pushed ${data.updated || 0} quotes to Airtable.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error pushing to Airtable",
        description: error.message || "Failed to push quotes to Airtable. Please check your connection settings.",
        variant: "destructive",
      });
    },
  });

  // Update a single quote in Airtable
  const updateAirtableMutation = useMutation({
    mutationFn: async (quote: Partial<CarouselQuote>) => {
      if (!quote.id || !quote.externalId) {
        throw new Error("Cannot update Airtable: Missing quote ID or external ID");
      }
      // Create a payload with only the fields needed for Airtable
      const airtablePayload = {
        id: quote.id,
        externalId: quote.externalId,
        main: quote.main || quote.carousel,
        philo: quote.philo || quote.quote
      };
      const res = await apiRequest(
        "POST",
        `/api/airtable/update-quote/${quote.id}`,
        airtablePayload
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/carousel-quotes'] });
      toast({
        title: "Airtable updated",
        description: "The quote has been successfully updated in Airtable.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating Airtable",
        description: error.message || "An error occurred while updating Airtable. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Group quotes by carousel
  const groupedQuotes = quotes?.reduce((acc, quote) => {
    if (!acc[quote.carousel]) {
      acc[quote.carousel] = [];
    }
    acc[quote.carousel].push(quote);
    return acc;
  }, {} as Record<string, CarouselQuote[]>);

  const handleCreateClick = () => {
    setEditQuote(null);
    setFormData({
      carousel: "",
      quote: "",
      main: "",
      philo: "",
    });
    setIsModalOpen(true);
  };

  const handleEditClick = (quote: CarouselQuote) => {
    setEditQuote(quote);
    setFormData({
      // Keep carousel and quote for compatibility with the API
      carousel: quote.carousel,
      quote: quote.quote,
      // Display main and philo in the form
      main: quote.main ?? quote.carousel,
      philo: quote.philo ?? quote.quote,
      externalId: quote.externalId ?? undefined,
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = (quote: CarouselQuote) => {
    if (confirm("Are you sure you want to delete this quote?")) {
      deleteQuoteMutation.mutate(quote.id);
    }
  };

  // Function to handle updating a quote directly in Airtable
  const handleUpdateAirtable = (quote: CarouselQuote) => {
    if (!quote.externalId) {
      toast({
        title: "Cannot update Airtable",
        description: "This quote doesn't have an associated Airtable record.",
        variant: "destructive",
      });
      return;
    }

    updateAirtableMutation.mutate({
      id: quote.id,
      externalId: quote.externalId,
      main: quote.main || quote.carousel || null,
      philo: quote.philo || quote.quote || null
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Make sure to copy main to carousel and philo to quote for API compatibility
    const quoteData = {
      ...formData,
      // Ensure both carousel and quote fields have values for the API
      carousel: formData.main || formData.carousel || "",
      quote: formData.philo || formData.quote || ""
    };

    createQuoteMutation.mutate(quoteData);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditQuote(null);
    setFormData({
      carousel: "",
      quote: "",
      main: "",
      philo: "",
    });
  };

  // Function to pull quotes from Airtable
  const handlePullFromAirtable = () => {
    if (confirm("This will pull all quotes from Airtable. Existing quotes with matching IDs will be updated. Continue?")) {
      syncMutation.mutate();
    }
  };

  // Function to push all quotes to Airtable
  const handlePushToAirtable = () => {
    if (confirm("This will push all quotes to Airtable. Continue?")) {
      pushMutation.mutate();
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Carousel Quotes" />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <nav className="text-sm font-medium mb-6" aria-label="Breadcrumb">
              <ol className="flex items-center space-x-2">
                <li>
                  <a href="/" className="text-gray-500 hover:text-gray-700">Dashboard</a>
                </li>
                <li className="flex items-center">
                  <svg className="h-4 w-4 text-gray-400 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-900">Carousel Quotes</span>
                </li>
              </ol>
            </nav>

            {/* Page Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Carousel Quotes</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Manage testimonials and quotes displayed in carousels.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handlePullFromAirtable} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Pull from Airtable
                </Button>
                <Button variant="outline" onClick={handlePushToAirtable} disabled={pushMutation.isPending}>
                  {pushMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Push to Airtable
                </Button>
                <Button onClick={handleCreateClick}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Quote
                </Button>
              </div>
            </div>

            {/* Quotes by Carousel */}
            {isLoading ? (
              <div className="space-y-6">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader className="pb-2">
                      <div className="h-5 bg-gray-200 rounded w-1/4"></div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {[1, 2, 3].map((j) => (
                        <div key={j} className="p-4 border rounded-md">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-full"></div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <>
                {groupedQuotes && Object.keys(groupedQuotes).length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(groupedQuotes).map(([carousel, carouselQuotes]) => (
                      <Card key={carousel}>
                        <CardHeader className="pb-2">
                          <CardTitle>{carousel}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {carouselQuotes.map((quote) => (
                            <div key={quote.id} className="p-4 border rounded-md bg-white relative">
                              <Quote className="h-6 w-6 text-gray-300 absolute top-3 left-3" />
                              <div className="ml-8">
                                <p className="text-gray-800 italic">"{quote.quote}"</p>
                                <div className="flex justify-end mt-2 space-x-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEditClick(quote)}
                                    title="Edit Quote"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() => handleDeleteClick(quote)}
                                    title="Delete Quote"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Quote className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900">No quotes found</h3>
                      <p className="mt-2 text-sm text-gray-500">Get started by adding your first quote for a carousel.</p>
                      <Button onClick={handleCreateClick} className="mt-4">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Quote
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Create/Edit Quote Modal */}
            <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editQuote ? "Edit Quote" : "Add Quote"}</DialogTitle>
                  <DialogDescription>
                    {editQuote
                      ? "Update the quote for this carousel."
                      : "Add a new quote to display in a carousel."}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="main">Main Field</Label>
                    <Input
                      id="main"
                      name="main"
                      value={formData.main || ""}
                      onChange={handleInputChange}
                      placeholder="Main field value (carousel identifier)"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This identifies which carousel the quote belongs to. Quotes with the same identifier will be grouped together.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="philo">Quote Content</Label>
                    <Textarea
                      id="philo"
                      name="philo"
                      value={formData.philo || ""}
                      onChange={handleInputChange}
                      placeholder="Enter the quote text here"
                      rows={4}
                      required
                    />
                  </div>

                  <DialogFooter className="flex gap-2 justify-end">
                    <Button variant="outline" type="button" onClick={handleCloseModal}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createQuoteMutation.isPending}>
                      {createQuoteMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {editQuote ? "Updating..." : "Creating..."}
                        </>
                      ) : (
                        editQuote ? "Update Quote" : "Add Quote"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </div>
  );
}
