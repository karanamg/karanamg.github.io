# karanamg.github.io

A multi-project portfolio site published with GitHub Pages at **https://karanamg.github.io/**.

```
/
├── index.html          # Project gallery (rendered from projects.json)
├── projects.json       # Site settings + one entry per project  ← edit this to add projects
├── assets/             # Shared CSS/JS for the gallery
├── projects/
│   └── copperleaf-portal/   # One folder per project, fully self-contained
├── 404.html
└── .nojekyll           # Serve files as-is (no Jekyll processing)
```

## Add a new project

1. Create `projects/<your-slug>/` containing an `index.html`. Keep all its assets inside that folder and use **relative paths**, so it works under the `/projects/<slug>/` sub-path.
2. Add a `thumbnail.jpg` (16:10, about 1200 px wide) to the folder.
3. Add an entry to `projects.json`:
   ```json
   {
     "slug": "your-slug",
     "title": "Project title",
     "summary": "One or two sentences.",
     "highlights": ["Optional bullet", "Another"],
     "path": "projects/your-slug/",
     "thumbnail": "projects/your-slug/thumbnail.jpg",
     "source": "https://github.com/karanamg/karanamg.github.io/tree/main/projects/your-slug",
     "tags": ["Boomi", "API"],
     "date": "2026-12",
     "status": "Demo"
   }
   ```
4. Commit and push. GitHub Pages republishes within a minute or two.

The gallery sorts projects by `date` (newest first) and builds the tag filters automatically.

## Secrets

This repository is public. **Never commit credentials.** Projects that call protected APIs should use a local gateway that reads a git-ignored `.env`, as `projects/copperleaf-portal/gateway/` does, and publish a static snapshot for the hosted demo.
