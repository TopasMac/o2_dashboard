# Production deployment procedure

This is the single authoritative procedure for deploying to production. Read it before any deployment work. Other instruction files link here and do not duplicate the commands.

Production is read-only unless the user explicitly authorizes a precisely described action. Merging into `main` is not a deployment.

## Completion rule

A frontend deployment affecting the mobile app is not complete until S3 publishing, CloudFront invalidation, and mobile verification are finished.

`deploy.sh` ends with "Deployment complete!". That message covers the **server deployment only**. It does not publish the mobile app.

## Verified environment

These values were verified during the 2026-11-02 release (`9a39e7a`). Re-check the target before every future production action; do not assume they are unchanged.

| Item | Value |
| --- | --- |
| Production checkout | `/home/ubuntu/owners2_main` |
| Mobile domain | `app.myhausin.com` |
| Mobile S3 bucket | `app-myhausin-com-147997122630` (region `us-east-1`, versioning enabled) |
| CloudFront distribution | `ERCAJOUGBHL37` (origins include the S3 frontend and the `dashboard.owners2.com` backend) |
| EC2 role | `owners2-ec2-s3-role`: can upload to S3, but is denied `cloudfront:CreateInvalidation` |

## 1. Pre-deployment checks (production server)

1. Run `git status --short --branch`. If the checkout is dirty, stop; inventory and review the changes before pulling or deploying.
2. Record the current production commit with `git rev-parse --short HEAD`. This is the rollback point.
3. Confirm a current database backup, the exact target commit on `main`, and whether the release contains migrations (review the migration SQL).
4. Create a patch and a direct archive of any modified or untracked files before using a stash. Never discard, reset, overwrite, or reapply a production stash without reviewing it.
5. If a manual backup used `umask 077`, run it in a subshell or restore `umask 022` before deploying; otherwise new files can become unreadable by PHP-FPM or Nginx.
6. Obtain explicit deployment authorization.

## 2. Server deployment

```bash
umask 022
bash deploy.sh
git rev-parse --short HEAD    # must equal the target commit
git status --short --branch   # must be clean
```

Use `bash deploy.sh`, not `./deploy.sh` (the file is not executable on the server; do not `chmod +x` it). The script pulls `main`, installs dependencies, runs migrations, builds the frontend, publishes it into Symfony's `public/` directory, and restarts Nginx. It stops at the first failure; if it fails partway, do not re-run it blindly.

## 3. Mobile frontend publishing (required when the release changes the frontend)

The mobile app is served from S3 behind CloudFront, not from the server's `public/` directory. Run these from the production checkout after step 2, with the new `frontend/build/` in place. Each production-writing step requires explicit authorization.

1. Preview the supporting-file upload and review it:

   ```bash
   aws s3 sync frontend/build/ s3://app-myhausin-com-147997122630/ --exclude "index.html" --dryrun
   ```

2. Upload the supporting files:

   ```bash
   aws s3 sync frontend/build/ s3://app-myhausin-com-147997122630/ --exclude "index.html"
   ```

3. Only after step 2 succeeds, publish the entry page:

   ```bash
   aws s3 cp frontend/build/index.html s3://app-myhausin-com-147997122630/index.html --content-type "text/html" --cache-control "no-cache"
   ```

   Do not add `--delete`; existing assets must be retained.

4. Invalidate CloudFront:

   ```bash
   aws cloudfront create-invalidation --distribution-id ERCAJOUGBHL37 --paths "/*" --query 'Invalidation.{Id:Id,Status:Status}' --output table
   ```

   The EC2 role is denied this action. In the last release it was run from AWS CloudShell using the console identity. Do not assume the EC2 role can invalidate, and do not change IAM permissions without separate authorization.

5. Check completion using the ID returned by step 4:

   ```bash
   aws cloudfront get-invalidation --distribution-id ERCAJOUGBHL37 --id <INVALIDATION_ID> --query 'Invalidation.Status' --output text
   ```

   Wait for `Completed`.

## 4. Verification

- Server revision equals the target commit and the checkout is clean.
- Smoke-test the changed features, login, and API-backed functionality at `https://app.myhausin.com` and on the desktop app.
- Check the installed Home Screen app as well as Safari.

Known limitation: after the last release, Safari showed the new version while the existing Home Screen app kept the old one; deleting and reinstalling the shortcut resolved it. The cause has not been investigated. Do not describe service-worker caching as confirmed, and do not make reinstalling the shortcut the normal update procedure.

## 5. Rollback

Roll back to the commit recorded in step 1.2: check it out on the server, rebuild and republish the frontend, restart Nginx, and repeat the S3 publishing and CloudFront invalidation if the mobile app changed. S3 versioning is enabled on the bucket. Migrations need a separate, reviewed rollback plan.

## 6. After the release

- Fast-forward `develop` to `main` so the merge commit is on `develop`.
- Record the production commit and rollback point in `PROJECT_STATUS.md`, and update `FEATURE_INVENTORY.md` for kept, retired, or redesigned features.
