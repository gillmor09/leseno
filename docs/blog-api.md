# Blog REST API (n8n / multipart)

Create marketing blog posts via **multipart/form-data**. The cover image is a binary file field; it is embedded as a Base64 data URL at the **top** of `html_body` (same as the admin Quill editor — not Supabase Storage).

## Auth

Env: `BLOG_API_KEY`

Header (OpenAPI / n8n):

```http
X-Api-Key: <BLOG_API_KEY>
```

(`Authorization: Bearer …` is also accepted.)

## Endpoint

`POST /api/blog/posts`  
`Content-Type: multipart/form-data`

### Form fields

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | beliebige Länge |
| `body` | yes | HTML or Markdown/plain text |
| `slug` | yes | only `a-z`, `0-9`, `-` (mind. 2 Zeichen, keine Maximallänge) |
| `image` | yes | file: JPEG, PNG, WebP, GIF (max ~3 MB) |
| `excerpt` | no | Teaser / Kurzbeschreibung, beliebige Länge |
| `status` | no | `published` (default) or `draft` |

### Response `201`

```json
{
  "success": true,
  "id": "e796efce-ff63-44ff-bc9f-857027c4b1c0",
  "url": "/blog/mein-neuer-blogbeitrag"
}
```

### Errors

- `401` — missing/invalid API key  
- `400` — validation / missing image  
- `413` — image too large  
- `409` — slug already taken  

### n8n

Use an HTTP Request node:

- Method: POST  
- URL: `https://<host>/api/blog/posts`  
- Authentication / Header: `X-Api-Key`  
- Body: Form-Data / Multipart  
- Fields: `title`, `body`, `slug`, `image` (Binary), optional `excerpt`, `status`
