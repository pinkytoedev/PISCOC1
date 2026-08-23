import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            That address doesn't match anything in this workspace. It may have moved,
            or the link that brought you here may be out of date.
          </p>

          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link href="/">Back to dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/articles">Go to articles</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
