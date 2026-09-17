# Mobile infrastructure proposal

The files in this directory are retained for release review only. They are not
an automated deployment path and must not be applied as-is.

## Current evidence

- `https://app.myhausin.com` resolves to CloudFront and serves the placeholder
  stored in `mobile-placeholder/index.html`.
- The live response indicates an S3 origin behind CloudFront.
- This repository does not prove whether those resources were created manually
  or from a CloudFormation stack.
- The authoritative DNS records for `myhausin.com` are currently managed in
  Wix, not by the Route53 records declared in `mobile-app.yaml`.

## Gaps before production use

- `mobile-app.yaml` contains only an S3 origin. It has no `/api/*` behavior or
  Symfony backend origin, so the real mobile application cannot use same-origin
  API requests through this distribution yet.
- Existing S3, CloudFront, ACM, DNS, and ownership state must be inventoried
  before any stack is created, updated, or imported.
- A reviewed API behavior must disable caching, allow the required HTTP methods,
  and forward the `Authorization` header, query strings, and request bodies to
  the production Symfony origin.
- SPA fallback behavior must apply to frontend routes without converting real
  API errors into `index.html` responses.
- No database credentials belong in S3, CloudFront, the React build, or frontend
  environment variables. Symfony remains the only database-facing component.

The release chat owns infrastructure review, pull requests, deployment, and
production verification. No CloudFormation, S3, CloudFront, DNS, Nginx, or
database action is performed by committing these files.
