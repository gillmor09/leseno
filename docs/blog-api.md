# Blog REST API

Create marketing blog posts via JSON. Images are **not** stored in Supabase Storage — they are embedded as Base64 data URLs in `html_body`, same as the admin Quill editor.

## Auth

Set `BLOG_API_KEY` in the environment (Coolify / `.env.local`). Send it on every request:

- `Authorization: Bearer <BLOG_API_KEY>`, or
- `X-Api-Key: <BLOG_API_KEY>`

## Endpoint

`POST /api/blog/posts`

### Body

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | max 200 |
| `excerpt` | no | Kurzbeschreibung, max 500 |
| `body` | no | HTML or plain text (paragraphs via blank lines) |
| `image` | yes | `{ "base64": "…", "mimeType": "image/jpeg", "alt": "…" }` — raw base64 or full `data:image/…;base64,…` |
| `slug` | no | derived from title if omitted |
| `status` | no | `draft` (default) or `published` |
| `publishedAt` | no | ISO datetime |

The API builds one `html_body` like Quill: hero image as `<p><img src="data:image/…;base64,…">` **above** the article text, then saves via the same `upsertBlogPost` RPC as the admin form. Nothing goes to Storage.

### Example

```http
POST /api/blog/posts
Authorization: Bearer YOUR_KEY
Content-Type: application/json

{
  "title": "Mein Artikel",
  "excerpt": "Kurzbeschreibung für die Liste",
  "body": "<p>Erster Absatz…</p><p>Zweiter Absatz…</p>",
  "image": {
    "base64": "/9j/4AAQ…",
    "mimeType": "image/jpeg",
    "alt": "Titelbild"
  },
  "status": "published"
}
```

### Response `201`

```json
{
  "id": "…",
  "slug": "mein-artikel",
  "title": "Mein Artikel",
  "status": "published",
  "url": "/blog/mein-artikel"
}
```

Errors: `401` (key), `400` (validation), `413` (image/body too large), `409` (slug taken).
