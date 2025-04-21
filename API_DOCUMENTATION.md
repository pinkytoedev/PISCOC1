# API Documentation

This document provides details about the available API endpoints in the Multi-Platform Integration Ecosystem.

## Table of Contents

- [Authentication](#authentication)
- [Team Members](#team-members)
- [Articles](#articles)
- [Carousel Quotes](#carousel-quotes)
- [Admin Requests](#admin-requests)
- [Image Assets](#image-assets)
- [Integration Settings](#integration-settings)
- [Activity Logs](#activity-logs)
- [Metrics](#metrics)
- [Migration Progress](#migration-progress)
- [API Status](#api-status)

## Authentication

### Login

- **URL**: `/auth/login`
- **Method**: `POST`
- **Description**: Authenticate user and create a session
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Success Response**: Status: `200 OK`
- **Error Response**: Status: `401 Unauthorized`

### Logout

- **URL**: `/auth/logout`
- **Method**: `POST`
- **Description**: End the current user session
- **Success Response**: Status: `200 OK`

### Get Current User

- **URL**: `/api/user`
- **Method**: `GET`
- **Description**: Get the current authenticated user
- **Success Response**:
  ```json
  {
    "id": "number",
    "username": "string",
    "role": "string"
  }
  ```
- **Error Response**: Status: `401 Unauthorized`

## Team Members

### Get All Team Members

- **URL**: `/api/team-members`
- **Method**: `GET`
- **Description**: Get all team members
- **Success Response**: Array of team member objects

### Get Team Member

- **URL**: `/api/team-members/:id`
- **Method**: `GET`
- **Description**: Get a specific team member by ID
- **Success Response**: Team member object
- **Error Response**: Status: `404 Not Found`

### Create Team Member

- **URL**: `/api/team-members`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a new team member
- **Request Body**: Team member data
- **Success Response**: Created team member object with status `201 Created`
- **Error Response**: Status: `400 Bad Request` or `401 Unauthorized`

### Update Team Member

- **URL**: `/api/team-members/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Description**: Update an existing team member
- **Request Body**: Updated team member data
- **Success Response**: Updated team member object
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Delete Team Member

- **URL**: `/api/team-members/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Description**: Delete a team member
- **Success Response**: Status: `204 No Content`
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

## Articles

### Get All Articles

- **URL**: `/api/articles`
- **Method**: `GET`
- **Description**: Get all articles
- **Success Response**: Array of article objects

### Get Article

- **URL**: `/api/articles/:id`
- **Method**: `GET`
- **Description**: Get a specific article by ID
- **Success Response**: Article object
- **Error Response**: Status: `404 Not Found`

### Create Article

- **URL**: `/api/articles`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a new article
- **Request Body**: Article data
- **Success Response**: Created article object with status `201 Created`
- **Error Response**: Status: `400 Bad Request` or `401 Unauthorized`

### Update Article

- **URL**: `/api/articles/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Description**: Update an existing article
- **Request Body**: Updated article data
- **Success Response**: Updated article object
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Delete Article

- **URL**: `/api/articles/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Description**: Delete an article
- **Success Response**: Status: `204 No Content`
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Get Articles by Status

- **URL**: `/api/articles/status/:status`
- **Method**: `GET`
- **Description**: Get articles filtered by status
- **Success Response**: Array of article objects

### Get Featured Articles

- **URL**: `/api/articles/featured`
- **Method**: `GET`
- **Description**: Get all featured articles
- **Success Response**: Array of article objects

## Carousel Quotes

### Get All Carousel Quotes

- **URL**: `/api/carousel-quotes`
- **Method**: `GET`
- **Description**: Get all carousel quotes
- **Success Response**: Array of carousel quote objects

### Get Carousel Quote

- **URL**: `/api/carousel-quotes/:id`
- **Method**: `GET`
- **Description**: Get a specific carousel quote by ID
- **Success Response**: Carousel quote object
- **Error Response**: Status: `404 Not Found`

### Create Carousel Quote

- **URL**: `/api/carousel-quotes`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a new carousel quote
- **Request Body**: Carousel quote data
- **Success Response**: Created carousel quote object with status `201 Created`
- **Error Response**: Status: `400 Bad Request` or `401 Unauthorized`

### Update Carousel Quote

- **URL**: `/api/carousel-quotes/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Description**: Update an existing carousel quote
- **Request Body**: Updated carousel quote data
- **Success Response**: Updated carousel quote object
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Delete Carousel Quote

- **URL**: `/api/carousel-quotes/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Description**: Delete a carousel quote
- **Success Response**: Status: `204 No Content`
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Get Quotes by Carousel

- **URL**: `/api/carousel-quotes/by-carousel/:carousel`
- **Method**: `GET`
- **Description**: Get carousel quotes filtered by carousel identifier
- **Success Response**: Array of carousel quote objects

## Admin Requests

### Get All Admin Requests

- **URL**: `/api/admin-requests`
- **Method**: `GET`
- **Description**: Get all admin requests
- **Query Parameters**:
  - `status` (optional): Filter by status (open, in-progress, resolved, closed)
  - `category` (optional): Filter by category (Pinkytoe, PISCOC, Misc)
  - `urgency` (optional): Filter by urgency (low, medium, high, critical)
- **Success Response**: Array of admin request objects
- **Example**:
  ```
  GET /api/admin-requests?status=open&category=PISCOC
  ```

### Get Admin Request

- **URL**: `/api/admin-requests/:id`
- **Method**: `GET`
- **Description**: Get a specific admin request by ID
- **Success Response**: Admin request object
- **Error Response**: Status: `404 Not Found`

### Create Admin Request

- **URL**: `/api/admin-requests`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a new admin request
- **Request Body**:
  ```json
  {
    "title": "string",
    "description": "string",
    "category": "Pinkytoe | PISCOC | Misc",
    "urgency": "low | medium | high | critical"
  }
  ```
- **Success Response**: Created admin request object with status `201 Created`
- **Error Response**: Status: `400 Bad Request` or `401 Unauthorized`

### Update Admin Request

- **URL**: `/api/admin-requests/:id`
- **Method**: `PATCH`
- **Auth Required**: Yes
- **Description**: Update an existing admin request
- **Request Body**: Updated fields (any of these fields can be updated)
  ```json
  {
    "title": "string",
    "description": "string",
    "category": "Pinkytoe | PISCOC | Misc",
    "urgency": "low | medium | high | critical",
    "status": "open | in-progress | resolved | closed"
  }
  ```
- **Success Response**: Updated admin request object
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Delete Admin Request

- **URL**: `/api/admin-requests/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Description**: Delete an admin request
- **Success Response**: Status: `204 No Content`
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

## Image Assets

### Get All Image Assets

- **URL**: `/api/image-assets`
- **Method**: `GET`
- **Description**: Get all image assets
- **Success Response**: Array of image asset objects

### Get Image Asset

- **URL**: `/api/image-assets/:id`
- **Method**: `GET`
- **Description**: Get a specific image asset by ID
- **Success Response**: Image asset object
- **Error Response**: Status: `404 Not Found`

### Create Image Asset

- **URL**: `/api/image-assets`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a new image asset
- **Request Body**: Image asset data
- **Success Response**: Created image asset object with status `201 Created`
- **Error Response**: Status: `400 Bad Request` or `401 Unauthorized`

### Delete Image Asset

- **URL**: `/api/image-assets/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Description**: Delete an image asset
- **Success Response**: Status: `204 No Content`
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

## Integration Settings

### Get Integration Settings

- **URL**: `/api/integration-settings/:service`
- **Method**: `GET`
- **Auth Required**: Yes
- **Description**: Get all settings for a specific integration service
- **Success Response**: Array of integration setting objects

### Get Integration Setting

- **URL**: `/api/integration-settings/:service/:key`
- **Method**: `GET`
- **Auth Required**: Yes
- **Description**: Get a specific integration setting by service and key
- **Success Response**: Integration setting object
- **Error Response**: Status: `404 Not Found`

### Create Integration Setting

- **URL**: `/api/integration-settings`
- **Method**: `POST`
- **Auth Required**: Yes
- **Description**: Create a new integration setting
- **Request Body**: Integration setting data
- **Success Response**: Created integration setting object with status `201 Created`
- **Error Response**: Status: `400 Bad Request` or `401 Unauthorized`

### Update Integration Setting

- **URL**: `/api/integration-settings/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Description**: Update an existing integration setting
- **Request Body**: Updated integration setting data
- **Success Response**: Updated integration setting object
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

### Delete Integration Setting

- **URL**: `/api/integration-settings/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Description**: Delete an integration setting
- **Success Response**: Status: `204 No Content`
- **Error Response**: Status: `404 Not Found` or `401 Unauthorized`

## Activity Logs

### Get All Activity Logs

- **URL**: `/api/activity-logs`
- **Method**: `GET`
- **Auth Required**: Yes
- **Description**: Get all activity logs
- **Success Response**: Array of activity log objects

## Metrics

### Get Dashboard Metrics

- **URL**: `/api/metrics`
- **Method**: `GET`
- **Auth Required**: Yes
- **Description**: Get metrics data for dashboard
- **Success Response**: Metrics data object

## Migration Progress

### Get Migration Progress

- **URL**: `/api/migration-progress`
- **Method**: `GET`
- **Description**: Get current migration progress
- **Success Response**: Migration progress data object

## API Status

### Get API Statuses

- **URL**: `/api/status`
- **Method**: `GET`
- **Description**: Get status of all integrated APIs
- **Success Response**: API status data object