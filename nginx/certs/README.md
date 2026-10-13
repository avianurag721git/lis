# Place TLS certificates here:
#   fullchain.pem
#   privkey.pem
#
# Generate self-signed for local Docker:
#   openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
#     -keyout privkey.pem -out fullchain.pem \
#     -subj "/CN=localhost/O=DiagLab/C=IN"
#
# Or run: bash generate-self-signed.sh (from this directory)
