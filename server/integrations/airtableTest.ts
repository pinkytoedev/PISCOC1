import { Express, Request, Response } from 'express';
import { storage } from '../storage';
import { uploadLinkToAirtableTestField, migrateArticleImagesToLinks } from '../utils/airtableTestField';

/**
 * Register the Airtable test routes
 */
export function registerAirtableTestRoutes(app: Express): void {
  // Direct test endpoint that doesn't require authentication (for development only)
  app.get('/api/airtable/direct-test', async (req: Request, res: Response) => {
    try {
      // Get all articles
      const articles = await storage.getArticles();
      
      // Find the first Airtable article with an image URL
      const testArticle = articles.find(article => 
        article.source === 'airtable' && 
        article.externalId && 
        article.imageUrl
      );
      
      if (!testArticle) {
        return res.status(404).json({ message: 'No suitable Airtable article found for testing' });
      }
      
      // Test uploading the link to the "Test" field in Airtable
      console.log(`Testing article: ${testArticle.id} - ${testArticle.title}`);
      console.log(`ExternalId: ${testArticle.externalId}`);
      console.log(`Image URL: ${testArticle.imageUrl}`);
      
      if (!testArticle.imageUrl) {
        return res.status(400).json({ message: 'Selected article has no image URL' });
      }
      
      if (!testArticle.externalId) {
        return res.status(400).json({ message: 'Selected article has no external ID' });
      }
      
      const success = await uploadLinkToAirtableTestField(
        testArticle.imageUrl,
        testArticle.externalId,
        `test-image-${testArticle.id}.jpg`
      );
      
      if (!success) {
        return res.status(500).json({ 
          message: 'Failed to update Airtable Test field',
          article: {
            id: testArticle.id,
            title: testArticle.title,
            externalId: testArticle.externalId,
            imageUrl: testArticle.imageUrl
          }
        });
      }
      
      return res.json({
        message: 'Successfully updated Airtable Test field with image URL',
        article: {
          id: testArticle.id,
          title: testArticle.title,
          externalId: testArticle.externalId,
          imageUrl: testArticle.imageUrl
        }
      });
    } catch (error) {
      console.error('Error in direct Airtable test:', error);
      return res.status(500).json({ 
        message: 'Failed to process direct test',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  // Test endpoint to upload an image link to the Airtable "Test" field
  app.post('/api/airtable/test-link/:articleId', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: 'Image URL is required' });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Check if this is an Airtable article
      if (article.source !== 'airtable' || !article.externalId) {
        return res.status(400).json({ message: 'This article is not from Airtable' });
      }
      
      // Upload the link to the "Test" field in Airtable
      const success = await uploadLinkToAirtableTestField(
        imageUrl,
        article.externalId,
        `test-image-${article.id}.jpg`
      );
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to update Airtable Test field' });
      }
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'test',
        resourceType: 'image_url',
        resourceId: articleId.toString(),
        details: {
          field: 'Test',
          imageUrl
        }
      });
      
      return res.json({
        message: 'Image URL successfully uploaded to Airtable Test field',
        article: {
          id: article.id,
          title: article.title,
          externalId: article.externalId
        }
      });
    } catch (error) {
      console.error('Error in Airtable Test Link endpoint:', error);
      return res.status(500).json({ 
        message: 'Failed to process test link upload',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint to test migrating a single article's images to the Test field
  app.post('/api/airtable/test-migration/:articleId', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const articleId = parseInt(req.params.articleId);
      if (isNaN(articleId)) {
        return res.status(400).json({ message: 'Invalid article ID' });
      }
      
      // Get the article from the database
      const article = await storage.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      
      // Check if this is an Airtable article
      if (article.source !== 'airtable' || !article.externalId) {
        return res.status(400).json({ message: 'This article is not from Airtable' });
      }
      
      // Run the migration for this article only
      const result = await migrateArticleImagesToLinks(articleId, true);
      
      // Log the activity
      await storage.createActivityLog({
        userId: req.user?.id,
        action: 'test',
        resourceType: 'migration',
        resourceId: articleId.toString(),
        details: result
      });
      
      return res.json({
        message: result.success 
          ? 'Successfully migrated article image to Test field' 
          : 'Failed to migrate article image to Test field',
        result,
        article: {
          id: article.id,
          title: article.title,
          externalId: article.externalId
        }
      });
    } catch (error) {
      console.error('Error in Airtable Test Migration endpoint:', error);
      return res.status(500).json({ 
        message: 'Failed to process test migration',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Endpoint to run a batch migration test for multiple articles
  app.post('/api/airtable/test-batch-migration', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { limit = 1 } = req.body;
      
      // Get Airtable-sourced articles with images
      const articles = await storage.getArticles();
      const airtableArticles = articles
        .filter(article => 
          article.source === 'airtable' && 
          article.externalId && 
          (article.imageUrl || article.instagramImageUrl)
        )
        .slice(0, limit);
      
      if (airtableArticles.length === 0) {
        return res.status(404).json({ message: 'No Airtable articles with images found' });
      }
      
      const results = [];
      
      // Process each article
      for (const article of airtableArticles) {
        const result = await migrateArticleImagesToLinks(article.id, true);
        results.push({
          articleId: article.id,
          title: article.title,
          result
        });
        
        // Log each migration attempt
        await storage.createActivityLog({
          userId: req.user?.id,
          action: 'test',
          resourceType: 'migration',
          resourceId: article.id.toString(),
          details: result
        });
      }
      
      return res.json({
        message: `Tested migration for ${results.length} articles`,
        results
      });
    } catch (error) {
      console.error('Error in Airtable Batch Migration endpoint:', error);
      return res.status(500).json({ 
        message: 'Failed to process batch migration test',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}