# Generate local TLS material for nginx (dev / staging only).
# Production: replace nginx/certs with real certificates (Let's Encrypt, ACM, etc.).
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -subj "/CN=localhost/O=DiagLab/C=IN"
