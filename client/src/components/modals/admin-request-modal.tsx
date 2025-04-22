import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AdminRequest {
  id: number;
  title: string;
  description: string;
  category: 'Pinkytoe' | 'PISCOC' | 'Misc';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  discordUserId?: string;
  discordUserName?: string;
  notes?: string;
}

interface AdminRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: AdminRequest | null;
}

export function AdminRequestModal({ isOpen, onClose, request }: AdminRequestModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [status, setStatus] = useState<string>('open');
  const [notes, setNotes] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Reset form when a new request is loaded
  useEffect(() => {
    if (request) {
      setStatus(request.status);
      setNotes(request.notes || '');
    }
  }, [request]);

  const handleSubmit = async () => {
    if (!request) return;
    
    setIsUpdating(true);
    
    try {
      await apiRequest(
        'PATCH',
        `/api/admin-requests/${request.id}`, 
        {
          status,
          notes,
          updatedAt: new Date().toISOString()
        }
      );
      
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['/api/admin-requests'] });
      
      toast({
        title: "Request updated",
        description: `The request has been ${status === 'resolved' ? 'resolved' : 'updated'} successfully.`,
      });
      
      onClose();
    } catch (error) {
      console.error("Error updating admin request", error);
      toast({
        title: "Update failed",
        description: "There was an error updating the request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleDelete = async () => {
    if (!request) return;
    
    setIsDeleting(true);
    
    try {
      await apiRequest(
        'DELETE',
        `/api/admin-requests/${request.id}`
      );
      
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['/api/admin-requests'] });
      
      toast({
        title: "Request deleted",
        description: "The request has been permanently deleted.",
      });
      
      setDeleteDialogOpen(false);
      onClose();
    } catch (error) {
      console.error("Error deleting admin request", error);
      toast({
        title: "Delete failed",
        description: "There was an error deleting the request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Status badge renderer
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'resolved':
        return <Badge className="bg-green-600 hover:bg-green-700">Resolved</Badge>;
      case 'closed':
        return <Badge className="bg-gray-600 hover:bg-gray-700">Closed</Badge>;
      case 'in-progress':
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">In Progress</Badge>;
      case 'open':
      default:
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Open</Badge>;
    }
  };

  // Urgency badge renderer
  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <Badge variant="destructive" className="bg-red-600">Critical</Badge>;
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>;
      case 'low':
      default:
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 hover:bg-blue-200">Low</Badge>;
    }
  };

  // Category badge renderer
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Pinkytoe':
        return <Badge variant="default" className="bg-pink-500 hover:bg-pink-600">Pinkytoe</Badge>;
      case 'PISCOC':
        return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">PISCOC</Badge>;
      case 'Misc':
      default:
        return <Badge variant="outline" className="bg-gray-200 text-gray-800 hover:bg-gray-300">Misc</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        {!request ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Admin Request #{request.id}</span>
                {getStatusBadge(request.status)}
              </DialogTitle>
              <DialogDescription>
                Created {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })} by {request.createdBy}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-medium">{request.title}</h3>
                  <div className="flex gap-2">
                    {getUrgencyBadge(request.urgency)}
                    {getCategoryBadge(request.category)}
                  </div>
                </div>
                <p className="text-gray-700 whitespace-pre-line">{request.description}</p>
              </div>
              
              {request.discordUserName && (
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">
                    <strong>Discord User:</strong> {request.discordUserName}
                  </p>
                </div>
              )}
              
              <Separator />
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this request..."
                    rows={4}
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center">
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 flex items-center gap-1">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Admin Request</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this admin request? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        className="bg-red-500 hover:bg-red-600 text-white"
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          "Delete"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {request.updatedAt && (
                  <p className="text-xs text-gray-500 ml-4">
                    Last updated: {formatDistanceToNow(new Date(request.updatedAt), { addSuffix: true })}
                  </p>
                )}
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isUpdating}>
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : status === 'resolved' ? (
                    'Resolve Request'
                  ) : (
                    'Update Request'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}