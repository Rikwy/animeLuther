# Anime Luther

A responsive anime discovery site with live anime metadata from AniList, search, details, and a browser-local watchlist.

## Run locally
Requires Node.js 18 or newer.

```bash
npm install
npm start
```
Open http://localhost:3000

## Deploy to Render
1. Push this folder to a GitHub repository.
2. In Render choose **New + → Web Service** and connect the repository.
3. Runtime: **Node**.
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy. Render supplies the `PORT` environment variable automatically.

You can also deploy using the included Dockerfile by choosing the Docker runtime.

## Notes
- Anime titles, artwork, and metadata are fetched from the AniList public GraphQL API.
- The watchlist is stored in the visitor's browser (localStorage), not in a shared account.
- This starter is an anime discovery/catalog site. It does not host or provide unauthorized episode streams. A video player can be connected to videos you own or are authorized to use.
