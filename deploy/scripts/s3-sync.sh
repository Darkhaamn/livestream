#!/bin/sh
set -eu

: "${S3_BUCKET:?S3_BUCKET is required}"
: "${AWS_REGION:=ap-southeast-1}"

export AWS_DEFAULT_REGION="$AWS_REGION"

echo "[s3-sync] $(date -Iseconds) syncing recordings..."
aws s3 sync /data/recordings "s3://${S3_BUCKET}/recordings" \
  --only-show-errors \
  --exclude "*.part" \
  --exclude "*.tmp"

echo "[s3-sync] $(date -Iseconds) syncing thumbnails..."
aws s3 sync /data/thumbnails "s3://${S3_BUCKET}/thumbnails" \
  --only-show-errors

echo "[s3-sync] done"
