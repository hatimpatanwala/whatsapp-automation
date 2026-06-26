#!/bin/bash
# Slow certbot retry for the new staging domain. Retries every 30 min (safely
# under Let's Encrypt's 5-failed-authz/hour limit) until DuckDNS propagates.
DOMAIN=staging-whatsappdemo.duckdns.org
for i in $(seq 1 16); do
  if sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --keep-until-expiring >>/tmp/certbot-retry.log 2>&1; then
    echo "SUCCESS $(date -u)" > /tmp/certbot-retry.status
    break
  else
    echo "FAIL attempt $i $(date -u)" > /tmp/certbot-retry.status
    sleep 1800
  fi
done
