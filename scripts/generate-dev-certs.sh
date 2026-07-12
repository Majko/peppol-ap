#!/bin/bash
set -e

mkdir -p nginx/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/CN=ap.mojafaktura.sk" \
    -addext "subjectAltName=DNS:localhost,DNS:ap.mojafaktura.sk"

echo "Dev certificates generated:"
echo "  Certificate: nginx/ssl/cert.pem"
echo "  Private key: nginx/ssl/key.pem"
